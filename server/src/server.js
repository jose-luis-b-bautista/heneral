'use strict';

/**
 * Salpakan server entry point: Express REST + Socket.io real-time layer.
 *
 * Deploy: `node src/server.js` (see render.yaml). Requires no DB for
 * development — without DATABASE_URL the data layer falls back to memory.
 */
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const { verifySocketHandshake } = require('./middleware/auth');
const { initSockets } = require('./sockets');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json());

  app.get('/', (req, res) => res.json({ service: 'salpakan-server', health: '/api/health' }));
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[server] unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

/**
 * Builds the HTTP + Socket.io stack without listening.
 * Exported so tests can spin up an ephemeral server.
 */
function build() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.clientOrigins } });
  io.use((socket, next) => verifySocketHandshake(socket.handshake.auth, next));
  const roomManager = initSockets(io);
  return { app, server, io, roomManager };
}

function start() {
  const { server, io } = build();
  server.listen(config.port, () => {
    console.log(
      `[salpakan] listening on :${config.port} (db: ${config.isPostgres ? 'postgres' : 'memory'})`
    );
    // Logged so CORS misconfiguration is obvious in the deploy logs.
    console.log(`[salpakan] allowed origin(s): ${config.clientOrigins.join(', ')}`);
  });

  const shutdown = (signal) => {
    console.log(`[salpakan] ${signal} received — shutting down.`);
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) start();

module.exports = { createApp, build, start };
