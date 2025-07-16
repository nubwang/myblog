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