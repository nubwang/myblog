const socketIo = require('socket.io');
// const Redis = require('ioredis');
const { getRedisClient } = require('../../db/redis');
const { REDIS_CONFIG, PRIVATE_KEY } = require('../constant');
const SocketAuth = require('./auth');
const SocketConnectionManager = require('./connection');
const SocketMessageHandler = require('./message');
const SocketHistoryManager = require('./history');

class SocketService {
  constructor() {
    this.io = null;
    // 初始化连接管理器和历史消息管理器
    let redis = getRedisClient();
    this.connectionManager = new SocketConnectionManager(redis);
    this.historyManager = new SocketHistoryManager(); // MySQL 历史消息
  }

  /**
   * 初始化 Socket.IO
   * @param {http.Server} server
   */
  init(server) {
    this.io = socketIo(server, {
      cors: { origin: '*' },
    });

    // JWT 验证
    this.io.use((socket, next) => {
      SocketAuth.verifyToken(socket, next, PRIVATE_KEY);
    });

    // 初始化消息处理器
    const messageHandler = new SocketMessageHandler(
      this.io,
      this.connectionManager,
      this.historyManager,
    );

    // 绑定事件
    this.io.on('connection', (socket) => {
      this.connectionManager.addSocket(socket);
      messageHandler.bindEvents(socket);

      socket.on('disconnect', () => {
        console.log("000000000000000")
        this.connectionManager.removeSocket(socket.id);
      });
    });
  }
}

module.exports = new SocketService();