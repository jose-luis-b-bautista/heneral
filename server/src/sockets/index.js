'use strict';

/**
 * Socket.io protocol — Salpakan (Game of the Generals).
 *
 * All board coordinates on the wire use *board space* (rows 0-7, cols 0-8,
 * unflipped). Clients apply a per-viewer flip at render time only.
 *
 *  Client                                Server
 *  lobby:create {}                   --->  create a room (creator auto-seated)
 *                                    <--   lobby:joined { code, side, opponent }
 *  lobby:join { code? }             --->  join by room code, or the public queue when omitted
 *                                    <--   lobby:joined | lobby:queued | lobby:error
 *  lobby:leave {}                  --->  leave the queue / abandon a setup room
 *  lobby:status {}                 --->  poll queue + room state
 *  setup:ready { positions }       --->  lock your formation
 *                                    <--   setup:locked | setup:error | match:start
 *  setup:unready {}                --->  unlock the formation before start
 *  move:request { from, to }        --->  move one square, orthogonally
 *                                    <--   challenge:broadcast | board:update | move:error
 *  match:resign {}                 --->  concede
 *                                    <--   match:conclude { winnerSide, reason, winner, fullBoard }
 *  disconnect (in play)            --->  grace window, then a DISCONNECT loss
 *  reconnect                       <--   room:resync { ... }
 */
const { RoomManager } = require('../game/RoomManager');
const G = require('../game/GameState');
const A = require('../game/Arbiter');
const config = require('../config');
const store = require('../db/store');
const { readUserFromAuth } = require('../middleware/auth');

/** Time a disconnected player gets to reconnect before the match settles. */
const GRACE_MS = 30_000;

