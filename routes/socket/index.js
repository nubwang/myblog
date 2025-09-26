const chatHandler = require('./chat');
const notificationHandler = require('./notification');

module.exports = (io) => {
  // 主命名空间
  io.on('connection', (socket) => {

    // 基础事件
    socket.on('disconnect', () => {
    });

    // 加载各功能模块
    chatHandler(io, socket);
    notificationHandler(io, socket);
  });

  // 可以添加其他命名空间
  // const adminIo = io.of('/admin');
  // adminIo.on('connection', (socket) => { ... });
};