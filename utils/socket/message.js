class SocketMessageHandler {
  constructor(io, connectionManager, historyManager) {
    this.io = io;
    this.connectionManager = connectionManager;
    this.historyManager = historyManager;
  }

  /**
   * 绑定消息事件
   * @param {Socket} socket
   */
  bindEvents(socket) {
    const { userId } = socket;
    // console.log(userId,"userId, toUserId, message")
    //好友请求
    socket.on('addFriend', async ({ userId, friendId,notes }) => {
        const result = await querySql( 'INSERT INTO friendships (user_id, friend_id, notes) VALUES (?, ?, ?)', [userId, friendId, notes?notes:"[]"] );
        let params = {
          from: userId,
          notes,
        };
        if (result.affectedRows > 0) {
          console.log('Friend request sent successfully');
          this.io.to(friendId).emit('privateMessage', { code: 200,data: params, message: '好友请求已发送' });
        } else {
          this.io.to(friendId).emit('privateMessage', { code: 500, message: '好友请求失败' });
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