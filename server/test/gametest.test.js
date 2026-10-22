'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/game/GameState');
const { resolveChallenge } = require('../src/game/Arbiter');
const { PIECES } = require('../src/game/constants');

function loadout() {
  const out = [];
  for (const p of PIECES) for (let i = 0; i < p.count; i += 1) out.push(p.rank);
  return out; // 21 ranks, flag last
}

/** Fill a side's home rows: 9 + 9 + 3 pieces. */
function makeSetup(side) {
  const ranks = loadout();
  const row = side === 'white' ? 0 : 5;
  const positions = [];
  for (let i = 0; i < 21; i += 1) {
    positions.push({ rank: ranks[i], r: row + Math.floor(i / 9), c: i % 9 });
  }
  return positions;
}

test('validateSetup accepts standard setups on both sides', () => {
  assert.equal(G.validateSetup('white', makeSetup('white')).ok, true);
  assert.equal(G.validateSetup('black', makeSetup('black')).ok, true);
});

test('validateSetup rejects wrong counts and wrong piece sets', () => {
  assert.equal(G.validateSetup('white', makeSetup('white').slice(0, 20)).ok, false);
  const swapped = makeSetup('white');
  swapped[0] = { ...swapped[0], rank: 1 }; // extra private, missing 5-star general
  assert.equal(G.validateSetup('white', swapped).ok, false);
});

test('validateSetup rejects out-of-row and overlapping placements', () => {
  const offRow = makeSetup('white');
  offRow[0] = { ...offRow[0], r: 4 };
  assert.equal(G.validateSetup('white', offRow).ok, false);

  const overlap = makeSetup('white');
  overlap[0] = { ...overlap[0], r: 1, c: 1 }; // collides with the piece at (1,1)
  assert.equal(G.validateSetup('white', overlap).ok, false);
});

test('legalDestinations: friendly blocks, enemy opens, board edges clamp', () => {
  const board = G.emptyBoard();
  board[0][0] = { id: 'w1', side: 'white', rank: 1 };
  board[0][1] = { id: 'w2', side: 'white', rank: 2 };
  board[1][0] = { id: 'b1', side: 'black', rank: 1 };
  assert.deepEqual(G.legalDestinations(board, 0, 0), [[1, 0]]);
  assert.deepEqual(G.legalDestinations(board, 0, 1), [[1, 1], [0, 2]]); // (0,0) is friendly -> blocked
  assert.deepEqual(G.legalDestinations(board, 0, 99), []);
});

test('applyMove: plain move onto an empty square', () => {
  const board = G.emptyBoard();
  board[0][0] = { id: 'w1', side: 'white', rank: 5 };
  const res = G.applyMove(board, [0, 0], [0, 1], resolveChallenge);
  assert.equal(res.defender, null);
  assert.equal(res.challenge, null);
  assert.equal(board[0][1].id, 'w1');
  assert.equal(board[0][0], null);
});

test('applyMove: attacker wins / defender wins / mutual / flag capture', () => {
  let b = G.emptyBoard();
  b[0][0] = { id: 'atk', side: 'white', rank: 10 };
  b[0][1] = { id: 'def', side: 'black', rank: 7 };
  G.applyMove(b, [0, 0], [0, 1], resolveChallenge);
  assert.equal(b[0][1].id, 'atk');

  b = G.emptyBoard();
  b[0][0] = { id: 'atk', side: 'white', rank: 7 };
  b[0][1] = { id: 'def', side: 'black', rank: 10 };
  G.applyMove(b, [0, 0], [0, 1], resolveChallenge);
  assert.equal(b[0][1].id, 'def');
  assert.equal(b[0][0], null);

  b = G.emptyBoard();
  b[0][0] = { id: 'atk', side: 'white', rank: 7 };
  b[0][1] = { id: 'def', side: 'black', rank: 7 };
  G.applyMove(b, [0, 0], [0, 1], resolveChallenge);
  assert.equal(b[0][0], null);
  assert.equal(b[0][1], null);

  b = G.emptyBoard();
  b[0][0] = { id: 'atk', side: 'white', rank: 1 };
  b[0][1] = { id: 'flag', side: 'black', rank: -1 };
  const res = G.applyMove(b, [0, 0], [0, 1], resolveChallenge);
  assert.equal(res.challenge.flagCaptured, true);
  assert.equal(b[0][1].id, 'atk');
});

test('sanitizeBoardForPlayer hides enemy ranks only and does not mutate', () => {
  const board = G.emptyBoard();
  board[0][0] = { id: 'w1', side: 'white', rank: 15 };
  board[7][8] = { id: 'b1', side: 'black', rank: 15 };

  const forWhite = G.sanitizeBoardForPlayer(board, 'white');
  assert.equal(forWhite[0][0].rank, 15);
  assert.equal(forWhite[7][8].rank, 'HIDDEN');

  const forBlack = G.sanitizeBoardForPlayer(board, 'black');
  assert.equal(forBlack[7][8].rank, 15);
  assert.equal(forBlack[0][0].rank, 'HIDDEN');

  // Original board must be untouched.
  assert.equal(board[7][8].rank, 15);
});

test('hasAnyMove and allLegalMoves agree', () => {
  const board = G.emptyBoard();
  assert.equal(G.hasAnyMove(board, 'white'), false);
  board[0][0] = { id: 'w', side: 'white', rank: 1 };
  assert.equal(G.hasAnyMove(board, 'white'), true);
  assert.equal(G.allLegalMoves(board, 'white').length, 2);
});

test('countPieces tracks eliminations', () => {
  const board = G.buildBoard({ white: makeSetup('white'), black: makeSetup('black') });
  assert.equal(G.countPieces(board, 'white'), 21);
  assert.equal(G.countPieces(board, 'black'), 21);
  board[0][0] = null;
  assert.equal(G.countPieces(board, 'white'), 20);
});
