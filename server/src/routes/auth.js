'use strict';

/**
 * /api/auth — registration and login.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, - or _).' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.createUser(username, passwordHash);
    const token = signToken(user);
    return res.status(201).json({ token, user: store.publicUser(user) });
  } catch (err) {
    if (err.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await store.findUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = signToken(user);
  return res.json({ token, user: store.publicUser(user) });
});

/** GET /api/auth/me — refresh the profile (also used for socket re-auth). */
router.get('/me', requireAuth, async (req, res) => {
  const user = await store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: store.publicUser(user) });
});

module.exports = router;
