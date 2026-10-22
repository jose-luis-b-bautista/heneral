'use strict';

/**
 * Data access layer.
 *
 * Backed by Neon PostgreSQL when DATABASE_URL is set; otherwise an in-memory
 * store is used so the service can run and be tested without a database.
 * Every function is async so callers never need to know which backend is live.
 */
const crypto = require('crypto');
const { pool, isPostgres } = require('../../db/pool');

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------
const memoryUsers = new Map(); // id -> { id, username, passwordHash, wins, losses, draws, createdAt }
const memoryMatches = [];      // { id, whitePlayerId, blackPlayerId, winnerId, winReason, endedAt }

function uuid() {
  return crypto.randomUUID();
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    createdAt: u.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a user. Throws { code: 'USERNAME_TAKEN' } when the name is used. */
async function createUser(username, passwordHash) {
  if (!isPostgres) {
    for (const u of memoryUsers.values()) {
      if (u.username.toLowerCase() === username.toLowerCase()) {
        const err = new Error('Username already taken');
        err.code = 'USERNAME_TAKEN';
        throw err;
      }
    }
    const user = {
      id: uuid(),
      username,
      passwordHash,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: new Date().toISOString(),
    };
    memoryUsers.set(user.id, user);
    return user;
  }

  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, wins, losses, draws, created_at',
    [username, passwordHash]
  );
  return rows[0];
}

async function findUserByUsername(username) {
  if (!isPostgres) {
    for (const u of memoryUsers.values()) {
      if (u.username.toLowerCase() === String(username).toLowerCase()) return u;
    }
    return null;
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  return rows[0] || null;
}

async function findUserById(id) {
  if (!isPostgres) return memoryUsers.get(id) || null;
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Bump W/L/D counters and persist a match record. Returns the stored record. */
async function recordMatch({ whiteId, blackId, winnerId, winReason }) {
  const now = new Date();

  if (!isPostgres) {
    const inc = (id, field) => {
      const u = memoryUsers.get(id);
      if (u) u[field] = (u[field] || 0) + 1;
    };
    if (winnerId === null || winnerId === undefined) {
      inc(whiteId, 'draws');
      inc(blackId, 'draws');
    } else if (winnerId === whiteId) {
      inc(whiteId, 'wins');
      inc(blackId, 'losses');
    } else if (winnerId === blackId) {
      inc(blackId, 'wins');
      inc(whiteId, 'losses');
    }
    const record = {
      id: uuid(),
      white_player_id: whiteId,
      black_player_id: blackId,
      winner_id: winnerId,
      win_reason: winReason,
      ended_at: now,
    };
    memoryMatches.push(record);
    return record;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO match_history (white_player_id, black_player_id, winner_id, win_reason)
       VALUES ($1, $2, $3, $4)`,
      [whiteId, blackId, winnerId, winReason]
    );

    if (winnerId === null || winnerId === undefined) {
      await client.query('UPDATE users SET draws = draws + 1 WHERE id IN ($1, $2)', [whiteId, blackId]);
    } else if (winnerId === whiteId) {
      await client.query('UPDATE users SET wins = wins + 1 WHERE id = $1', [whiteId]);
      await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [blackId]);
    } else {
      await client.query('UPDATE users SET wins = wins + 1 WHERE id = $1', [blackId]);
      await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [whiteId]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(
    `SELECT * FROM match_history
     WHERE white_player_id = $1 AND black_player_id = $2 AND ended_at = $3
     ORDER BY ended_at DESC LIMIT 1`,
    [whiteId, blackId, now]
  );
  return rows[0];
}

module.exports = {
  isPostgres,
  publicUser,
  createUser,
  findUserByUsername,
  findUserById,
  recordMatch,
};
