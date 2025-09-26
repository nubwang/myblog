//chatService.js
const { querySql, transaction, pool  } = require('../../db/index');

class ChatService {
  // ========== 用户相关 ==========
  static async createUser(username, email, password) {
    const result = await querySql(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, password]
    );
    return result.insertId;
  }

  static async getUserByEmail(email) {
    const rows = await querySql(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  }

  // ========== 会话相关 ==========
  static async createPrivateConversation(userId, peerId) {
    return await transaction(async (connection) => {
      // 检查是否存在共享会话
      const [existing] = await connection.query(
        `SELECT conversation_id FROM conversations 
         WHERE (user_id = ? AND peer_id = ?) OR (user_id = ? AND peer_id = ?)
         AND peer_type = 'user'`,
        [userId, peerId, peerId, userId]
      );
 
      if (existing.length > 0) {
        return existing[0].conversation_id;
      }
 
      // 创建会话
      const [conv] = await connection.query(
        `INSERT INTO conversations 
         (user_id, peer_type, peer_id, created_at, updated_at)
         VALUES (?, 'user', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, peerId]
      );
      const convId = conv.insertId;
 
      // 初始化双方会话状态
      await connection.query(
        `INSERT INTO conversation_users 
         (conversation_id, user_id, unread_count, last_read_msg_id)
         VALUES (?, ?, 0, NULL), (?, ?, 0, NULL)`,
        [convId, userId, convId, peerId]
      );
 
      return convId;
    });
  }

  static async createGroupConversation(creatorId, name, userIds, avatar = null) {
    // 创建会话，增加 avatar 字段
    const result = await querySql(
      'INSERT INTO conversations (type, name, creator_id, avatar) VALUES ("group", ?, ?, ?)',
      [name, creatorId, avatar]
    );
    const conversationId = result.insertId;

    // 添加创建者（群主）
    await querySql(
      'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, "owner")',
      [conversationId, creatorId]
    );

    // 添加其他成员
    if (userIds && userIds.length > 0) {
      const placeholders = userIds.map(() => '(?, ?, "member")').join(',');
      const values = userIds.flatMap(id => [conversationId, id]);
      await querySql(
        `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ${placeholders}`,
        values
      );
    }

    return conversationId;
  }

  // ========== 消息相关 ==========
  static async sendMessage(conversation_id, sender_id, receiver_type, receiver_id, content_type, content) {
    return await transaction(async (connection) => {
      // 1. 验证发送者权限（修正表名及字段逻辑）
      if (receiver_type === 'group') {
        const [members] = await connection.query(
          `SELECT role FROM group_members 
          WHERE group_id = ? AND user_id = ?`,
          [receiver_id, sender_id]
        );
        if (!members.length) throw new Error('发送者不在群组中');
        if (members[0].role === 'banned') throw new Error('被禁言用户无法发送消息'); // 新增权限校验
      }

      // 2. 插入消息记录（新增状态同步）
      const [msgResult] = await connection.query(
        `INSERT INTO messages 
        (conversation_id, sender_id, receiver_type, receiver_id, 
          content_type, content, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [conversation_id, sender_id, receiver_type, receiver_id, 
        content_type, content, 'sending']
      );
      const messageId = msgResult.insertId;

      // 3. 更新发送方会话元数据
      await connection.query(
        `UPDATE conversations 
        SET last_msg_content = ?,
            last_msg_time = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ?`,
        [content, conversation_id]
      );

      // 4. 更新接收方状态（核心修正）
      if (receiver_type === 'user') {
        // 单聊场景：更新接收方未读计数
        await connection.query(
          `INSERT INTO conversation_users 
          (conversation_id, user_id, unread_count)
          VALUES (?, ?, 1)
          ON DUPLICATE KEY UPDATE 
            unread_count = unread_count + 1,
            last_read_msg_id = CASE 
                                WHEN last_read_msg_id < ? THEN ? 
                                ELSE last_read_msg_id 
                                END`,
          [conversation_id, receiver_id, messageId, messageId]
        );
      } else if (receiver_type === 'group') {
        // 群聊场景：批量更新成员状态
        await connection.query(
          `UPDATE conversation_users cu
          JOIN group_members gm ON cu.user_id = gm.user_id
          SET cu.unread_count = cu.unread_count + 1,
              cu.last_read_msg_id = CASE 
                                  WHEN cu.last_read_msg_id < ? THEN ? 
                                  ELSE cu.last_read_msg_id 
                                  END
          WHERE gm.group_id = ? 
            AND gm.user_id != ?
            AND cu.conversation_id = ?`,
          [messageId, messageId, receiver_id, sender_id, conversation_id]
        );
      }

      // 5. 同步消息状态（新增服务层逻辑）
      await connection.query(
        `UPDATE messages 
        SET status = 'sent' 
        WHERE msg_id = ?`,
        [messageId]
      );

      return messageId;
    });
  }

  // 标记消息已读
  static async markAsRead(userId, conversationId, lastMsgId) {
    await querySql(
      `UPDATE conversation_users 
       SET unread_count = 0,
           last_read_msg_id = ?
       WHERE conversation_id = ? AND user_id = ?`,
      [lastMsgId, conversationId, userId]
    );
  }

  static async getConversationMessages(conversationId, pageSize = 50, page = 0) {
    const rows = await querySql(
      `SELECT 
         m.*,
         u.username AS sender_username,
         u.avatar AS sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?`,
      [conversationId, pageSize, page * pageSize]
    );
    return rows;
  }
  static async getConversationMembers(conversationId) {
    const rows = await querySql(
      `SELECT 
         cm.user_id, 
         u.username, 
         u.avatar, 
         cm.role 
       FROM conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = ?`,
      [conversationId]
    );
    return rows;
  }
  // ========== 会话列表 ==========
  static async getUserConversations(userId) {
    const rows = await querySql(
      `SELECT 
         c.*,
         u.username, 
         u.avatar
       FROM conversations c
       JOIN users u ON u.id = COALESCE( NULLIF(c.peer_id, ?), c.user_id )
        WHERE c.user_id = ? OR c.peer_id = ?
       ORDER BY c.updated_at DESC`,
      [userId,userId,userId]
    );
    return rows;
  }
}

module.exports = ChatService;