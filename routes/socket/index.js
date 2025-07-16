const chatHandler = require('./chat');
const notificationHandler = require('./notification');

module.exports = (io) => {
  // 主命名空间
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.handshake.auth.userId,socket.id);

    // 基础事件
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    // 加载各功能模块
    chatHandler(io, socket);
    notificationHandler(io, socket);
  });

  // 可以添加其他命名空间
  // const adminIo = io.of('/admin');
  // adminIo.on('connection', (socket) => { ... });
};