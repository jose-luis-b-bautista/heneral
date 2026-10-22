'use strict';

/**
 * Neon PostgreSQL connection pool.
 *
 * When DATABASE_URL is present we open a pg Pool (with SSL for Neon).
 * When it is absent the data layer transparently falls back to an in-memory
 * store (see store.js) so the server runs and is testable locally.
 */
const { Pool } = require('pg');

function needsSsl(url) {
  if (!url) return false;
  if (/sslmode=(require|verify-full|verify-ca)/.test(url)) return true;
  if (/neon\.tech/i.test(url)) return true;
  return false;
}

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: needsSsl(process.env.DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[pg] unexpected pool error', err);
  });
}

module.exports = { pool, isPostgres: Boolean(pool) };
