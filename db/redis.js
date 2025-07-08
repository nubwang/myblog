// utils/redis.js
const redis = require('redis');
const { promisify } = require('util');

// Redis 客户端配置
const redisClient = redis.createClient({
  url: 'redis://localhost:6379', // 默认 Redis 地址
  // 如果需要密码：
  // password: 'your_password'
});

// 处理连接错误
redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// 封装异步方法
const getAsync = promisify(redisClient.get).bind(redisClient);
const setExAsync = promisify(redisClient.setEx).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);

// 导出方法
module.exports = {
  // 连接 Redis（在应用启动时调用）
  connect: async () => {
    await redisClient.connect();
    console.log('Redis connected');
  },

  // 获取值
  get: async (key) => {
    return await getAsync(key);
  },

  // 设置值（带过期时间，单位：秒）
  setEx: async (key, value, expireSeconds) => {
    await setExAsync(key, expireSeconds, value);
  },

  // 删除键
  del: async (key) => {
    await delAsync(key);
  },

  // 获取 Redis 客户端（用于复杂操作）
  getClient: () => redisClient,

  // 关闭连接（通常在应用退出时调用）
  quit: async () => {
    await redisClient.quit();
  },
};