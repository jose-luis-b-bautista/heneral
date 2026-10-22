'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-salpakan-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isPostgres: Boolean(process.env.DATABASE_URL),
  // Per-turn countdown (seconds). On expiry the arbiter auto-plays a random
  // legal move for the lagging player so the match keeps moving.
  turnSeconds: parseInt(process.env.TURN_SECONDS || '60', 10),
  roomCodeLength: 6,
};

if (config.jwtSecret === 'dev-only-salpakan-secret-change-me' && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET is using the dev default in production — set a real secret.');
}

module.exports = config;
