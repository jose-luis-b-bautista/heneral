import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSocket } from './SocketContext';
import type { PlacedPiece, Side } from '../types';
import { loadoutRankMap, standardPlacement } from '../lib/loadout';

interface GameContextValue {
  positions: PlacedPiece[];
  placedCount: number;
  place: (id: string, r: number, c: number) => void;
  pickup: (id: string) => void;
  useStandard: () => void;
  clear: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

/**
 * Owns the local, not-yet-sent piece placement for the setup phase. The
 * socket layer mirrors `positions` (minus the tray id) for lock-in/resync.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const { side, setMySetup } = useSocket();
  const [positions, setPositions] = useState<PlacedPiece[]>([]);
  const sideRef = useRef<Side | null>(side);
  sideRef.current = side;

  // Reset placement whenever the side changes or the room is torn down.
  useEffect(() => {
    setPositions([]);
  }, [side]);

  // Keep the socket layer's mySetup in sync with our local placement.
  useEffect(() => {
    setMySetup(positions.map(({ id: _id, ...pos }) => pos));
  }, [positions, setMySetup]);

  const place = useCallback((id: string, r: number, c: number) => {
    const s = sideRef.current;
    if (!s) return;
    setPositions((prev) => {
      const rank = loadoutRankMap(s).get(id) ?? 0;
      const without = prev.filter((p) => p.id !== id);
      const cleared = without.filter((p) => !(p.r === r && p.c === c));
      return [...cleared, { id, rank, r, c }];
    });
  }, []);

  const pickup = useCallback((id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const useStandard = useCallback(() => {
    if (!side) return;
    setPositions(standardPlacement(side));
  }, [side]);

  const clear = useCallback(() => setPositions([]), []);

  const value = useMemo<GameContextValue>(
    () => ({ positions, placedCount: positions.length, place, pickup, useStandard, clear }),
    [positions, place, pickup, useStandard, clear],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}
