'use strict';

/**
 * /api/users — profile & stats.
 */
const express = require('express');
const store = require('../db/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** GET /api/users/me — profile + win/loss record. */
router.get('/me', requireAuth, async (req, res) => {
  const user = await store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: store.publicUser(user) });
});

module.exports = router;
