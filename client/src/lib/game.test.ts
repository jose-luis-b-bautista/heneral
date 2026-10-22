import { describe, expect, it } from 'vitest';
import { countPieces, describeLastMove, flagAlive, key, legalDestinations, toKeySet } from './game';
import type { Board, Piece } from '../types';

function cell(side: 'white' | 'black', rank: number, id: string): Piece {
  return { id, side, rank };
}

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(9).fill(null));
}

describe('legalDestinations', () => {
  it('returns orthogonal neighbours, blocked by friendly pieces', () => {
    const board = emptyBoard();
    board[3][4] = cell('white', 1, 'w1');
    // No neighbours occupied: four orthogonal moves.
    const dests = legalDestinations(board, 3, 4);
    expect(toKeySet(dests)).toEqual(new Set(['3:3', '3:5', '2:4', '4:4']));
  });

  it('clamps at board edges and allows capturing an enemy square', () => {
    const board = emptyBoard();
    board[0][0] = cell('white', 1, 'w1');
    board[1][0] = cell('black', 1, 'b1'); // enemy: capturable
    board[0][1] = cell('white', 1, 'w2'); // friendly: blocked
    const dests = legalDestinations(board, 0, 0);
    // Only (1,0) is legal: (−1,0) and (0,−1) off-board, (0,1) friendly.
    expect(dests).toEqual([[1, 0]]);
  });

  it('returns empty for an empty square', () => {
    const board = emptyBoard();
    expect(legalDestinations(board, 4, 4)).toEqual([]);
  });
});

describe('helpers', () => {
  it('toKeySet round-trips coordinates', () => {
    expect(toKeySet([[1, 2], [3, 4]])).toEqual(new Set([key(1, 2), key(3, 4)]));
  });

  it('countPieces and flagAlive tally the board', () => {
    const board = emptyBoard();
    board[0][0] = cell('white', 1, 'w1');
    board[1][1] = cell('white', 5, 'w2');
    board[0][1] = cell('white', -1, 'w-flag');
    board[7][8] = cell('black', 0, 'b1');
    expect(countPieces(board, 'white')).toBe(3);
    expect(countPieces(board, 'black')).toBe(1);
    expect(flagAlive(board, 'white')).toBe(true);
    expect(flagAlive(board, 'black')).toBe(false);
  });

  it('describeLastMove labels outcomes and notes auto-moves', () => {
    expect(describeLastMove('MOVE', false)).toBe('Piece moved');
    expect(describeLastMove('MUTUAL_ELIMINATION', false)).toContain('both pieces');
    expect(describeLastMove('MOVE', true)).toContain('auto-move');
    expect(describeLastMove('SOMETHING_ELSE', false)).toBeNull();
  });
});
