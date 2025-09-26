// message.js
const { getRedisClient } = require('../../db/redis');
const { querySql, transaction, pool  } = require('../../db/index');
const ChatService = require('./chatService'); // 全量引入

class SocketMessageHandler {
  constructor(io, connectionManager, historyManager) {
    this.io = io;
    this.connectionManager = connectionManager;
    this.historyManager = historyManager;
    this.redis = getRedisClient();
  }

  /**
   * 绑定消息事件
   * @param {Socket} socket
   */
  bindEvents(socket) {
    const { userId } = socket;

    // 初始化信息
    socket.on('init', async ({ userId }) => {
      const userSocketId = await this.redis.hGet('socket:socket', String(userId));
      const friendPending = await querySql(
        `SELECT u.id, u.username, u.head_img, f.notes 
         FROM users u 
         JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'pending')`, 
        [userId]
      );
      const friendAccepted = await querySql(
        `SELECT u.id, u.username, u.head_img 
         FROM users u 
         JOIN friendships f ON (u.id = f.friend_id AND f.user_id = ? AND f.status = 'accepted')
         UNION 
         SELECT u.id, u.username, u.head_img 
         FROM users u 
         JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'accepted')`, 
        [userId, userId]
      );
      this.io.to(userSocketId).emit('init', { code: 200, data: { friendPending, friendAccepted } });
    });

    // 好友请求
    socket.on('addFriend', async ({ userId, friendId, notes }) => {
      try {
        const friendSocketId = await this.redis.hGet('socket:socket', String(friendId));
        const userSocketId = await this.redis.hGet('socket:socket', String(userId));
        await querySql(
          'INSERT INTO friendships (user_id, friend_id, notes) VALUES (?, ?, ?)', 
          [userId, friendId, notes ? notes : "[]"]
        );
        if (friendSocketId) {
          this.io.to(friendSocketId).emit('addFriendNotice', { code: 200, data: { from: userId, notes } });
        }
        this.io.to(userSocketId).emit('notice', { code: 200, message: '发送好友请求成功！！！' });
      } catch (error) {
        console.error('addFriend error:', error);
        if (error.code === "ER_DUP_ENTRY") {
          this.io.to(socket.id).emit('notice', { code: 200, message: '已经发送成功了,不要重复发送!' });
        } else {
          this.io.to(socket.id).emit('notice', { code: 500, message: '好友请求失败' });
        }
      }
    });

    // 创建新私聊会话 
    socket.on('createChatSession', async ({ userId, peerId}) => {
      try {
        const convId = await ChatService.createPrivateConversation(userId, peerId);
        if (convId) {
          this.io.to(socket.id).emit('chatSessionCreated', { code: 200, data: { conversation_id: convId } });
        } else {
          this.io.to(socket.id).emit('notice', { code: 500, message: '创建会话失败' });
        }
      } catch (error) {
        console.error('createChatSession error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '创建会话异常' });
      }
    });

    // 创建群聊
    socket.on('createGroup', async ({ creatorId, name, userIds, avatar = null }) => {
      try {
        const conversationId = await ChatService.createGroupConversation(creatorId, name, userIds, avatar);
        if (conversationId) {
          this.io.to(socket.id).emit('groupCreated', { code: 200, conversationId });
        } else {
          this.io.to(socket.id).emit('notice', { code: 500, message: '创建群聊失败' });
        }
      } catch (error) {
        console.error('createGroup error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '创建群聊异常' });
      }
    });

    // 发送消息
    socket.on('sendMessage', async ({ conversation_id, sender_id, receiver_type, receiver_id, content_type, content}) => {
      console.log('当前命名空间:', socket.nsp.name);
      try {
        // 1. 验证双方socket ID
        const [senderSocketId, receiverSocketId] = await Promise.all([
          this.redis.hGet('socket:socket', String(sender_id)),
          this.redis.hGet('socket:socket', String(receiver_id))
        ]);
    
        console.log('Socket ID映射:', { sender_id, senderSocketId, receiver_id, receiverSocketId });
    
        // 2. 发送消息到数据库
        const messageId = await ChatService.sendMessage(conversation_id, sender_id, receiver_type, receiver_id, content_type, content);
        if (!messageId) throw new Error('消息保存失败');
    
        // 3. 构建消息数据
        const messageData = {
          code: 200,
          data: { conversation_id, sender_id, receiver_type, receiver_id, content_type, content, messageId }
        };
    
        // 4. 发送给接收方（如果在线）
        if (receiverSocketId) {
          const sockets = await this.io.fetchSockets();
          console.log('活跃的接收者sockets:', sockets.map(s => s.id));
          
          if (sockets.length > 0) {
            this.io.to(receiverSocketId).emit('newMessage', messageData);
            console.log('已发送给接收者:', receiver_id);
          } else {
            console.log('接收者socket已断开但Redis未更新:', receiver_id,receiverSocketId);
          }
        }
    
        // 5. 发送给发送方（回显）
        if (senderSocketId && senderSocketId !== receiverSocketId) {
          this.io.to(senderSocketId).emit('newMessage', messageData);
        }
    
      } catch (error) {
        console.error('消息发送全过程错误:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '消息发送失败' });
      }
    });

    // 获取会话消息
    socket.on('getConversationMessages', async ({ conversationId, pageSize = 50, page = 0 }) => {
      try {
        const messages = await ChatService.getConversationMessages(conversationId, pageSize, page);
        this.io.to(socket.id).emit('conversationMessages', { code: 200, conversationId, messages });
      } catch (error) {
        this.io.to(socket.id).emit('notice', { code: 500, message: '获取消息失败' });
      }
    });

    // 获取会话成员
    socket.on('getConversationMembers', async ({ conversationId }) => {
      try {
        const members = await ChatService.getConversationMembers(conversationId);
        this.io.to(socket.id).emit('conversationMembers', { code: 200, conversationId, members });
      } catch (error) {
        console.error('getConversationMembers error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '获取成员失败' });
      }
    });
    // 获取会话列表
    socket.on('getConversationList', async ({ userId }) => {
      try {
        const userSocketId = await this.redis.hGet('socket:socket', String(userId));
        const list = await ChatService.getUserConversations(userId);
        this.io.to(userSocketId).emit('ConversationList', { code: 200, data: list });
      } catch (error) {
        console.error('getConversationMembers error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '获取成员失败' });
      }
    });

    // 其它事件...
  }
}

module.exports = SocketMessageHandler;