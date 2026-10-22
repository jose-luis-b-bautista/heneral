'use strict';

/**
 * RAM-based match tracking.
 *
 * Holds live rooms (keyed by room code) plus a public matchmaking queue.
 * Nothing here is persistent — finished matches are flushed to the database by
 * the socket layer, and rooms are dropped from memory when they conclude or
 * both players leave.
 */
const { randomBytes } = require('crypto');
const { otherSide } = require('./constants');
const { ROWS, COLS, emptyBoard, sanitizeBoardForPlayer } = require('./GameState');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to reduce confusion

function makeCode(len) {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

function randomInt(n) {
  return randomBytes(1)[0] % n;
}

class RoomManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.rooms = new Map();
    /** @type {Array<{socketId: string, user: object}>} */
    this.queue = [];
    /** socketId -> roomCode, for O(1) lookup */
    this.socketRoom = new Map();
  }

  findRoomByCode(code) {
    if (!code) return null;
    return this.rooms.get(String(code).toUpperCase()) || null;
  }

  findRoomBySocket(socketId) {
    const code = this.socketRoom.get(socketId);
    if (!code) return null;
    return this.rooms.get(code) || null;
  }

  /** Create a room with the creator seated on a random side. */
  createRoom(creator, creatorSocketId, codeLength = 6) {
    let code = makeCode(codeLength);
    while (this.rooms.has(code)) code = makeCode(codeLength);

    const creatorSide = Math.random() < 0.5 ? 'white' : 'black';
    const room = {
      code,
      phase: 'setup',
      createdAt: Date.now(),
      players: {
        white: creatorSide === 'white' ? this._player(creator, creatorSocketId) : null,
        black: creatorSide === 'black' ? this._player(creator, creatorSocketId) : null,
      },
      setups: { white: null, black: null },
      ready: { white: false, black: false },
      board: emptyBoard(),
      activeTurn: null,
      turnStartedAt: null,
      turnTimeoutId: null,
      lastMove: null,
      conclusion: null,
    };
    this.rooms.set(code, room);
    this.socketRoom.set(creatorSocketId, code);
    return room;
  }

  /** Seat a second player into a code-created room. */
  joinRoom(code, user, userSocketId) {
    const room = this.findRoomByCode(code);
    if (!room) {
      const err = new Error('Room not found');
      err.code = 'ROOM_NOT_FOUND';
      throw err;
    }
    if (room.phase !== 'setup') {
      const err = new Error('Match already in progress');
      err.code = 'MATCH_STARTED';
      throw err;
    }
    if (!room.players.white || !room.players.black) {
      // already seated?
      for (const side of ['white', 'black']) {
        const p = room.players[side];
        if (p && p.socketId === userSocketId) {
          return room; // re-join after a reconnect
        }
      }
    }
    const openSide = !room.players.white ? 'white' : !room.players.black ? 'black' : null;
    if (!openSide) {
      const err = new Error('Room is full');
      err.code = 'ROOM_FULL';
      throw err;
    }
    room.players[openSide] = this._player(user, userSocketId);
    this.socketRoom.set(userSocketId, room.code);
    return room;
  }

  /** Seat both players from the public queue when two are waiting. */
  tryMatchQueue() {
    if (this.queue.length < 2) return null;
    const [a, b] = this.queue.splice(0, 2);
    const white = Math.random() < 0.5 ? a : b;
    const black = white === a ? b : a;
    const room = this._createRoomFor(white, black);
    return room;
  }

  addToQueue(user, socketId) {
    // Ignore duplicate queue entries for the same socket.
    if (this.queue.some((e) => e.socketId === socketId)) return false;
    this.queue.push({ socketId, user });
    return true;
  }

  removeFromQueue(socketId) {
    this.queue = this.queue.filter((e) => e.socketId !== socketId);
  }

  queueLength() {
    return this.queue.length;
  }

  _createRoomFor(a, b) {
    let code = makeCode(6);
    while (this.rooms.has(code)) code = makeCode(6);
    const room = {
      code,
      phase: 'setup',
      createdAt: Date.now(),
      players: { white: this._player(a.user, a.socketId), black: this._player(b.user, b.socketId) },
      setups: { white: null, black: null },
      ready: { white: false, black: false },
      board: emptyBoard(),
      activeTurn: null,
      turnStartedAt: null,
      turnTimeoutId: null,
      lastMove: null,
      conclusion: null,
    };
    this.rooms.set(code, room);
    this.socketRoom.set(a.socketId, code);
    this.socketRoom.set(b.socketId, code);
    return room;
  }

  _player(user, socketId) {
    return { id: user.id, username: user.username, socketId };
  }

  /**
   * Handle a socket leaving: drop it from its room's seat (if any) and the
   * queue. Returns the affected room (if any) so the caller can decide
   * whether to conclude the match.
   */
  onSocketLeave(socketId) {
    this.removeFromQueue(socketId);
    const room = this.findRoomBySocket(socketId);
    this.socketRoom.delete(socketId);
    if (!room) return null;

    for (const side of ['white', 'black']) {
      const p = room.players[side];
      if (p && p.socketId === socketId) {
        p.socketId = null; // mark the seat as offline
      }
    }
    return room;
  }

  /** Re-seat a reconnected socket into its previous room if the seat is free. */
  reseatSocket(room, socketId) {
    this.socketRoom.set(socketId, room.code);
  }

  dropRoom(code) {
    const room = this.rooms.get(code);
    if (room && room.turnTimeoutId) clearTimeout(room.turnTimeoutId);
    this.rooms.delete(code);
    for (const [sid, codeForSocket] of this.socketRoom.entries()) {
      if (codeForSocket === code) this.socketRoom.delete(sid);
    }
  }
}

module.exports = {
  RoomManager,
  sanitizeBoardForPlayer,
  ROWS,
  COLS,
};
