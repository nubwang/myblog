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
  static async createPrivateConversation(userId, peerType, peerId) {
    // 动态构建查询条件：当peerType为'user'时自动检查双向会话
    const queryConditions = `
      (user_id = ? AND peer_type = ? AND peer_id = ?)
      ${peerType === 'user' ? 'OR (user_id = ? AND peer_type = "user" AND peer_id = ?)' : ''}
    `;
    // 参数数组：基础参数 + 双向检查时的反向参数
    const params = [userId, peerType, peerId];
    if (peerType === 'user') {
      params.push(peerId, userId);  // 修正反向查询参数顺序
    }
    
    // 执行合并查询
    let conversations = await querySql(
      `SELECT conversation_id, user_id, peer_id 
      FROM conversations 
      WHERE ${queryConditions}`,
      params
    );

    if (conversations.length > 0) {
      // 更新会话状态（无论哪个方向存在都更新）
      await querySql(
        `UPDATE conversations 
        SET updated_at = CURRENT_TIMESTAMP, unread_count = 0
        WHERE conversation_id = ?`,
        [conversations[0].conversation_id]
      );
      return conversations[0];
    }

    // 创建新会话逻辑（保持原有创建逻辑）
    const newConvId = await querySql(
      `INSERT INTO conversations 
      (user_id, peer_type, peer_id, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, peerType, peerId]
    );
    return { conversation_id: newConvId, user_id: userId, peer_id: peerId };
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
      // 1. 验证发送者权限（群组场景）
      if (receiver_type === 'group') {
        const [members] = await connection.query(
          'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
          [conversation_id, sender_id]
        );
        if (!members.length) {
          throw new Error('发送者不在群组中');
        }
      }
  
      // 2. 插入消息记录
      const [msgResult] = await connection.query(
        `INSERT INTO messages 
        (conversation_id, sender_id, receiver_type, receiver_id, content_type, content)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [conversation_id, sender_id, receiver_type, receiver_id, content_type, content]
      );
      const messageId = msgResult.insertId;
  
      // 3. 更新发送方会话记录
      await connection.query(
        `UPDATE conversations SET
        last_msg_id = ?,
        last_msg_content = ?,
        last_msg_time = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
        WHERE conversation_id = ?`,
        [messageId, content, conversation_id]
      );
  
      // 4. 处理接收方更新（优化后的批量操作）
      if (receiver_type === 'user') {
        // 单聊场景
        await connection.query(
          `INSERT INTO conversations 
          (user_id, peer_type, peer_id, last_msg_id, last_msg_content, unread_count)
          VALUES (?, 'user', ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE
          last_msg_id = VALUES(last_msg_id),
          last_msg_content = VALUES(last_msg_content),
          unread_count = unread_count + 1,
          updated_at = CURRENT_TIMESTAMP`,
          [receiver_id, sender_id, messageId, content]
        );
      } else if (receiver_type === 'group') {
        // 群聊场景（批量更新优化）
        await connection.query(
          `INSERT INTO conversations 
          (user_id, peer_type, peer_id, last_msg_id, last_msg_content, unread_count)
          SELECT cm.user_id, 'group', ?, ?, ?, 1
          FROM conversation_members cm
          WHERE cm.conversation_id = ? AND cm.user_id != ?
          ON DUPLICATE KEY UPDATE
          last_msg_id = VALUES(last_msg_id),
          last_msg_content = VALUES(last_msg_content),
          unread_count = unread_count + 1,
          updated_at = CURRENT_TIMESTAMP`,
          [receiver_id, messageId, content, conversation_id, sender_id]
        );
      }
  
      return messageId;
    });
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