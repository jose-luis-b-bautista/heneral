import type { SetupPosition, Side } from '../types';

// Keep in sync with server/src/game/constants.js

export const ROWS = 8;
export const COLS = 9;

export interface PieceDef {
  key: string;
  name: string;
  rank: number;
  count: number;
}

export const PIECES: PieceDef[] = [
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

export const PIECE_COUNT = PIECES.reduce((n, p) => n + p.count, 0); // 21

export const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

/** Board rows a side may place on during setup. */
export function setupRowsFor(side: Side): number[] {
  return side === 'white' ? [0, 1, 2] : [5, 6, 7];
}

/** The opponent's back row a flag must reach to win. */
export function backRowFor(side: Side): number {
  return side === 'white' ? ROWS - 1 : 0;
}

export function otherSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

/**
 * The full 21-piece loadout for one side, in the same order as `buildLoadout`
 * (the PIECES catalogue order, privates/spies first). A row-major fill of the
 * three home rows yields a valid standard formation. The server validates the
 * multiset of ranks, so the exact row ordering is not gameplay-significant.
 */
export function standardSetup(side: Side): SetupPosition[] {
  const rows = setupRowsFor(side);
  const ranks = PIECES.flatMap((p) => Array.from({ length: p.count }, () => p.rank));
  const positions: SetupPosition[] = [];
  for (let i = 0; i < PIECE_COUNT; i += 1) {
    positions.push({ rank: ranks[i], r: rows[Math.floor(i / 9)], c: i % 9 });
  }
  return positions;
}

/** Human-friendly label for a numeric rank. */
export function rankLabel(rank: number): string {
  if (rank === -1) return 'Flag';
  if (rank === 0) return 'Spy';
  const def = PIECES.find((p) => p.rank === rank);
  return def ? def.name : `Rank ${rank}`;
}

/** Short badge shown on a piece: ⚑ flag, SPY, PRV, SGT, LT1/LT2, CAP, MAJ… ★5. */
export function rankBadge(rank: number): string {
  switch (rank) {
    case -1:
      return '⚑';
    case 0:
      return 'SPY';
    case 1:
      return 'PRV';
    case 2:
      return 'SGT';
    case 5:
      return 'LT2';
    case 6:
      return 'LT1';
    case 7:
      return 'CAP';
    case 8:
      return 'MAJ';
    case 9:
      return 'LTC';
    case 10:
      return 'COL';
    case 11:
      return '★1';
    case 12:
      return '★2';
    case 13:
      return '★3';
    case 14:
      return '★4';
    case 15:
      return '★5';
    default:
      return String(rank);
  }
}
