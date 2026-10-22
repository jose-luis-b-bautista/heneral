import { describe, expect, it } from 'vitest';
import { PIECE_COUNT, PIECES, setupRowsFor, standardSetup } from './constants';
import { buildLoadout, loadoutRankMap, standardPlacement } from './loadout';
import type { PlacedPiece } from '../types';

function countMultiset(positions: Array<{ rank: number }>): Map<number, number> {
  const map = new Map<number, number>();
  for (const p of positions) map.set(p.rank, (map.get(p.rank) || 0) + 1);
  return map;
}

const expectedMultiset = countMultiset(PIECES.flatMap((p) => Array.from({ length: p.count }, () => p)));

describe('buildLoadout', () => {
  it('produces 21 pieces with unique ids', () => {
    for (const side of ['white', 'black'] as const) {
      const loadout = buildLoadout(side);
      expect(loadout).toHaveLength(PIECE_COUNT);
      expect(new Set(loadout.map((p) => p.id)).size).toBe(PIECE_COUNT);
    }
  });

  it('matches the expected piece-count multiset', () => {
    const loadout = buildLoadout('white');
    expect(countMultiset(loadout)).toEqual(expectedMultiset);
  });
});

describe('standardSetup / standardPlacement', () => {
  it('standardSetup places 21 pieces inside the home rows, no overlaps', () => {
    for (const side of ['white', 'black'] as const) {
      const setup = standardSetup(side);
      expect(setup).toHaveLength(PIECE_COUNT);
      const rows = setupRowsFor(side);
      const seen = new Set<string>();
      for (const p of setup) {
        expect(rows).toContain(p.r);
        expect(p.c).toBeGreaterThanOrEqual(0);
        expect(p.c).toBeLessThan(9);
        const key = `${p.r}:${p.c}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      // Multiset must match the loadout exactly.
      expect(countMultiset(setup)).toEqual(expectedMultiset);
    }
  });

  it('standardPlacement pairs each standard position with the same-rank loadout id', () => {
    for (const side of ['white', 'black'] as const) {
      const placement: PlacedPiece[] = standardPlacement(side);
      expect(placement).toHaveLength(PIECE_COUNT);
      const rankMap = loadoutRankMap(side);
      // Each placed piece's declared rank must equal its id's true rank.
      for (const p of placement) {
        expect(rankMap.get(p.id)).toBe(p.rank);
      }
      // Positions must line up with standardSetup.
      const std = standardSetup(side);
      placement.forEach((p, i) => {
        expect(p.r).toBe(std[i].r);
        expect(p.c).toBe(std[i].c);
        expect(p.rank).toBe(std[i].rank);
      });
    }
  });
});
