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
      console.log(userId,"initinitinitinitinitinitinitinit")
      await ChatService.deactivateAllConversations(userId);
    });
    
    // 初始化好友信息
    socket.on('friendInit', async ({ userId }) => {
      // console.log(this.io.in(String(46)).allSockets(), "this.io.in(String(46)).allSockets()")
      const friendPending = await querySql(
        `SELECT u.id, u.username,u.nickname, u.head_img, f.notes 
         FROM users u 
         JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'pending')`, 
        [userId]
      );
      const friendAccepted = await querySql(
        `SELECT u.id, u.username,u.nickname, u.head_img 
         FROM users u 
         JOIN friendships f ON (u.id = f.friend_id AND f.user_id = ? AND f.status = 'accepted')
         UNION 
         SELECT u.id, u.username,u.nickname, u.head_img 
         FROM users u 
         JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'accepted')`, 
        [userId, userId]
      );
      this.io.to(socket.id).emit('friendInit', { code: 200, data: { friendPending, friendAccepted } });
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

    socket.on("forceJoinRoom", ({ roomId, conversationId }) => {
      try {
        console.log(roomId, conversationId,socket.id,'roomId, conversationId')
        socket.join(String(roomId)); // 加入目标房间
        this.io.to(socket.id).emit('groupCreated', { code: 200, conversationId });
      } catch (error) {
        console.error('forceJoinRoom error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '加入房间异常' });
      }
    });

    // 创建群聊
    socket.on('createGroup', async ({ creatorId, groupName, memberIds, avatar }) => {
      console.debug('创建群聊请求:', { creatorId, groupName, memberIds, socket:socket.id });
      try {
        const { groupId, conversationId } =  await ChatService.createGroupConversation(creatorId, groupName, memberIds, avatar, this.io);
        await ChatService.createRoom(groupId, creatorId, groupName, memberIds, 500, avatar, this.io, conversationId); // 异步调用不等待结果
        const newMemberIds = [creatorId, ...memberIds];
        for (const userId of newMemberIds) {
          const socketId = await ChatService.getSocketId(userId);
          console.log('createRoom socketId:', socketId);
          // 通过 Redis 适配器广播到所有进程
          if(socketId){
            console.log('createRoom joining socketId----------1111111223:', socketId);
            const userSocketId = await this.redis.hGet('socket:socket', String(userId));
            console.log('redis userSocketId----------1111111223:', userSocketId);
            await this.io.to(socketId).socketsJoin(String(groupId));
            await this.io.to(socketId).emit('groupCreated', { code: 200, conversationId });
          }
        }
      } catch (error) {
        console.error('createGroup error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '创建群聊异常' });
      }
    });

    // 发送消息
    socket.on('sendMessage', async ({file, conversation_id, sender_id, receiver_type, receiver_id, content_type, content,sender_avatar,sender_name }) => {
      console.debug('消息发送请求:', { conversation_id, sender_id, receiver_type, receiver_id,content_type, content,file });
      try {
        if(content_type == "image"){
          content = await ChatService.uploadImageToCOS(file,content);
        } 
        // 公共消息处理逻辑
        const messageId = await ChatService.sendMessage(
          conversation_id, 
          sender_id, 
          receiver_type, 
          receiver_id, 
          content_type, 
          content,
        );
        console.log('消息保存成功，消息ID:', messageId);
        if (!messageId) throw new Error('MESSAGE_SAVE_FAILURE');

        // 根据接收方类型路由处理
        if (receiver_type === "user") {
          await ChatService.handleUserMessage(sender_id, receiver_id, messageId, this.io);
        } else if (receiver_type === "group") {
          await ChatService.handleGroupMessage(sender_id, receiver_id, messageId,this.io,socket);
        } else {
          throw new Error('INVALID_RECEIVER_TYPE');
        }
        
      } catch (error) {
        console.error('消息发送失败:', error.message);
        const errorMap = {
          'MESSAGE_SAVE_FAILURE': '消息保存失败',
          'RECEIVER_OFFLINE': '接收方不在线',
          'INVALID_RECEIVER_TYPE': '无效接收方类型'
        };
        
        this.io.to(socket.id).emit('notice', {
          code: 500,
          message: errorMap[error.message] || '消息发送异常'
        });
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

    // 加入房间
    socket.on("join_room", async ({ roomId, userId }) => {
      await joinRoom(roomId, userId);
      socket.join(roomId);
    });

    // 离开房间
    socket.on("leave_room", async ({ roomId, userId }) => {
      await leaveRoom(roomId, userId);
      socket.leave(roomId);
    });

    //获取群成员列表
    socket.on("get_group_members", async ({ groupId }) => {
      try {
        const members = await ChatService.getGroupInformation(groupId);
        this.io.to(socket.id).emit('groupMembers', { code: 200, groupInfo:members });
      } catch (error) {
        console.error('getGroupMembers error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '获取群成员失败' });
      }
    });

    //激活会话
    socket.on("activate_conversation", async ({ conversationId, userId }) => {
      // console.log('激活会话请求参数:', { conversationId, userId });
      try {
        await ChatService.activateConversation(conversationId, userId);
        this.io.to(socket.id).emit('conversationActivated', { code: 200, message: '会话已激活', data: { conversationId, userId } });
      } catch (error) {
        console.error('activateConversation error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '激活会话失败' });
      }
    });

    //获取单独conversations表的信息
    socket.on("get_conversation_info", async ({ conversationId,userId }) => {
      // console.log('获取会话信息请求参数:', { conversationId ,userId});
      try {
        const conversationInfo = await ChatService.getUserConversationsOne(conversationId,userId);
        this.io.to(socket.id).emit('conversationInfo', { code: 200, data: conversationInfo });
      } catch (error) {
        console.error('getConversationById error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '获取会话信息失败' });
      }
    });

    socket.on("get_conversation_info_all", async ({ conversationId,userId }) => {
      // console.log('获取会话信息请求参数:', { conversationId ,userId});
      try {
        const conversationInfo = await ChatService.getUserConversationsOne(conversationId, userId);
        this.io.to(socket.id).emit('conversationInfo', { code: 200, data: conversationInfo });
      } catch (error) {
        console.error('getConversationById error:', error);
        this.io.to(socket.id).emit('notice', { code: 500, message: '获取会话信息失败' });
      }
    });

    // 其它事件...
  }
}

module.exports = SocketMessageHandler;