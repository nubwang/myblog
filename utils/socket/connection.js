class SocketConnectionManager {
  constructor(redis) {
    this.redis = redis;
  }

  /**
   * 存储 Socket.ID 和 UserID 的映射
   * @param {Socket} socket
   */
  async addSocket(socket) {
    const { userId, id: socketId } = socket;
    console.log(userId, socketId, 'userId, socketId');

    // 存储 userId → socketId 的关系（使用 SET 存储多个 socketId）
    // await this.redis.sAdd(`user:${userId}:sockets`, socketId);

    // 存储 socketId → userId 的映射（使用 HASH 或 STRING）
    await this.redis.hSet('socket:user', socketId, userId);
    await this.redis.hSet('socket:socket', userId+"", socketId);

    // 可选：设置过期时间（例如 24 小时）
    // await this.redis.getClient().expire(`user:${userId}:sockets`, 86400);
    // await this.redis.getClient().expire('socket:user', 86400);
  }

  /**
   * 移除 Socket.ID
   * @param {string} socketId
   */
  async removeSocket(socketId) {
    console.log("11111111111111111111", socketId);
    // 从 socket:user 哈希中获取 userId
    const userId = await this.redis.hGet('socket:user', socketId);
    if (userId) {
      // 移除 user:${userId}:sockets 集合中的 socketId
      // await this.redis.sRem(`user:${userId}:sockets`, socketId);

      // 移除 socket:user 哈希中的 socketId
      await this.redis.hDel('socket:user', socketId); 
    }
  }

  /**
   * 获取用户的所有 Socket.ID
   * @param {string} userId
   * @returns {string[]}
   */
  async getUserSockets(userId) {
    // 获取 user:${userId}:sockets 集合的所有成员
    return await this.redis.sMembers(`user:${userId}:sockets`);
  }
}

module.exports = SocketConnectionManager;