// index.js
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
    this.redis = getRedisClient();
    this.connectionManager = new SocketConnectionManager(this.redis);
    this.historyManager = new SocketHistoryManager(); // MySQL 历史消息
  }

  /**
   * 初始化 Socket.IO
   * @param {http.Server} server
   */
  init(server) {
    this.io = socketIo(server, {
      cors: { origin: '*' },
      pingInterval: 30000, // 每30秒发送一次心跳包
      pingTimeout: 60000,  // 如果60秒内没有收到客户端的心跳响应，则认为连接断开
    });
    this.io.adapter(this.redis.createAdapter()); // 使用 Redis 适配器

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
    this.io.on('connection',(socket) => {
      this.connectionManager.addSocket(socket);
      messageHandler.bindEvents(socket);

      socket.on('connect_error',(err) => {
        console.error('Connection error:', err.message);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.connectionManager.removeSocket(socket.id);
      });
    });
  }
}

module.exports = new SocketService();