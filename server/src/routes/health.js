'use strict';

/**
 * /api/health — keep-alive ping for Render's free tier.
 * Ping this endpoint every ~10 minutes (external cron) to prevent spin-down.
 */
const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'salpakan-server',
    postgres: config.isPostgres,
    time: new Date().toISOString(),
  });
});

module.exports = router;
