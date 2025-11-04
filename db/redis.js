const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');

class RedisClient {
  /**
   * 创建 Redis 客户端实例
   * @param {Object} options Redis 连接选项
   * @param {string} [options.url='redis://localhost:6379'] Redis 连接 URL
   * @param {string} [options.password] Redis 密码
   * @param {number} [options.db=0] 数据库索引
   */
  constructor(options = {}) {
    const defaultOptions = {
      url: 'redis://localhost:6379',
      db: 0,
    };
    
    // 合并配置
    this.options = { ...defaultOptions, ...options };
    
    // 初始化客户端
    this.client = this._createClient(this.options);
    this.subClient = null; // 用于发布/订阅的客户端
    
    // 连接状态
    this.isConnected = false;
    this._initEventListeners();
  }

  /**
   * 创建 Redis 客户端实例
   * @private
   */
  _createClient(options) {
    const client = new Redis(options);
    
    // 统一处理客户端错误
    client.on('error', (err) => this.handleError(err));
    
    return client;
  }

  /**
   * 初始化事件监听器
   * @private
   */
  _initEventListeners() {
    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('Redis connected');
    });
    
    this.client.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });
    
    this.client.on('end', () => {
      this.isConnected = false;
      console.log('Redis connection closed');
    });
    
    this.client.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
  }

  /**
   * 连接到 Redis
   * @returns {Promise<boolean>}
   */
  async connect() {
    // ioredis 会自动连接，这里只是等待连接完成
    if (this.isConnected) return true;
    
    return new Promise((resolve, reject) => {
      const checkConnection = () => {
        if (this.isConnected) return resolve(true);
        setTimeout(checkConnection, 50);
      };
      
      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);
      
      checkConnection();
      
      // 清除超时
      this.client.once('connect', () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  /**
   * 创建 Redis 适配器（用于 Socket.IO）
   * @returns {Object} Redis 适配器
   */
  createAdapter() {
    if (!this.subClient) {
      this.subClient = this.client.duplicate();
    }
    return createAdapter(this.client, this.subClient);
  }

  /**
   * 断开 Redis 连接
   */
  async disconnect() {
    try {
      // 关闭订阅客户端
      if (this.subClient) {
        await this.subClient.quit();
        this.subClient = null;
      }
      
      // 关闭主客户端
      await this.client.quit();
      this.isConnected = false;
      console.log('Disconnected from Redis');
      return true;
    } catch (err) {
      console.error('Error disconnecting from Redis:', err);
      this.handleError(err);
      return false;
    }
  }

  /**
   * 错误处理（可重写）
   * @param {Error} err 错误对象
   */
  handleError(err) {
    console.error('Redis Error:', err.message);
  }

  /**
   * 执行 SCAN 命令
   * @param {number} cursor 游标
   * @param {Object} options 配置
   * @param {string} [options.match] 匹配模式
   * @param {number} [options.count] 每次扫描数量
   */
  async scan(cursor, options = {}) {
    try {
      const { match, count = 100 } = options;
      const args = [cursor, 'MATCH', match || '*', 'COUNT', count];
      return await this.client.scan(...args);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 基础操作 ====================

  /**
   * 设置键值对
   * @param {string} key 键
   * @param {string} value 值
   * @param {Object} [options] 选项
   * @param {number} [options.EX] 过期时间（秒）
   * @param {number} [options.PX] 过期时间（毫秒）
   * @param {boolean} [options.NX] 仅当键不存在时设置
   * @param {boolean} [options.XX] 仅当键存在时设置
   */
  async set(key, value, options = {}) {
    try {
      return await this.client.set(key, value, options);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取键对应的值
   * @param {string} key 键
   * @returns {Promise<string|null>}
   */
  async get(key) {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 删除键
   * @param {...string} keys 一个或多个键
   */
  async del(...keys) {
    try {
      return await this.client.del(keys);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 检查键是否存在
   * @param {string} key 键
   */
  async exists(key) {
    try {
      return await this.client.exists(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 设置键的过期时间
   * @param {string} key 键
   * @param {number} seconds 过期时间（秒）
   */
  async expire(key, seconds) {
    try {
      return await this.client.expire(key, seconds);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取键的剩余过期时间
   * @param {string} key 键
   */
  async ttl(key) {
    try {
      return await this.client.ttl(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 哈希操作 ====================

  /**
   * 设置哈希字段值
   * @param {string} key 哈希键
   * @param {Object|string} field 字段名或字段对象
   * @param {string} [value] 值（当field是字符串时使用）
   */

  async hmset(key, field, value) {
    try {
      if (typeof field === 'object') {
        return await this.client.hset(key, field);
      }
      return await this.client.hset(key, field, value);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }
  
  async hSet(key, field, value) {
    try {
      if (typeof field === 'object') {
        return await this.client.hset(key, field);
      }
      return await this.client.hset(key, field, value);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取哈希字段值
   * @param {string} key 哈希键
   * @param {string} field 字段名
   */
  async hGet(key, field) {
    try {
      return await this.client.hget(key, field);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取哈希所有字段值
   * @param {string} key 哈希键
   */
  async hGetAll(key) {
    try {
      return await this.client.hgetall(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 删除哈希字段
   * @param {string} key 哈希键
   * @param {...string} fields 字段名
   */
  async hDel(key, ...fields) {
    try {
      return await this.client.hdel(key, fields);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 列表操作 ====================

  /**
   * 从列表左侧插入元素
   * @param {string} key 列表键
   * @param {...string} elements 元素
   */
  async lPush(key, ...elements) {
    try {
      return await this.client.lpush(key, ...elements);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 从列表右侧插入元素
   * @param {string} key 列表键
   * @param {...string} elements 元素
   */
  async rPush(key, ...elements) {
    try {
      return await this.client.rpush(key, ...elements);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 从列表左侧弹出元素
   * @param {string} key 列表键
   */
  async lPop(key) {
    try {
      return await this.client.lpop(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 从列表右侧弹出元素
   * @param {string} key 列表键
   */
  async rPop(key) {
    try {
      return await this.client.rpop(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取列表范围内的元素
   * @param {string} key 列表键
   * @param {number} start 开始索引
   * @param {number} end 结束索引
   */
  async lRange(key, start, end) {
    try {
      return await this.client.lrange(key, start, end);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 集合操作 ====================

  /**
   * 向集合添加元素
   * @param {string} key 集合键
   * @param {...string} members 元素
   */
  async sAdd(key, ...members) {
    try {
      return await this.client.sadd(key, ...members);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取集合所有成员
   * @param {string} key 集合键
   */
  async sMembers(key) {
    try {
      return await this.client.smembers(key);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 检查元素是否是集合成员
   * @param {string} key 集合键
   * @param {string} member 成员
   */
  async sIsMember(key, member) {
    try {
      return await this.client.sismember(key, member);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 移除集合中一个或多个成员
   * @param {string} key 集合键
   * @param {...string} members 成员
   */
  async sRem(key, ...members) {
    try {
      return await this.client.srem(key, ...members);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 发布/订阅 ====================

  /**
   * 订阅频道
   * @param {string|string[]} channels 频道或频道数组
   * @param {Function} callback 消息回调
   * @returns {Redis} 订阅客户端实例
   */
  subscribe(channels, callback) {
    if (!this.subClient) {
      this.subClient = this.client.duplicate();
    }
    
    if (Array.isArray(channels)) {
      return this.subClient.subscribe(channels, callback);
    }
    return this.subClient.subscribe(channels, callback);
  }

  /**
   * 取消订阅
   * @param {string|string[]} [channels] 频道或频道数组（不指定则取消所有订阅）
   */
  unsubscribe(channels) {
    if (this.subClient) {
      if (channels) {
        return this.subClient.unsubscribe(channels);
      }
      return this.subClient.unsubscribe();
    }
  }

  /**
   * 发布消息到频道
   * @param {string} channel 频道
   * @param {string} message 消息
   */
  async publish(channel, message) {
    try {
      return await this.client.publish(channel, message);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 高级功能 ====================

  /**
   * 执行 Lua 脚本
   * @param {string} script Lua 脚本
   * @param {number} keysCount 键数量
   * @param {...string} args 参数
   */
  async eval(script, keysCount, ...args) {
    try {
      return await this.client.eval(script, keysCount, ...args);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 执行事务
   * @param {Function} transactionFn 事务函数
   */
  async multi(transactionFn) {
    const multi = this.client.multi();
    await transactionFn(multi);
    return await multi.exec();
  }

  /**
   * 管道操作
   * @param {Function} pipelineFn 管道函数
   */
  async pipeline(pipelineFn) {
    const pipeline = this.client.pipeline();
    await pipelineFn(pipeline);
    return await pipeline.exec();
  }

  // ==================== 实用方法 ====================

  /**
   * 带缓存的获取方法
   * @param {string} key 缓存键
   * @param {number} ttl 过期时间（秒）
   * @param {Function} dataFetcher 数据获取函数
   */
  async getWithCache(key, ttl, dataFetcher) {
    try {
      // 尝试从缓存获取
      const cached = await this.get(key);
      if (cached) return JSON.parse(cached);
      
      // 缓存未命中，从数据源获取
      const data = await dataFetcher();
      
      // 存入缓存
      await this.set(key, JSON.stringify(data), { EX: ttl });
      
      return data;
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 获取分布式锁
   * @param {string} lockKey 锁键
   * @param {number} [timeout=10000] 超时时间（毫秒）
   * @param {number} [retryDelay=200] 重试延迟（毫秒）
   */
  async acquireLock(lockKey, timeout = 10000, retryDelay = 200) {
    const endTime = Date.now() + timeout;
    
    while (Date.now() < endTime) {
      try {
        const result = await this.client.set(lockKey, 'locked', {
          NX: true,
          PX: timeout
        });
        
        if (result === 'OK') return true;
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } catch (err) {
        this.handleError(err);
        throw err;
      }
    }
    
    return false;
  }

  /**
   * 释放分布式锁
   * @param {string} lockKey 锁键
   */
  async releaseLock(lockKey) {
    try {
      // 使用 Lua 脚本确保只有锁的持有者才能释放锁
      const script = `
        if redis.call("get", KEYS[1]) == "locked" then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await this.client.eval(script, 1, lockKey);
      return result === 1;
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 速率限制器
   * @param {string} key 限流键
   * @param {number} [limit=100] 限制次数
   * @param {number} [windowMs=60000] 时间窗口（毫秒）
   */
  async isAllowed(key, limit = 100, windowMs = 60000) {
    try {
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // 使用事务确保原子性
      const multi = this.client.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, now);
      multi.zcard(key);
      multi.expire(key, windowMs / 1000);
      
      const results = await multi.exec();
      const currentCount = results[2][1]; // 获取 zcard 的结果
      
      return currentCount <= limit;
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }
}

// 单例模式
let redisInstance;

/**
 * 获取 Redis 客户端实例
 * @param {Object} options Redis 连接选项
 * @returns {RedisClient}
 */
function getRedisClient(options) {
  if (!redisInstance) {
    redisInstance = new RedisClient(options);
  }
  return redisInstance;
}

module.exports = {
  RedisClient,
  getRedisClient
};