module.exports = (io, socket) => {
  // 服务器通知
  socket.on('subscribe notifications', () => {
    socket.join('notifications');
  });

  // 示例：从 HTTP 路由触发通知
  // 可以在其他路由中这样使用：
  // const socketManager = require('../utils/socket');
  // const io = socketManager.getIO();
  // io.to('notifications').emit('new notification', { ... });
};