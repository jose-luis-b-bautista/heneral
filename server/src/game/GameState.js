'use strict';

/**
 * Board representation + move validation.
 *
 * Coordinate system (board coordinates, unflipped):
 *   rows 0..7  (board row 0 = "row 1", board row 7 = "row 8")
 *   cols 0..8  (col 0 = "A", col 8 = "I")
 *
 * White is set up on board rows 0-2 and marches toward row 7.
 * Black is set up on board rows 5-7 and marches toward row 0.
 *
 * The client renders a per-viewer flip on top of these coordinates.
 */
const { ROWS, COLS, PIECES, PIECE_COUNT, otherSide } = require('./constants');

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

/** Board rows a side may place pieces on during setup. */
function setupRowsFor(side) {
  return side === 'white' ? [0, 1, 2] : [5, 6, 7];
}

/** The opponent back-row that a flag must reach to win. */
function backRowFor(side) {
  return side === 'white' ? ROWS - 1 : 0;
}

function isAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

/**
 * Validates a setup payload: exactly the 21-piece loadout, every piece inside
 * the side's 3 home rows, no two pieces sharing a square.
 * @param {'white'|'black'} side
 * @param {Array<{rank: number, r: number, c: number}>} positions
 */
function validateSetup(side, positions) {
  if (!Array.isArray(positions) || positions.length !== PIECE_COUNT) {
    return { ok: false, reason: `A setup must contain exactly ${PIECE_COUNT} pieces.` };
  }

  const required = [];
  for (const p of PIECES) {
    for (let i = 0; i < p.count; i += 1) required.push(p.rank);
  }
  required.sort((a, b) => a - b);
  const got = positions.map((p) => p.rank).sort((a, b) => a - b);
  if (got.length !== required.length) {
    return { ok: false, reason: 'Invalid piece set.' };
  }
  for (let i = 0; i < required.length; i += 1) {
    if (required[i] !== got[i]) {
      return { ok: false, reason: 'The setup does not match the standard 21-piece loadout.' };
    }
  }

  const rows = setupRowsFor(side);
  const seen = new Set();
  for (const p of positions) {
    if (!Number.isInteger(p.r) || !Number.isInteger(p.c) || !inBounds(p.r, p.c)) {
      return { ok: false, reason: 'A piece is placed on an invalid square.' };
    }
    if (!rows.includes(p.r)) {
      return { ok: false, reason: 'Pieces may only be placed in your own three home rows.' };
    }
    const key = `${p.r}:${p.c}`;
    if (seen.has(key)) {
      return { ok: false, reason: 'Two pieces are sharing one square.' };
    }
    seen.add(key);
  }
  return { ok: true };
}

/** Builds the full 8x9 board from both validated setups. */
function buildBoard(setups) {
  const board = emptyBoard();
  for (const side of ['white', 'black']) {
    let n = 0;
    for (const p of setups[side]) {
      board[p.r][p.c] = {
        id: `${side}-${n}`,
        side,
        rank: p.rank,
      };
      n += 1;
    }
  }
  return board;
}

/** Orthogonal destination squares for the piece at (r,c). */
function legalDestinations(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const dests = [];
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = board[nr][nc];
    if (target && target.side === piece.side) continue; // friendly: blocked
    dests.push([nr, nc]);
  }
  return dests;
}

function hasAnyMove(board, side) {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const p = board[r][c];
      if (p && p.side === side && legalDestinations(board, r, c).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function allLegalMoves(board, side) {
  const moves = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const p = board[r][c];
      if (p && p.side === side) {
        for (const [nr, nc] of legalDestinations(board, r, c)) {
          moves.push({ from: [r, c], to: [nr, nc] });
        }
      }
    }
  }
  return moves;
}

function countPieces(board, side) {
  let n = 0;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const p = board[r][c];
      if (p && p.side === side) n += 1;
    }
  }
  return n;
}

/**
 * Fog-of-war masking: returns a copy of the board where every enemy piece's
 * rank is replaced by the literal string 'HIDDEN'. Own pieces are passed
 * through untouched. Never exposes real enemy ranks to a client.
 * @param {Array<Array<Object|null>>} board
 * @param {'white'|'black'} targetSide
 */
function sanitizeBoardForPlayer(board, targetSide) {
  return board.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      if (cell.side === targetSide) {
        return { ...cell };
      }
      return { id: cell.id, side: cell.side, rank: 'HIDDEN' };
    })
  );
}

/**
 * Applies a move to the board (mutates the passed board).
 * @param {Array<Array<Object|null>>} board
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @param {(a: object, d: object) => object} resolve - Arbiter.resolveChallenge
 * @returns {{movedPiece: object, defender: object|null, challenge: object|null}}
 */
function applyMove(board, from, to, resolve) {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const attacker = board[fr][fc];
  const defender = board[tr][tc];

  const challenge = defender ? resolve(attacker, defender) : null;
  const elim = new Set(challenge ? challenge.eliminatedIds : []);
  const attackerAlive = !elim.has(attacker.id);
  const defenderAlive = !defender || !elim.has(defender.id);

  board[fr][fc] = null;
  if (attackerAlive) {
    board[tr][tc] = attacker; // survivor takes the square
  } else if (defenderAlive) {
    board[tr][tc] = defender; // defender held the square
  } else {
    board[tr][tc] = null; // mutual elimination
  }

  return { movedPiece: attacker, defender, challenge };
}

module.exports = {
  ROWS,
  COLS,
  otherSide,
  emptyBoard,
  inBounds,
  setupRowsFor,
  backRowFor,
  isAdjacent,
  validateSetup,
  buildBoard,
  legalDestinations,
  hasAnyMove,
  allLegalMoves,
  countPieces,
  sanitizeBoardForPlayer,
  applyMove,
};
