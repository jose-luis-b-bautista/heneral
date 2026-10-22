'use strict';

/**
 * Shared game constants (server side).
 * The client keeps its own copy in client/src/lib/constants.ts — keep them in
 * sync if the piece set ever changes.
 */
const ROWS = 8;
const COLS = 9;

/**
 * Piece catalogue. Ranks intentionally skip 3 and 4
 * (Sergeant = 2, then 2nd Lieutenant = 5) to match the classic table.
 */
const PIECES = [
  { key: 'gen5', name: 'Five-Star General', rank: 15, count: 1 },
  { key: 'gen4', name: 'Four-Star General', rank: 14, count: 1 },
  { key: 'gen3', name: 'Three-Star General', rank: 13, count: 1 },
  { key: 'gen2', name: 'Two-Star General', rank: 12, count: 1 },
  { key: 'gen1', name: 'One-Star General', rank: 11, count: 1 },
  { key: 'colonel', name: 'Colonel', rank: 10, count: 1 },
  { key: 'ltcolonel', name: 'Lt. Colonel', rank: 9, count: 1 },
  { key: 'major', name: 'Major', rank: 8, count: 1 },
  { key: 'captain', name: 'Captain', rank: 7, count: 1 },
  { key: 'lt1', name: '1st Lieutenant', rank: 6, count: 1 },
  { key: 'lt2', name: '2nd Lieutenant', rank: 5, count: 1 },
  { key: 'sergeant', name: 'Sergeant', rank: 2, count: 1 },
  { key: 'private', name: 'Private', rank: 1, count: 6 },
  { key: 'spy', name: 'Spy', rank: 0, count: 2 },
  { key: 'flag', name: 'Flag', rank: -1, count: 1 },
];

const PIECE_COUNT = PIECES.reduce((n, p) => n + p.count, 0); // 21

const RANK = {
  FLAG: -1,
  SPY: 0,
  PRIVATE: 1,
  SERGEANT: 2,
  LT2: 5,
  LT1: 6,
  CAPTAIN: 7,
  MAJOR: 8,
  LTCOLONEL: 9,
  COLONEL: 10,
  GEN1: 11,
  GEN2: 12,
  GEN3: 13,
  GEN4: 14,
  GEN5: 15,
};

const SIDES = ['white', 'black'];

function otherSide(side) {
  return side === 'white' ? 'black' : 'white';
}

module.exports = { ROWS, COLS, PIECES, PIECE_COUNT, RANK, SIDES, otherSide };
