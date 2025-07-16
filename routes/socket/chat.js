module.exports = (io, socket) => {
  // 私聊功能
  socket.on('private message', ({ to, message }) => {
    io.to(to).emit('private message', {
      from: socket.id,
      message,
      timestamp: Date.now()
    });
  });

  // 房间聊天
  socket.on('join room', (roomId) => {
    socket.join(roomId);
    io.to(roomId).emit('room notification', `${socket.id} 加入了房间`);
  });

  socket.on('room message', ({ roomId, message }) => {
    io.to(roomId).emit('room message', {
      user: socket.id,
      message,
      timestamp: Date.now()
    });
  });
};