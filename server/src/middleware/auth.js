'use strict';

/**
 * JWT authentication for HTTP routes and the Socket.io handshake.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

/** Express middleware: req.user = { id, username } when a valid Bearer token is present. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Reads and verifies the user identity from a Socket.io handshake.
 * The client connects with `io(URL, { auth: { token } })`.
 * Throws when the token is missing or invalid.
 */
function readUserFromAuth(auth) {
  const token = auth && auth.token;
  if (!token) throw new Error('Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
  return { id: payload.sub, username: payload.username };
}

/** Socket.io `io.use` verifier — rejects the handshake on bad tokens. */
function verifySocketHandshake(auth, done) {
  try {
    readUserFromAuth(auth);
    done(null);
  } catch (err) {
    done(err);
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

module.exports = { requireAuth, readUserFromAuth, verifySocketHandshake, signToken };
