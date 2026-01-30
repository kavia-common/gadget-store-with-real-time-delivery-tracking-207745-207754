const mysql = require('mysql2/promise');

/**
 * Creates a lazily-initialized MySQL connection pool.
 * We keep it in-module to avoid multiple pools in serverless/test contexts.
 */
let pool;

/**
 * PUBLIC_INTERFACE
 * getPool returns a singleton mysql2/promise pool configured from env vars.
 * Required env vars come from the database container:
 * - MYSQL_URL, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB, MYSQL_PORT
 */
function getPool() {
  if (pool) return pool;

  const host = process.env.MYSQL_URL;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DB;
  const port = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : undefined;

  if (!host || !user || !password || !database) {
    const missing = [
      !host ? 'MYSQL_URL' : null,
      !user ? 'MYSQL_USER' : null,
      !password ? 'MYSQL_PASSWORD' : null,
      !database ? 'MYSQL_DB' : null,
    ].filter(Boolean);
    const err = new Error(`Missing required MySQL env vars: ${missing.join(', ')}`);
    err.code = 'MYSQL_ENV_MISSING';
    throw err;
  }

  pool = mysql.createPool({
    host,
    user,
    password,
    database,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    dateStrings: true,
  });

  return pool;
}

module.exports = {
  getPool,
};
