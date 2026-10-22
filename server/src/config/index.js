'use strict';

require('dotenv').config();

/**
 * Parses CLIENT_ORIGIN into a list of bare origins.
 *
 * CORS compares the browser's `Origin` header with an exact string match, and
 * that header never carries a trailing slash. A value like
 * `https://app.netlify.app/` therefore rejects every request with
 * "... is not equal to the supplied origin", so trailing slashes are stripped.
 * Commas allow several origins (custom domain, deploy previews, localhost).
 */
function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const clientOrigins = parseOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173');

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-salpakan-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Every allowed browser origin — used by Express CORS and Socket.io.
  clientOrigins,
  // First entry, kept for callers that only need a single origin.
  clientOrigin: clientOrigins[0],
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
