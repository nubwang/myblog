const { createClient } = require('redis');

// Redis 客户端配置
const redisClient = createClient({
  url: 'redis://localhost:6379', // 默认 Redis 地址
  // 如果需要密码：
  // password: 'your_password'
});

// 处理连接错误
redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// 导出方法（直接使用 Redis 客户端的 Promise API）
module.exports = {
  // 连接 Redis（在应用启动时调用）
  connect: async () => {
    await redisClient.connect();
    console.log('Redis connected');
  },

  // 获取值
  get: async (key) => {
    return await redisClient.get(key);
  },

  // 设置值（带过期时间，单位：秒）
  setEx: async (key, value, expireSeconds) => {
    await redisClient.setEx(key, expireSeconds, value);
  },

  // 删除键
  del: async (key) => {
    await redisClient.del(key);
  },

  // 获取 Redis 客户端（用于复杂操作）
  getClient: () => redisClient,

  // 关闭连接（通常在应用退出时调用）
  quit: async () => {
    await redisClient.quit();
  },
};