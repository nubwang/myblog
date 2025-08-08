const { createClient } = require('redis');

class RedisClient {
  /**
   * 创建 Redis 客户端实例
   * @param {Object} options Redis 连接选项
   * @param {string} [options.url='redis://localhost:6379'] Redis 连接 URL
   * @param {string} [options.password] Redis 密码
   * @param {number} [options.database=0] 数据库索引
   */
  constructor(options = {}) {
    const defaultOptions = {
      url: 'redis://localhost:6379'
    };

    this.options = { ...defaultOptions, ...options };
    this.client = createClient(this.options);

    // 错误处理
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.handleError(err);
    });

    // 连接状态
    this.isConnected = false;
  }

  /**
   * 连接到 Redis
   */
  async connect() {
    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('Connected to Redis');
      return true;
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      this.handleError(err);
      return false;
    }
  }

  /**
   * 断开 Redis 连接
   */
  async disconnect() {
    try {
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
    // 默认只是打印错误，可以重写此方法实现自定义错误处理
    console.error('Redis Error:', err.message);
  }

  // ==================== 基础操作 ====================

  /**
   * 设置键值对
   * @param {string} key 键
   * @param {string} value 值
   * @param {Object} [options] 选项
   * @param {number} [options.EX] 过期时间（秒）
   * @param {number} [options.PX] 过期时间（毫秒）
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
  async hSet(key, field, value) {
    try {
      if (typeof field === 'object') {
        return await this.client.hSet(key, field);
      }
      return await this.client.hSet(key, field, value);
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
      return await this.client.hGet(key, field);
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
      return await this.client.hGetAll(key);
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
      return await this.client.hDel(key, fields);
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
      return await this.client.lPush(key, elements);
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
      return await this.client.rPush(key, elements);
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
      return await this.client.lPop(key);
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
      return await this.client.rPop(key);
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
      return await this.client.lRange(key, start, end);
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
      return await this.client.sAdd(key, members);
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
      return await this.client.sMembers(key);
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
      return await this.client.sIsMember(key, member);
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
      return await this.client.sRem(key, members);
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
   * @returns {Promise<void>}
   */
  async subscribe(channels, callback) {
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    
    if (Array.isArray(channels)) {
      await subscriber.subscribe(channels, callback);
    } else {
      await subscriber.subscribe(channels, callback);
    }
    
    return subscriber;
  }

  /**
   * 发布消息到频道
   * @param {string} channel 频道
   * @param {string} message 消息
   */
  async publish(channel, message) {
    try {
      const publisher = this.client.duplicate();
      await publisher.connect();
      return await publisher.publish(channel, message);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // ==================== 高级功能 ====================

  /**
   * 执行 Lua 脚本
   * @param {string} script Lua 脚本
   * @param {Object} options 选项
   * @param {string[]} [options.keys] 键数组
   * @param {string[]} [options.arguments] 参数数组
   */
  async eval(script, options = {}) {
    try {
      return await this.client.eval(script, options);
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
    const pipeline = this.client.multi();
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
   */
  async acquireLock(lockKey, timeout = 10000) {
    try {
      const result = await this.client.set(lockKey, 'locked', {
        NX: true,
        PX: timeout
      });
      return result === 'OK';
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 释放分布式锁
   * @param {string} lockKey 锁键
   */
  async releaseLock(lockKey) {
    try {
      return await this.del(lockKey);
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  /**
   * 速率限制器
   * @param {string} userId 用户ID
   * @param {number} [limit=100] 限制次数
   * @param {number} [windowMs=60000] 时间窗口（毫秒）
   */
  async isAllowed(userId, limit = 100, windowMs = 60000) {
    try {
      const key = `rate_limit:${userId}`;
      const now = Date.now();
      
      const multi = this.client.multi();
      multi.lPush(key, now);
      multi.lTrim(key, 0, limit - 1);
      multi.expire(key, windowMs / 1000);
      await multi.exec();
      
      const current = await this.client.lLen(key);
      return current <= limit;
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }
}

// 导出单例或创建实例的函数
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