const { getRedisClient } = require('../../db/redis');
const querySql = require('../../db/index')
class SocketMessageHandler {
  constructor(io, connectionManager, historyManager) {
    this.io = io;
    this.connectionManager = connectionManager;
    this.historyManager = historyManager;
    this.redis = getRedisClient();
  }
  //
//   CREATE TABLE groups (
//   id INT PRIMARY KEY AUTO_INCREMENT,
//   name VARCHAR(100) NOT NULL,
//   notice TEXT,
//   avatar VARCHAR(255),
//   type ENUM('public', 'private') DEFAULT 'public',
//   status ENUM('active', 'inactive') DEFAULT 'active',
//   description TEXT,
//   creator_id INT NOT NULL,
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );

// CREATE TABLE group_members (
//   group_id INT,
//   user_id INT,
//   PRIMARY KEY (group_id, user_id)
// );

  /**
   * 绑定消息事件
   * @param {Socket} socket
   */
  bindEvents(socket) {
    const { userId } = socket;
    // console.log(userId,"userId, toUserId, message")
    //初始化信息
    socket.on('init', async ({ userId }) => {
      const user = await this.redis.hGet('socket:socket', userId+"");
      const friendPending = await querySql( `SELECT u.id, u.username, u.head_img, f.notes FROM users u JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'pending')`, [userId] );
      const friendAccepted = await querySql( `SELECT u.id, u.username, u.head_img FROM users u JOIN friendships f ON (u.id = f.friend_id AND f.user_id = ? AND f.status = 'accepted') UNION SELECT u.id, u.username, u.head_img FROM users u JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'accepted')`, [userId, userId] );
      console.log(friendPending,friendAccepted,"rows",userId)
      this.io.to(user).emit('init', { code: 200,data: {
        friendPending: friendPending,
        friendAccepted: friendAccepted,
      } });
      
    });
    //好友请求
    socket.on('addFriend', async ({ userId, friendId,notes }) => {
      
      try {
        const friend = await this.redis.hGet('socket:socket', friendId+"");
        const user = await this.redis.hGet('socket:socket', userId+"");
        console.log(friend,user,"friends,user")
        await querySql( 'INSERT INTO friendships (user_id, friend_id, notes) VALUES (?, ?, ?)', [userId, friendId, notes?notes:"[]"] );
        if (friend) {
          let params = { from: userId, notes, };
          this.io.to(friend).emit('privateMessage', { code: 200,data: params });
        }
        this.io.to(user).emit('privateMessage', { code: 200, message: '发送好友请求成功！！！' });
      }catch (error) {
        console.error('addFriend error:', error);
        const user = await this.redis.hGet('socket:socket', userId+"");
        if(error.code === "ER_DUP_ENTRY"){
          // res.status(200).json({ message: '已经发送成功了,不要重复发送!' });
          this.io.to(user).emit('privateMessage', { code: 200, message: '已经发送成功了,不要重复发送!' });
        }else{
          // res.status(500).json({ message: e.sqlMessage });
          this.io.to(user).emit('privateMessage', { code: 500, message: '好友请求失败' });
        }
      }
    });

    // 私聊
    socket.on('privateMessage', async ({ toUserId, message }) => {
      await this.historyManager.saveMessage(userId, toUserId, message);
      const socketIds = await this.connectionManager.getUserSockets(toUserId);
      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit('privateMessage', {
          from: userId,
          message,
          timestamp: Date.now(),
        });
      });
    });

    // 群聊（可选）
    socket.on('groupMessage', ({ groupId, message }) => {
      this.io.to(`group:${groupId}`).emit('groupMessage', {
        from: userId,
        message,
        timestamp: Date.now(),
      });
    });
  }
}

module.exports = SocketMessageHandler;