const createError = require('http-errors');
const { getPool } = require('./pool');

/**
 * PUBLIC_INTERFACE
 * dbQuery executes a SQL statement with parameters and returns rows.
 * Throws http-errors 500 with minimal leakage if DB errors occur.
 * @param {string} sql SQL query
 * @param {any[]} params mysql2 parameters
 * @returns {Promise<any[]>} rows
 */
async function dbQuery(sql, params = []) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (err) {
    // Avoid leaking SQL / credentials in error responses
    // but preserve details in logs.
    // eslint-disable-next-line no-console
    console.error('DB error:', err);
    throw createError(500, 'Database error');
  }
}

/**
 * PUBLIC_INTERFACE
 * dbTx runs a function within a transaction (commit/rollback handled).
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} fn
 */
async function dbTx(fn) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    // eslint-disable-next-line no-console
    console.error('DB TX error:', err);
    throw createError(500, 'Database transaction error');
  } finally {
    conn.release();
  }
}

module.exports = {
  dbQuery,
  dbTx,
};
