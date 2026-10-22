import type { PlacedPiece, Side } from '../types';
import { PIECES, standardSetup } from './constants';

/**
 * The 21-piece loadout for a side, in a fixed order (the PIECES catalogue
 * order, with privates/spies repeated). Each entry has a stable `id`
 * (`side-key-index`). This ordering is the single source of truth for pairing
 * tray pieces with board squares.
 */
export function buildLoadout(side: Side): Array<{ id: string; rank: number }> {
  const out: Array<{ id: string; rank: number }> = [];
  PIECES.forEach((p) => {
    for (let i = 0; i < p.count; i += 1) out.push({ id: `${side}-${p.key}-${i}`, rank: p.rank });
  });
  return out;
}

/** id -> rank lookup, for re-deriving a rank when a piece is placed. */
export function loadoutRankMap(side: Side): Map<string, number> {
  return new Map(buildLoadout(side).map((p) => [p.id, p.rank]));
}

/**
 * A standard-formation placement as PlacedPieces. `standardSetup` emits ranks
 * in the exact same order as `buildLoadout`, so positions pair 1:1 by index
 * with the loadout ids.
 */
export function standardPlacement(side: Side): PlacedPiece[] {
  const loadout = buildLoadout(side);
  const positions = standardSetup(side);
  return positions.map((pos, i) => ({
    id: loadout[i].id,
    rank: loadout[i].rank,
    r: pos.r,
    c: pos.c,
  }));
}
