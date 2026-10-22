import type { Board, Side } from '../types';
import { COLS, ROWS } from './constants';

/** Orthogonal neighbour deltas: down, up, right, left. */
const DELTAS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

/**
 * Legal destination squares for the piece at (r, c): the orthogonal neighbours
 * that are in-bounds and not occupied by a friendly piece. Mirrors the server
 * exactly, so the client can highlight moves and pre-validate before sending.
 */
export function legalDestinations(board: Board, r: number, c: number): [number, number][] {
  const piece = board[r]?.[c];
  if (!piece) return [];
  const dests: [number, number][] = [];
  for (const [dr, dc] of DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = board[nr][nc];
    if (target && target.side === piece.side) continue; // friendly: blocked
    dests.push([nr, nc]);
  }
  return dests;
}

export function key(r: number, c: number): string {
  return `${r}:${c}`;
}

/** A set of "r:c" keys for quick lookup. */
export function toKeySet(dests: [number, number][]): Set<string> {
  return new Set(dests.map(([r, c]) => key(r, c)));
}

/** Counts remaining pieces for a side (for the HUD / capture tally). */
export function countPieces(board: Board, side: Side): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell && cell.side === side) n += 1;
  return n;
}

/** True when `side`'s flag is still on the board. */
export function flagAlive(board: Board, side: Side): boolean {
  for (const row of board) for (const cell of row) if (cell && cell.side === side && cell.rank === -1) return true;
  return false;
}

/** Descriptive outcome text for the last move, without leaking enemy ranks. */
export function describeLastMove(outcome: string, auto: boolean): string | null {
  let base: string | null = null;
  switch (outcome) {
    case 'MOVE':
      base = 'Piece moved';
      break;
    case 'ATTACKER_WINS':
      base = 'Attack successful — one piece eliminated';
      break;
    case 'DEFENDER_WINS':
      base = 'Attack repelled — the attacker was eliminated';
      break;
    case 'MUTUAL_ELIMINATION':
      base = 'Clash — both pieces eliminated';
      break;
    default:
      base = null;
  }
  if (!base) return null;
  return auto ? `${base} (auto-move, time expired)` : base;
}
