'use strict';

/**
 * End-to-end protocol test: two socket.io clients play a full match
 * against an ephemeral server (in-memory store).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: ioc } = require('socket.io-client');
const { build } = require('../src/server');
const { PIECES } = require('../src/game/constants');

function makeSetup(side) {
  const ranks = [];
  for (const p of PIECES) for (let i = 0; i < p.count; i += 1) ranks.push(p.rank);
  const row = side === 'white' ? 0 : 5;
  const positions = [];
  for (let i = 0; i < 21; i += 1) {
    positions.push({ rank: ranks[i], r: row + Math.floor(i / 9), c: i % 9 });
  }
  return positions;
}

function waitFor(socket, event, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function apiCall(base, path, { method = 'GET', token, body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));
}

test('full match lifecycle over sockets', async (t) => {
  const { server, io } = build();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let sA;
  let sB;
  t.after(async () => {
    await new Promise((r) => setTimeout(r, 600)); // let the post-conclusion purge run
    try {
      sA && sA.close();
      sB && sB.close();
    } catch {}
    io.close();
    await new Promise((resolve) => server.close(resolve));
  });

  // 1. Register two users over REST.
  const alice = (await apiCall(base, '/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: 'secret1' },
  })).data;
  const bob = (await apiCall(base, '/api/auth/register', {
    method: 'POST',
    body: { username: 'bob', password: 'secret1' },
  })).data;
  assert.ok(alice && alice.token && bob && bob.token);

  // 2. Connect both sockets with their JWTs.
  sA = ioc(base, { auth: { token: alice.token }, transports: ['websocket'] });
  sB = ioc(base, { auth: { token: bob.token }, transports: ['websocket'] });
  await Promise.all([waitFor(sA, 'connect'), waitFor(sB, 'connect')]);

  // 3. Alice creates a room; Bob joins with the (lowercased) code.
  const created = await new Promise((resolve) => {
    sA.emit('lobby:create');
    sA.once('lobby:joined', resolve);
  });
  assert.ok(/^[A-Z2-9]{6}$/.test(created.code));
  const aSide = created.side;
  assert.ok(aSide === 'white' || aSide === 'black');

  // Arm the listener BEFORE the join so the event cannot slip past us.
  const oppJoinedP = waitFor(sA, 'lobby:opponent-joined');
  const joinedB = await new Promise((resolve) => {
    sB.emit('lobby:join', { code: created.code.toLowerCase() });
    sB.once('lobby:joined', resolve);
  });
  assert.equal(joinedB.code, created.code);
  assert.equal(joinedB.side, aSide === 'white' ? 'black' : 'white');
  assert.equal(joinedB.opponent.username, 'alice');

  const oppJoined = await oppJoinedP;
  assert.equal(oppJoined.opponent.username, 'bob');

  // 4. Both lock in a standard setup -> the match starts.
  const [startA, startB] = await Promise.all([
    (async () => {
      sA.emit('setup:ready', { positions: makeSetup(aSide) });
      return waitFor(sA, 'match:start');
    })(),
    (async () => {
      sB.emit('setup:ready', { positions: makeSetup(joinedB.side) });
      return waitFor(sB, 'match:start');
    })(),
  ]);
  assert.equal(startA.side, aSide);
  assert.equal(startA.activeTurn, 'white');
  assert.ok(startA.turnStartedAt > 0);

  // 5. Fog of war: each board shows 21 own (ranked) + 21 hidden pieces.
  for (const [board, side] of [[startA.board, aSide], [startB.board, joinedB.side]]) {
    let own = 0;
    let hidden = 0;
    for (const row of board) {
      for (const cell of row) {
        if (!cell) continue;
        if (cell.side === side) own += 1;
        else {
          hidden += 1;
          assert.equal(cell.rank, 'HIDDEN');
        }
      }
    }
    assert.equal(own, 21);
    assert.equal(hidden, 21);
  }

  const whiteSock = aSide === 'white' ? sA : sB;
  const blackSock = aSide === 'white' ? sB : sA;
  const otherOfWhite = whiteSock === sA ? sB : sA;

  // 6. White's first move: the flag at (2,2) slides to the empty (2,3).
  const upd1P = waitFor(otherOfWhite, 'board:update');
  whiteSock.emit('move:request', { from: [2, 2], to: [2, 3] });
  const upd1 = await upd1P;
  assert.equal(upd1.activeTurn, 'black');
  assert.equal(upd1.lastMove.movedPieceId, 'white-20');
  assert.equal(upd1.lastMove.outcome, 'MOVE');
  assert.equal(upd1.board[2][3].side, 'white');
  assert.equal(upd1.board[2][2], null);

  // 7. Black's turn: a friendly capture must be rejected by the arbiter.
  const errP = waitFor(blackSock, 'move:error');
  blackSock.emit('move:request', { from: [5, 0], to: [6, 0] });
  const err = await errP;
  assert.match(err.reason, /own piece/i);

  // 8. Black's legal move: flag at (7,2) -> empty (7,3).
  const upd2P = waitFor(whiteSock, 'board:update');
  blackSock.emit('move:request', { from: [7, 2], to: [7, 3] });
  const upd2 = await upd2P;
  assert.equal(upd2.activeTurn, 'white');
  assert.equal(upd2.lastMove.movedPieceId, 'black-20');
  // Fog persists after the move: the black pieces on this white-viewer board
  // must still be hidden (the board was sanitized for the white side).
  for (const row of upd2.board) {
    for (const cell of row) {
      if (cell && cell.side === 'black') assert.equal(cell.rank, 'HIDDEN');
    }
  }

  // 9. Black resigns -> both clients receive the unmasked conclusion.
  // Arm both listeners BEFORE emitting the trigger.
  const cA = waitFor(sA, 'match:conclude');
  const cB = waitFor(sB, 'match:conclude');
  blackSock.emit('match:resign');
  const [conclusionA, conclusionB] = await Promise.all([cA, cB]);
  for (const c of [conclusionA, conclusionB]) {
    assert.equal(c.reason, 'RESIGNATION');
    assert.equal(c.winnerSide, 'white');
    assert.equal(c.winner.username, aSide === 'white' ? 'alice' : 'bob');
    let revealed = 0;
    for (const row of c.fullBoard) {
      for (const cell of row) if (cell && typeof cell.rank === 'number') revealed += 1;
    }
    assert.equal(revealed, 42); // full-board reveal, no 'HIDDEN' left
  }

  // 10. Stats are persisted (in-memory store here; same path hits Neon).
  await new Promise((r) => setTimeout(r, 250));
  const winnerToken = aSide === 'white' ? alice.token : bob.token;
  const loserToken = aSide === 'white' ? bob.token : alice.token;
  const wProfile = (await apiCall(base, '/api/users/me', { token: winnerToken })).data.user;
  const lProfile = (await apiCall(base, '/api/users/me', { token: loserToken })).data.user;
  assert.equal(wProfile.wins, 1);
  assert.equal(lProfile.losses, 1);
});

test('socket handshake rejects invalid tokens', async () => {
  const { server, io } = build();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const bad = ioc(base, { auth: { token: 'garbage' }, transports: ['websocket'] });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for connect_error')), 5000);
    bad.once('connect_error', (e) => {
      clearTimeout(timer);
      resolve(e.message);
    });
  });
  assert.match(message, /token/i);
  bad.close();
  io.close();
  server.close();
});

