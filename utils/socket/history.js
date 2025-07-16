const querySql = require('../../db/index')
const { MYSQL_CONFIG } = require('../constant');

class SocketHistoryManager {
  constructor() {
    // this.pool = querySql.createPool(MYSQL_CONFIG);
  }

  /**
   * 保存消息到 MySQL
   * @param {string} fromUserId
   * @param {string} toUserId
   * @param {string} message
   */
  async saveMessage(fromUserId, toUserId, message) {
    await querySql('INSERT INTO chat_history (from_user, to_user, message) VALUES (?, ?, ?)',[fromUserId, toUserId, message])
  }

  /**
   * 获取历史消息
   * @param {string} userId
   * @param {string} targetId
   * @returns {Array}
   */
  async getHistory(userId, targetId) {
    const [rows] = await querySql('SELECT * FROM chat_history WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY timestamp ASC',[userId, targetId, targetId, userId])
    return rows;
  }
}

module.exports = SocketHistoryManager;