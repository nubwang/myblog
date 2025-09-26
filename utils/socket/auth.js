// auth.js
const jwt = require('jsonwebtoken');
const { PRIVATE_KEY } = require('../constant');

class SocketAuth {
  /**
   * 验证 Socket.IO 连接的 Token
   * @param {Socket} socket
   * @param {Function} next
   */
  static verifyToken(socket, next) {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    try {
      const decoded = jwt.verify(token, PRIVATE_KEY);
      if (!decoded || !decoded.id) {
        return next(new Error('Authentication error: Token payload missing user id'));
      }
      socket.userId = decoded.id; // 挂载 userId 到 socket 对象
      next();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
      } else {
      }
      next(new Error(JSON.stringify({code: 401, msg: 'token验证失败'})));
    }
  }
}

module.exports = SocketAuth;