function initSockets(io) {
  const rm = new RoomManager();
  const userSockets = new Map(); // userId -> live socketId

  // ------------------------------------------------------------ primitives
  function getSocket(id) {
    if (!id) return null;
    return io.sockets.sockets.get(id) || null;
  }

  function emitToRoomSide(room, side, event, payload) {
    const p = room.players[side];
    if (!p || !p.socketId) return;
    const s = getSocket(p.socketId);
    if (s) s.emit(event, payload);
  }

  function emitToBoth(room, event, payloadFor) {
    for (const side of ['white', 'black']) {
      emitToRoomSide(room, side, event, payloadFor(side));
    }
  }

  function findRoomForUser(userId) {
    for (const room of rm.rooms.values()) {
      if (room.players.white && room.players.white.id === userId) return { room, side: 'white' };
      if (room.players.black && room.players.black.id === userId) return { room, side: 'black' };
    }
    return null;
  }

  function sideOfSocket(room, socketId) {
    if (room.players.white && room.players.white.socketId === socketId) return 'white';
    if (room.players.black && room.players.black.socketId === socketId) return 'black';
    return null;
  }

  function broadcastBoard(room, extra = {}) {
    emitToBoth(
      room,
      'board:update',
      (side) => ({
        board: G.sanitizeBoardForPlayer(room.board, side),
        activeTurn: room.activeTurn,
        lastMove: room.lastMove,
        turnStartedAt: room.turnStartedAt,
        turnSeconds: config.turnSeconds,
        ...extra,
      })
    );
  }

  function startTurnTimer(room) {
    if (room.turnTimeoutId) clearTimeout(room.turnTimeoutId);
    room.turnStartedAt = Date.now();
    room.turnTimeoutId = setTimeout(() => {
      room.turnTimeoutId = null;
      if (room.phase !== 'playing') return;
      const side = room.activeTurn;
      const moves = G.allLegalMoves(room.board, side);
      if (moves.length === 0) {
        concludeMatch(room, G.otherSide(side), 'STALEMATE');
        return;
      }
      // Time expired: auto-play a random legal move so the match keeps moving.
      const pick = moves[Math.floor(Math.random() * moves.length)];
      doMove(room, side, pick.from, pick.to, { auto: true });
    }, config.turnSeconds * 1000);
  }

  // ----------------------------------------------------------- lifecycle
  function concludeMatch(room, winnerSide, reason) {
    if (room.phase !== 'playing') return;
    room.phase = 'concluded';
    if (room.turnTimeoutId) {
      clearTimeout(room.turnTimeoutId);
      room.turnTimeoutId = null;
    }
    if (room.disconnect) {
      clearTimeout(room.disconnect.timerId);
      room.disconnect = null;
    }
    const winner = winnerSide ? room.players[winnerSide] : null;
    const conclusion = {
      roomCode: room.code,
      winnerSide,
      reason,
      winner: winner ? { id: winner.id, username: winner.username } : null,
      fullBoard: room.board, // fully unmasked: end-of-match reveal
    };
    room.conclusion = conclusion;
    emitToBoth(room, 'match:conclude', () => conclusion);

    // Persist the record (fire-and-forget: never block players on DB hiccups).
    store
      .recordMatch({
        whiteId: room.players.white.id,
        blackId: room.players.black.id,
        winnerId: winner ? winner.id : null,
        winReason: reason,
      })
      .catch((err) => console.error('[match] failed to persist match record', err));

    // Purge the room from RAM after the final event flushes.
    setTimeout(() => rm.dropRoom(room.code), 500);
  }

  function checkWinAfterMove(room, moverSide, movedPiece, to, challenge) {
    // 1. Flag captured.
    if (challenge && challenge.flagCaptured) {
      concludeMatch(room, moverSide, 'FLAG_CAPTURED');
      return true;
    }
    // 2. Flag infiltration: a flag reached the opponent's back row.
    if (movedPiece.rank === -1 && to[0] === G.backRowFor(moverSide)) {
      concludeMatch(room, moverSide, 'FLAG_REACHED_BACK_RANK');
      return true;
    }
    // 3. The side to move next has no legal move (eliminated or blocked).
    const next = G.otherSide(moverSide);
    if (!G.hasAnyMove(room.board, next)) {
      concludeMatch(room, moverSide, 'STALEMATE');
      return true;
    }
    return false;
  }

  function doMove(room, side, from, to, opts = {}) {
    if (room.phase !== 'playing') return { ok: false, reason: 'The match is not in progress.' };
    if (room.activeTurn !== side) return { ok: false, reason: 'It is not your turn.' };
    const [fr, fc] = from;
    const [tr, tc] = to;
    if (![fr, fc, tr, tc].every(Number.isInteger)) {
      return { ok: false, reason: 'Invalid move.' };
    }
    if (!G.inBounds(fr, fc) || !G.inBounds(tr, tc)) {
      return { ok: false, reason: 'That square is off the board.' };
    }
    const piece = room.board[fr][fc];
    if (!piece || piece.side !== side) {
      return { ok: false, reason: 'You do not control that piece.' };
    }
    if (!G.isAdjacent(fr, fc, tr, tc)) {
      return { ok: false, reason: 'Pieces move exactly one square, orthogonally.' };
    }
    const target = room.board[tr][tc];
    if (target && target.side === side) {
      return { ok: false, reason: 'You cannot capture your own piece.' };
    }

    const result = G.applyMove(room.board, [fr, fc], [tr, tc], A.resolveChallenge);
    room.lastMove = {
      from: [fr, fc],
      to: [tr, tc],
      movedPieceId: piece.id,
      defenderId: result.defender ? result.defender.id : null,
      eliminatedIds: result.challenge ? result.challenge.eliminatedIds : [],
      outcome: result.challenge ? result.challenge.outcome : 'MOVE',
      flagCaptured: Boolean(result.challenge && result.challenge.flagCaptured),
      auto: Boolean(opts.auto),
    };

    const ended = checkWinAfterMove(room, side, result.movedPiece, [tr, tc], result.challenge);
    if (ended) {
      // Reveal the battle result; the conclusion event carries the full board.
      emitToBoth(room, 'challenge:broadcast', () => room.lastMove);
      return { ok: true };
    }

    room.activeTurn = G.otherSide(side);
    startTurnTimer(room);
    // Battle metadata without ranks, then each side's sanitized board.
    emitToBoth(room, 'challenge:broadcast', () => room.lastMove);
    broadcastBoard(room);
    return { ok: true };
  }

  function startMatch(room) {
    room.board = G.buildBoard(room.setups);
    room.phase = 'playing';
    room.activeTurn = 'white'; // White (rows 1-3) moves first.
    startTurnTimer(room);

    emitToBoth(room, 'match:start', (side) => ({
      board: G.sanitizeBoardForPlayer(room.board, side),
      side,
      roomCode: room.code,
      activeTurn: room.activeTurn,
      turnStartedAt: room.turnStartedAt,
      turnSeconds: config.turnSeconds,
      opponent: { username: room.players[G.otherSide(side)].username },
    }));
  }

  function handleSetupReady(room, side, socket, positions) {
    if (room.phase !== 'setup') {
      socket.emit('setup:error', { reason: 'Setup is already locked.' });
      return;
    }
    const validation = G.validateSetup(side, positions);
    if (!validation.ok) {
      socket.emit('setup:error', { reason: validation.reason });
      return;
    }
    room.setups[side] = positions.map((p) => ({ rank: p.rank, r: p.r, c: p.c }));
    room.ready[side] = true;
    socket.emit('setup:locked', { ready: { ...room.ready } });
    emitToRoomSide(room, G.otherSide(side), 'setup:opponent-ready', {});
    if (room.ready.white && room.ready.black) startMatch(room);
  }

  function handleSetupUnready(room, side, socket) {
    if (room.phase !== 'setup') return;
    room.ready[side] = false;
    socket.emit('setup:locked', { ready: { ...room.ready } });
  }

  function handleResign(room, side, socket) {
    if (room.phase !== 'playing') {
      socket.emit('move:error', { reason: 'The match has not started yet.' });
      return;
    }
    concludeMatch(room, G.otherSide(side), 'RESIGNATION');
  }

  // ------------------------------------------------------------ resync
  function buildResyncPayload(room, side) {
    const other = room.players[G.otherSide(side)];
    const payload = {
      roomCode: room.code,
      side,
      phase: room.phase,
      opponent: other ? { username: other.username } : null,
      opponentConnected: Boolean(other && other.socketId),
      turnSeconds: config.turnSeconds,
    };
    if (room.phase === 'setup') {
      payload.setup = { positions: room.setups[side] || [], ready: { ...room.ready } };
    } else if (room.phase === 'playing') {
      payload.board = G.sanitizeBoardForPlayer(room.board, side);
      payload.activeTurn = room.activeTurn;
      payload.turnStartedAt = room.turnStartedAt;
      payload.lastMove = room.lastMove;
    } else if (room.phase === 'concluded') {
      payload.conclusion = room.conclusion;
    }
    return payload;
  }

  function resyncUser(socket, user) {
    const found = findRoomForUser(user.id);
    if (!found) return;
    const { room, side } = found;

    // Kick an older socket that still holds this seat (double-tab case).
    const prevId = userSockets.get(user.id);
    if (prevId && prevId !== socket.id) {
      const prev = getSocket(prevId);
      if (prev) prev.emit('room:replaced', {});
    }
    room.players[side].socketId = socket.id;
    userSockets.set(user.id, socket.id);
    rm.reseatSocket(room, socket.id);

    if (room.disconnect) {
      clearTimeout(room.disconnect.timerId);
      room.disconnect = null;
      emitToRoomSide(room, G.otherSide(side), 'match:opponent-reconnected', {});
    }
    if (room.phase === 'playing') startTurnTimer(room);
    socket.emit('room:resync', buildResyncPayload(room, side));
  }

  function handleDisconnect(socket, user) {
    if (userSockets.get(user.id) === socket.id) userSockets.delete(user.id);
    const room = rm.onSocketLeave(socket.id);
    if (!room) return;

    const whiteGone = !room.players.white.socketId;
    const blackGone = !room.players.black.socketId;
    if (!whiteGone && !blackGone) return; // seat already replaced by a newer socket
    if (whiteGone && blackGone) {
      rm.dropRoom(room.code);
      return;
    }
    if (room.phase === 'concluded') return; // purge is already scheduled

    const goneSide = whiteGone ? 'white' : 'black';
    const other = G.otherSide(goneSide);

    if (room.phase === 'setup') {
      // Hold the seat briefly; purge the room if the player does not return.
      room.disconnect = {
        side: goneSide,
        timerId: setTimeout(() => {
          room.disconnect = null;
          rm.dropRoom(room.code);
        }, GRACE_MS),
      };
      emitToRoomSide(room, other, 'room:opponent-left', { phase: 'setup', graceMs: GRACE_MS });
      return;
    }

    // In play: the disconnected player loses on time after the grace window.
    if (room.turnTimeoutId) {
      clearTimeout(room.turnTimeoutId);
      room.turnTimeoutId = null;
    }
    room.disconnect = {
      side: goneSide,
      timerId: setTimeout(() => {
        room.disconnect = null;
        concludeMatch(room, other, 'DISCONNECT');
      }, GRACE_MS),
    };
    emitToRoomSide(room, other, 'room:opponent-left', { phase: 'playing', graceMs: GRACE_MS });
  }

  // --------------------------------------------------------------- wiring
  io.on('connection', (socket) => {
    // The io.use verifier already rejects bad handshakes; re-derive the user
    // here because this socket.io version does not attach middleware data.
    let user;
    try {
      user = readUserFromAuth(socket.handshake.auth);
    } catch (err) {
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;

    // Resume any in-flight setup/match for this user immediately.
    resyncUser(socket, user);

    socket.on('lobby:create', () => {
      if (findRoomForUser(user.id)) {
        return socket.emit('lobby:error', { reason: 'You are already in a match or lobby.' });
      }
      if (rm.queue.some((e) => e.socketId === socket.id)) {
        return socket.emit('lobby:error', { reason: 'Leave the queue first.' });
      }
      const room = rm.createRoom(user, socket.id, config.roomCodeLength);
      // Only one seat is filled at creation: the non-null one is the creator.
      const side = room.players.white ? 'white' : 'black';
      socket.emit('lobby:joined', {
        code: room.code,
        side,
        opponent: null,
      });
    });

    socket.on('lobby:join', (payload = {}) => {
      if (findRoomForUser(user.id)) {
        return socket.emit('lobby:error', { reason: 'You are already in a match or lobby.' });
      }
      const code = payload.code ? String(payload.code).toUpperCase() : null;

      if (code) {
        try {
          const room = rm.joinRoom(code, user, socket.id);
          const side = room.players.white.id === user.id ? 'white' : 'black';
          const other = G.otherSide(side);
          socket.emit('lobby:joined', {
            code: room.code,
            side,
            opponent: { username: room.players[other].username },
          });
          emitToRoomSide(room, other, 'lobby:opponent-joined', {
            code: room.code,
            opponent: { username: user.username },
          });
        } catch (err) {
          socket.emit('lobby:error', { reason: err.message });
        }
        return;
      }

      // No code: join the public matchmaking queue.
      rm.addToQueue(user, socket.id);
      const matched = rm.tryMatchQueue();
      if (matched) {
        const side = matched.players.white.id === user.id ? 'white' : 'black';
        const other = G.otherSide(side);
        socket.emit('lobby:joined', {
          code: matched.code,
          side,
          opponent: { username: matched.players[other].username },
        });
        emitToRoomSide(matched, other, 'lobby:joined', {
          code: matched.code,
          side: other,
          opponent: { username: user.username },
        });
      } else {
        socket.emit('lobby:queued', { position: 1, queueLength: rm.queueLength() });
      }
    });

    socket.on('lobby:leave', () => {
      rm.removeFromQueue(socket.id);
      const room = rm.findRoomBySocket(socket.id);
      if (!room || room.phase !== 'setup') return;
      const side = sideOfSocket(room, socket.id);
      if (side) {
        emitToRoomSide(room, G.otherSide(side), 'room:closed', { reason: 'opponent-left' });
        rm.dropRoom(room.code);
      }
      socket.emit('lobby:left', {});
    });

    socket.on('lobby:status', () => {
      const room = rm.findRoomBySocket(socket.id);
      socket.emit('lobby:status-result', {
        inRoom: room ? room.code : null,
        roomPhase: room ? room.phase : null,
        queueLength: rm.queueLength(),
      });
    });

    socket.on('setup:ready', (payload = {}) => {
      const room = rm.findRoomBySocket(socket.id);
      if (!room) {
        return;
      }
      const side = sideOfSocket(room, socket.id);
      if (!side) {
        return;
      }
      handleSetupReady(room, side, socket, payload.positions);
    });

    socket.on('setup:unready', () => {
      const room = rm.findRoomBySocket(socket.id);
      if (!room) return;
      const side = sideOfSocket(room, socket.id);
      if (!side) return;
      handleSetupUnready(room, side, socket);
    });

    socket.on('move:request', (payload = {}) => {
      const room = rm.findRoomBySocket(socket.id);
      if (!room) return socket.emit('move:error', { reason: 'No active match.' });
      const side = sideOfSocket(room, socket.id);
      if (!side) return;
      const result = doMove(room, side, payload.from, payload.to);
      if (!result.ok) socket.emit('move:error', { reason: result.reason });
    });

    socket.on('match:resign', () => {
      const room = rm.findRoomBySocket(socket.id);
      if (!room) {
        return;
      }
      const side = sideOfSocket(room, socket.id);
      if (!side) {
        return;
      }
      handleResign(room, side, socket);
    });

    socket.on('disconnect', () => handleDisconnect(socket, user));
  });

  return rm;
}

module.exports = { initSockets, GRACE_MS };
