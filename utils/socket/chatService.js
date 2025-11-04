//chatService.js
const { querySql, transaction, pool  } = require('../../db/index');
const { getRedisClient } = require('../../db/redis');
const redis = getRedisClient();
//给以下所有代码添加注释
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

  static async createRoom(roomId, creatorId, groupName, memberIds, maxMembers = 500, avatar = null, io = null, conversationId = null) {
    if (io) {
      const newMemberIds = [creatorId, ...memberIds];
      for (const userId of newMemberIds) {
        const socketId = await this.getSocketId(userId);
        console.log('createRoom socketId:', socketId);
        // 通过 Redis 适配器广播到所有进程
        if(socketId){
          await io.to(socketId).emit("forceJoinRoom", { code: 200, roomId,conversationId });
        }
      }
    }
    // 存储房间基础信息
    await redis.hmset(`socket:room:${roomId}`, {
      roomId: roomId,
      name: groupName,
      creator: creatorId,
      max_members: maxMembers,
      created_at: new Date().toISOString(),
      avatar: avatar
    });
    const roomExists = await redis.exists(`socket:room:${roomId}`);
    console.log('joinRoom2 roomExists:', roomExists);
    await redis.sAdd(`socket:room:${roomId}:members`, creatorId);
    // 记录用户所属房间
    await redis.sAdd(`socket:user:${creatorId}:rooms`, roomId);
    for (const memberId of memberIds) {
      // 初始化成员集合（包含创建者）
      await redis.sAdd(`socket:room:${roomId}:members`, memberId);
      // 记录用户所属房间
      await redis.sAdd(`socket:user:${memberId}:rooms`, roomId);
    }
  
    // 设置房间过期时间（7天不活跃自动删除）
    await redis.expire(`socket:room:${roomId}`, 14 * 24 * 60 * 60);
  }

  static async createGroupConversation(creatorId, groupName = "群聊", memberIds = [], avatar = null, io = null) {
    return await transaction(async (connection) => {
      // 1. 创建群组
      const [groupResult] = await connection.query(
        `INSERT INTO pc_groups 
         (group_name, creator_id, avatar_url, created_at, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [groupName, creatorId, avatar]
      );
      const groupId = groupResult.insertId;
      
 
      // 2. 创建群会话
      const [convResult] = await connection.query(
        `INSERT INTO conversations 
         (user_id, peer_type, peer_id, created_at, updated_at)
         VALUES (?, 'group', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [creatorId, groupId]
      );
      const conversationId = convResult.insertId;
 
      // 3. 添加群主（创建者）到群组成员表
      await connection.query(
        `INSERT INTO group_members 
         (group_id, user_id, role, join_time) 
         VALUES (?, ?, 'owner', CURRENT_TIMESTAMP)`,
        [groupId, creatorId]
      );
 
      // 4. 初始化群主的会话用户记录
      await connection.query(
        `INSERT INTO conversation_users 
         (conversation_id, user_id, unread_count, last_read_msg_id)
         VALUES (?, ?, 0, NULL)`,
        [conversationId, creatorId]
      );
 
      // 5. 添加其他成员
      if (memberIds && memberIds.length > 0) {
        // 批量插入群成员
        const memberPlaceholders = memberIds.map(() => '(?, ?, "member", CURRENT_TIMESTAMP)').join(',');
        const memberValues = memberIds.flatMap(id => [groupId, id]);
        
        await connection.query(
          `INSERT INTO group_members 
           (group_id, user_id, role, join_time) 
           VALUES ${memberPlaceholders}`,
          memberValues
        );
 
        // 批量初始化成员的会话用户记录
        const convUserPlaceholders = memberIds.map(() => '(?, ?, 0, NULL)').join(',');
        const convUserValues = memberIds.flatMap(id => [conversationId, id]);
        
        await connection.query(
          `INSERT INTO conversation_users 
           (conversation_id, user_id, unread_count, last_read_msg_id)
           VALUES ${convUserPlaceholders}`,
          convUserValues
        );
      }
 
      return {
        groupId,
        conversationId
      };
    });
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
        // 单聊场景：is_active为false时更新接收方未读计数
        await connection.query(
          `UPDATE conversation_users 
          SET unread_count = CASE WHEN is_active = FALSE THEN unread_count + 1 ELSE unread_count END,
              last_read_msg_id = CASE 
                                  WHEN last_read_msg_id < ? THEN ? 
                                  ELSE last_read_msg_id 
                                  END
          WHERE user_id = ? AND conversation_id = ? AND is_visible = 1`,
          [messageId, messageId, receiver_id, conversation_id]
        );
        // await connection.query(
        //   `INSERT INTO conversation_users 
        //   (conversation_id, user_id, unread_count)
        //   VALUES (?, ?, 1)
        //   ON DUPLICATE KEY UPDATE 
        //     unread_count = unread_count + 1,
        //     last_read_msg_id = CASE 
        //                         WHEN last_read_msg_id < ? THEN ? 
        //                         ELSE last_read_msg_id 
        //                         END`,
        //   [conversation_id, receiver_id, messageId, messageId]
        // );
      } else if (receiver_type === 'group') {
        // 群聊场景：批量更新成员is_active为false时状态
        await connection.query(
          `UPDATE conversation_users cu
          JOIN group_members gm ON cu.user_id = gm.user_id
          SET cu.unread_count = CASE WHEN cu.is_active = FALSE THEN unread_count + 1 ELSE unread_count END,
              cu.last_read_msg_id = CASE 
                                    WHEN cu.last_read_msg_id < ? THEN ? 
                                    ELSE cu.last_read_msg_id 
                                    END
          WHERE gm.group_id = ? 
            AND cu.conversation_id = ? 
            AND cu.user_id != ?
            AND cu.is_visible = 1`,
          [messageId, messageId, receiver_id, conversation_id, sender_id]
        );
        // await connection.query(
        //   `UPDATE conversation_users cu
        //   JOIN group_members gm ON cu.user_id = gm.user_id
        //   SET cu.unread_count = cu.unread_count + 1,
        //       cu.last_read_msg_id = CASE 
        //                           WHEN cu.last_read_msg_id < ? THEN ? 
        //                           ELSE cu.last_read_msg_id 
        //                           END
        //   WHERE gm.group_id = ? 
        //     AND gm.user_id != ?
        //     AND cu.conversation_id = ?`,
        //   [messageId, messageId, receiver_id, sender_id, conversation_id]
        // );
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

  static async getConversationMessages(conversationId, pageSize = 50, page = 0) {
    const rows = await querySql(
      `SELECT 
         m.*,
         u.nickname,
         u.username AS sender_username,
         u.avatar AS sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?`,
      [conversationId, pageSize, page * pageSize]
    );
    // console.log('getConversationMessages result count:', rows);
    return rows;
  }

  // 获取用户的会话列表（包含群聊和单聊）
  static async getUserConversations(userId) {
    const rows = await querySql(
      `SELECT 
        c.*,
        u.nickname,
        IF(c.peer_type = 'user', u.username, g.group_name) AS username,
        IF(c.peer_type = 'user', u.avatar, g.avatar_url) AS avatar,
        g.group_name AS group_name,
        g.avatar_url AS group_avatar,
        cu.unread_count,
        cu.last_read_msg_id
      FROM conversations c
      LEFT JOIN conversation_users cu ON cu.conversation_id = c.conversation_id AND cu.user_id = ?
      LEFT JOIN users u ON u.id = COALESCE( NULLIF(c.peer_id, ?), c.user_id )
      LEFT JOIN pc_groups g 
        ON c.peer_type = 'group' AND g.group_id = c.peer_id
      WHERE 
        c.user_id = ? OR c.peer_id = ? OR
        (c.peer_type = 'group' AND EXISTS (
          SELECT 1 FROM group_members 
          WHERE group_id = c.peer_id AND user_id = ?
        )) AND cu.is_visible = 1
      ORDER BY 
        c.is_top DESC, 
        c.updated_at DESC`,
      [userId, userId, userId, userId,userId] // 三个参数对应三个?
    );
    return rows;
  }

  // 获取用户的指定会话列表（包含群聊和单聊）
  static async getUserConversationsOne(conversationId, userId) {
    const rows = await querySql(
      `SELECT 
        c.*,
        u.nickname,
        IF(c.peer_type = 'user', u.username, g.group_name) AS username,
        IF(c.peer_type = 'user', u.avatar, g.avatar_url) AS avatar,
        g.group_name AS group_name,
        g.avatar_url AS group_avatar,
        cu.unread_count,
        cu.last_read_msg_id
      FROM conversations c
      LEFT JOIN conversation_users cu ON cu.conversation_id = c.conversation_id AND cu.user_id = ?
      LEFT JOIN users u ON u.id = COALESCE( NULLIF(c.peer_id, ?), c.user_id )
      LEFT JOIN pc_groups g 
        ON c.peer_type = 'group' AND g.group_id = c.peer_id
      WHERE 
        (c.user_id = ? OR c.peer_id = ? OR
        (c.peer_type = 'group' AND EXISTS (
          SELECT 1 FROM group_members 
          WHERE group_id = c.peer_id AND user_id = ?
        ))) AND cu.is_visible = 1 AND c.conversation_id = ?`,
      [userId, userId, userId, userId,userId,conversationId] // 三个参数对应三个?
    );
    return rows[0];
  }

  //创建群聊批量用户加入房间


  //批量新用户加入房间
  static async joinRoom(roomId, userIds, io) {
    if(io){
      for (const userId of userIds) {
        const socketId = await this.getSocketId(userId);
        if(socketId){
          const socket = await io.sockets.sockets.get(socketId);
          if(socket){
            socket.join(roomId);
          }
        }
      }
    }
    // 检查房间是否存在 socket:room:${roomId}
    const roomExists = await redis.exists(`socket:room:${roomId}`);
    console.log('joinRoom roomExists:', roomExists);
    if (!roomExists) throw new Error("Room not found");
    
    for (const userId of userIds) {
      // 初始化成员集合（包含创建者）
      await redis.sAdd(`socket:room:${roomId}:members`, memberId);
      // 记录用户所属房间
      await redis.sAdd(`socket:user:${memberId}:rooms`, roomId);
    }
  
    // 更新房间最后活跃时间
    await redis.set(`socket:room:${roomId}:active`, new Date().toISOString());
  }

  //用户离开房间
   static async leaveRoom(roomId, userId, io) {
    if(io){
      const socketId = await this.getSocketId(userId);
      if(socketId){
        const socket = await io.sockets.sockets.get(socketId);
        if(socket){
          socket.leave(`room:${roomId}`);
        }
      }
    }
    // 从成员集合移除
    await redis.srem(`socket:room:${roomId}:members`, userId);
  
    // 从用户房间列表移除
    await redis.srem(`socket:user:${userId}:rooms`, roomId);
  
    // 检查房间是否为空（自动清理）
    const memberCount = await redis.scard(`socket:room:${roomId}:members`);
    if (memberCount === 0) {
      await redis.del(`socket:room:${roomId}`);
      await redis.del(`socket:room:${roomId}:members`);
    }
  }

  //获取房间成员列表
  static async getRoomMembers(roomId) {
    return redis.sMembers(`socket:room:${roomId}:members`);
  }

  static async updateRoomExpiry(roomId) {
    // 获取当前最后活跃时间
    const lastActive = await redis.get(`socket:room:${roomId}:active`);
    
    // 如果房间存在且活跃，重置过期时间
    if (lastActive) {
      // 计算新的过期时间：7天后
      const expireTime = 7 * 24 * 60 * 60;
      // 原子操作：设置键值+过期时间
      await redis.multi()
        .set(`socket:room:${roomId}:active`, new Date().toISOString())
        .expire(`socket:room:${roomId}`, expireTime)
        .exec();
    }
  }

  // 用户消息处理
  static async handleUserMessage(senderId, receiverId, messageData, io) {
    // 批量获取socket映射（带缓存优化）
    const [senderSocketId, receiverSocketId] = await Promise.all([
      this.getSocketId(senderId),
      this.getSocketId(receiverId)
    ]);
  
    // 接收方在线校验
    if (receiverSocketId && await this.isSocketConnected(receiverSocketId, io)) {
      io.to(receiverSocketId).emit('newMessage', messageData);
      console.debug(`用户消息送达: ${receiverId}`);
    } else {
      throw new Error('RECEIVER_OFFLINE');
    }
  
    // 发送方回显（排除自收自发场景）
    if (senderSocketId && senderSocketId !== receiverSocketId) {
      io.to(senderSocketId).emit('newMessage', messageData);
    }
  }
  
  // 群组消息处理
  // 修改后的群组消息处理函数
static async handleGroupMessage(senderId, groupId, messageData, io,socket) {
  const group = await this.findGroup(groupId);
  if (!group) throw new Error('GROUP_NOT_FOUND');

  
  // 获取群组成员的socket ID列表
  const memberSocketIds = await Promise.all(
    group.members.map(memberId => this.getSocketId(memberId))
  );

  // 过滤有效socket并检查连接状态
  const validSockets = (await Promise.allSettled(
    memberSocketIds.map(async socketId => ({
      socketId,
      connected: socketId && await this.isSocketConnected(socketId, io)
    }))
  )).filter(result => 
    result.status === 'fulfilled' && result.value.connected
  ).map(result => result.value.socketId);
  console.log(validSockets,'validSockets');
  // 发送消息给在线成员
  if (validSockets.length > 0) {
    io.to(String(groupId)).emit('newMessage', messageData);
  }
  
  // 发送方回显
  // const senderSocketId = await this.getSocketId(senderId);
  // if (senderSocketId) {
  //   io.to(senderSocketId).emit('newMessage', messageData);
  // }
}

  // 工具函数：获取用户socket ID（带缓存优化）
  static async getSocketId(userId) {
      // 实际项目中可加入缓存逻辑
      return redis.hGet('socket:socket', String(userId));
    }

    // 工具函数：校验socket连接状态
  static async isSocketConnected(socketId, io) {
    const sockets = await io.fetchSockets();
    return sockets.some(s => s.id === socketId);
  }

  static async findGroup(groupId) {
    // 1. 优先从 Redis 缓存读取（使用与房间结构一致的键）
    const cacheKey = `socket:room:${groupId}`;
    const cachedRoom = await redis.hGetAll(cacheKey);
    
    if (cachedRoom) {
      return {
        ...cachedRoom,
        members: await this.getRoomMembers(groupId) // 补充成员列表
      };
    }
    
    // 2. Redis 无缓存时查询 MySQL 数据库
    const [group] = await querySql(
      'SELECT group_id, group_name, creator_id, avatar_url, created_at, updated_at FROM pc_groups WHERE group_id = ?',
      [groupId]
    );
    
    if (!group) return null;
    
    // 3. 将结果写入 Redis 缓存，并设置过期时间（1小时）
    await redis.multi()
      .hmset(cacheKey, {
        roomId: group.group_id,
        name: group.group_name,
        creator: group.creator_id,
        max_members: 500, // 默认值，可根据业务调整
        created_at: group.created_at,
        avatar: group.avatar_url || ''
      })
      .expire(cacheKey, 3600)
      .exec();
    
    // 4. 返回包含成员列表的完整群组信息
    return {
      ...group,
      members: await this.getRoomMembers(groupId)
    };
  }

  //获取群聊成员以及群聊信息 getGroupInformation
  static async getGroupInformation(groupId) {
    // 1. 优先尝试获取群组基础信息缓存
    const groupCacheKey = `group:info:${groupId}`;
    const cachedGroupInfo = await redis.get(groupCacheKey);
    
    let groupInfo;
    if (cachedGroupInfo) {
      groupInfo = JSON.parse(cachedGroupInfo);
    } else {
      // 2. 缓存未命中时查询数据库
      const groupInfoResult = await querySql(
        `SELECT group_name, avatar_url, announcement 
        FROM pc_groups 
        WHERE group_id = ?`,
        [groupId]
      );
      
      groupInfo = groupInfoResult[0] || {};
      
      // 3. 原子性写入群组基础信息缓存（1小时过期）
      await redis.multi(multi => {
        multi.set(
          groupCacheKey,
          JSON.stringify(groupInfo),
          { EX: 3600 }
        );
      });
    }

    // 4. 成员列表始终从数据库查询（不缓存）
    const members = await querySql(
      `SELECT u.id, u.username,u.nickname, u.avatar, gm.role
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY FIELD(role, 'owner', 'admin', 'member')`,
      [groupId]
    );

    // 5. 构建最终响应
    return {
      ...groupInfo,
      members: members || [] // 始终使用实时查询的成员数据
    };
  }

  //激活会话,更新未读数以及取消其它的激活
  static async activateConversation(conversationId, userId) {
    console.log('Activating conversation:', { userId, conversationId });
    return await transaction(async (connection) => {
      // 1. 取消用户所有会话的激活状态
      await connection.query(
        `UPDATE conversation_users 
         SET is_active = FALSE 
         WHERE user_id = ?`,
        [userId]
      );
  
      // 2. 激活指定会话
      await connection.query(
        `UPDATE conversation_users 
         SET is_active = TRUE, unread_count = 0 
         WHERE conversation_id = ? AND user_id = ?`,
        [conversationId, userId]
      );
    });
  }

  //取消所有激活会话
  static async deactivateAllConversations(userId) {
    return await querySql(
      `UPDATE conversation_users 
       SET is_active = FALSE 
       WHERE user_id = ?`,
      [userId]
    );
  }

  //获取单独conversations表的信息以及未读数
  static async getConversationById(conversationId, userId) {
    const rows = await querySql(
      `SELECT 
        c.*,
        cu.unread_count,
        cu.last_read_msg_id
      FROM conversations c
      LEFT JOIN conversation_users cu 
        ON cu.conversation_id = c.conversation_id AND cu.user_id = ?
      WHERE c.conversation_id = ?`,
      [userId, conversationId]
    );
    return rows[0];
  }
  
}

module.exports = ChatService;

