const mysql = require('mysql2/promise'); // 使用 Promise 版本
const dbOption = require('./config');

// 创建连接池（配置参数建议单独维护）
const pool = mysql.createPool({
  ...dbOption,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * 通用查询方法（自动管理连接）
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<*>}
 */
async function querySql(sql, params) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(sql, params);
    return result;
  } finally {
    connection.release(); // 确保连接释放
  }
}

/**
 * 事务处理方法（自动提交/回滚）
 * @param {function} callback 接收 connection 参数的回调函数
 * @returns {Promise<*>}
 */
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  querySql,
  transaction,
  pool // 暴露连接池供需要直接操作的场景使用
};