'use strict';

/**
 * Applies db/init.sql to the DATABASE_URL target.
 * Usage: DATABASE_URL=... node db/init.js   (or `npm run db:init` with .env)
 */
require('dotenv').config();
const { readFileSync } = require('fs');
const path = require('path');
const { pool } = require('./pool');

if (!pool) {
  console.error('DATABASE_URL is not set — nothing to initialize.');
  process.exit(1);
}

(async () => {
  const sql = readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database schema applied.');
  process.exit(0);
})().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
