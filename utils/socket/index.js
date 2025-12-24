// index.js
const socketIo = require('socket.io');
const { getRedisClient } = require('../../db/redis');
const { PRIVATE_KEY } = require('../constant');
const SocketAuth = require('./auth');
const SocketConnectionManager = require('./connection');
const SocketMessageHandler = require('./message');
const SocketHistoryManager = require('./history');

class SocketService {
  constructor() {
    this.io = null;
    this.redis = getRedisClient();
    this.connectionManager = new SocketConnectionManager(this.redis);
    this.historyManager = new SocketHistoryManager();
  }

  init(server) {
    this.io = socketIo(server, {
      cors: { origin: '*' },
      pingInterval: 30000,
      pingTimeout: 60000
    });
    
    this.io.adapter(this.redis.createAdapter());
    
    // 启动时初始化房间
    this.initRoomsOnStartup().catch(err => {
      console.error('Room initialization failed:', err);
      process.exit(1);
    });
    
    // JWT 验证
    this.io.use((socket, next) => {
      SocketAuth.verifyToken(socket, next, PRIVATE_KEY);
    });

    const messageHandler = new SocketMessageHandler(
      this.io,
      this.connectionManager,
      this.historyManager
    );

    this.io.on('connection',async (socket) => {
      // 恢复连接并加入房间
      console.log("connection", socket.id);
      await this.restoreConnection(socket);
      messageHandler.bindEvents(socket);

      socket.on('connect_error', (err) => {
        console.error('Connection error:', err.message);
      });

      socket.on('disconnect', () => {
        console.log("disconnect", socket.id);
        this.connectionManager.removeSocket(socket.id);
      });
    });
  }

  // 新增：连接恢复逻辑
  async restoreConnection(socket) {
    try {
      // 从Redis获取用户关联的房间列表
      const userRooms = await this.redis.sMembers(`socket:user:${socket.userId}:rooms`);
      
      // 自动加入所有房间
      userRooms.forEach(roomId => {
        socket.join(roomId);
      });
      
      // 更新连接管理器
      this.connectionManager.addSocket(socket);
      
      // 恢复历史消息（可选）
      // await this.historyManager.restoreHistory(socket);
      
    } catch (err) {
      console.error(`Restore connection failed for ${socket.id}:`, err.message);
    }
  }

  // 优化后的房间初始化方法
  async initRoomsOnStartup() {
    const cursor = 0;
    const rooms = [];
    let nextCursor = cursor;
    let iteration = 0;
    const MAX_ITERATIONS = 100; // 防止无限循环

    do {
      // 使用SCAN命令遍历
      const result = await this.redis.scan(nextCursor, {
        match: 'socket:room:*',
        count: 100
      });
      
      nextCursor = result[0];
      const keys = result[1];
      
      // console.log(`Scanned ${keys.length} rooms, cursor: ${nextCursor}`);
      
      // 处理房间数据
      for (const key of keys) {
        const roomId = key.split(':')[2];
        try {
          const roomData = await this.redis.hGetAll(`socket:room:${roomId}`);
          if (Object.keys(roomData).length > 0) {
            rooms.push({ 
              roomId,
              ...roomData,
              // 计算房间活跃时间
              lastActive: await this.redis.get(`socket:room:${roomId}:active`) || '' 
            });
          }
        } catch (err) {
          console.error(`Room load error (${roomId}):`, err.message);
        }
      }
      
      iteration++;
      // 双重终止条件：游标为0或超过最大迭代次数
      if (iteration > MAX_ITERATIONS) break;
      
    } while (Number(nextCursor) !== 0);

    // 记录恢复的房间信息
    this.restoredRooms = rooms;
    // console.log(`Restored ${JSON.stringify(rooms)} rooms from Redis`);
    
    // 示例输出第一个房间信息
    // if (rooms.length > 0) {
    //   const firstRoom = rooms[0];
    //   console.log('First room details:', {
    //     id: firstRoom.roomId,
    //     name: firstRoom.name,
    //     avatar: firstRoom.avatar,
    //     created_at: firstRoom.created_at,
    //     members: await this.redis.sMembers(`socket:room:${firstRoom.roomId}:members`)
    //   });
    // }
  }
}

module.exports = new SocketService();