// 评审时请使用中文解答和建议
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
    // console.log(socket,'token')
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    try {
      console.log('1111')
      const decoded = jwt.verify(token, PRIVATE_KEY);
      if (!decoded || !decoded.id) {
        return next(new Error('Authentication error: Token payload missing user id'));
      }
      socket.userId = decoded.id; // 挂载 userId 到 socket 对象
      console.log(decoded,'decoded')
      next();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Authentication error:', err.message);
      } else {
        console.log('Authentication error occurred');
      }
      next(new Error('Authentication error: Invalid token'));
    }
  }
}

module.exports = SocketAuth;