import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Piece, PlacedPiece, Side } from '../../types';
import { COLS, PIECE_COUNT, rankBadge, rankLabel, setupRowsFor } from '../../lib/constants';
import { buildLoadout } from '../../lib/loadout';
import { cx } from '../ui';
import { Board } from '../Board/Board';

/** Build a board from placed pieces so the Board component can render it. */
function setupToBoard(side: Side, positions: PlacedPiece[]): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array(9).fill(null));
  positions.forEach((p) => {
    board[p.r][p.c] = { id: p.id, side, rank: p.rank };
  });
  return board;
}

/** Ghost token colors, mirroring the Piece component's side palette. */
const GHOST_CLASS = {
  white: 'bg-[var(--piece-white-bg)] text-[var(--piece-white-ink)] ring-[var(--piece-white-ring)]',
  black: 'bg-[var(--piece-black-bg)] text-[var(--piece-black-ink)] ring-[var(--piece-black-ring)]',
} as const;

interface SetupTrayProps {
  side: Side;
  positions: PlacedPiece[];
  onPlace: (id: string, r: number, c: number) => void;
  onPickup: (id: string) => void;
  ready: boolean;
  opponentReady: boolean;
  onLockIn: () => void;
  onUnready: () => void;
  onUseStandard: () => void;
  onClear: () => void;
}

/** A press that may become a drag, or resolve into a plain tap. */
interface Candidate {
  id: string | null; // piece being moved, or null if the press began on an empty square
  rank: number;
  startX: number;
  startY: number;
  moved: boolean;
  fromTray: boolean;
}

export function SetupTray({ side, positions, onPlace, onPickup, ready, opponentReady, onLockIn, onUnready, onUseStandard, onClear }: SetupTrayProps) {
  const loadout = useMemo(() => buildLoadout(side), [side]);
  const homeRows = setupRowsFor(side);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; rank: number; x: number; y: number } | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);

  const board = useMemo(() => setupToBoard(side, positions), [side, positions]);

  // Every square in the three home rows is a valid drop/pickup target during
  // setup; the game's turn/destination rules don't apply here.
  const clickableSquares = useMemo(() => {
    const s = new Set<string>();
    for (const r of homeRows) for (let c = 0; c < COLS; c += 1) s.add(`${r}:${c}`);
    return s;
  }, [homeRows]);

  const placedIds = useMemo(() => new Set(positions.map((p) => p.id)), [positions]);
  const remaining = loadout.filter((p) => !placedIds.has(p.id));
  const placedCount = positions.length;

  // Remaining pieces grouped by rank, preserving each piece's distinct id.
  const groups = useMemo(() => {
    const map = new Map<number, Array<{ id: string; rank: number }>>();
    for (const p of remaining) {
      const arr = map.get(p.rank);
      if (arr) arr.push(p);
      else map.set(p.rank, [p]);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [remaining]);

  // Live state read from inside the stable window listeners below.
  const candidateRef = useRef<Candidate | null>(null);
  const suppressClickRef = useRef(false); // swallow the synthetic click after a real drag
  const homeRowsRef = useRef(homeRows);
  homeRowsRef.current = homeRows;

  /** Resolve the board square under a viewport point, or null. */
  const squareFromPoint = useCallback((x: number, y: number): [number, number] | null => {
    const el = document.elementFromPoint(x, y);
    const cellEl = el ? (el.closest?.('[data-cell]') as HTMLElement | null) : null;
    const attr = cellEl?.getAttribute('data-cell');
    if (!attr) return null;
    const [r, c] = attr.split(':').map(Number);
    return [r, c];
  }, []);

  const handleMove = useCallback((e: PointerEvent) => {
    const c = candidateRef.current;
    if (!c) return;
    if (!c.moved) {
      // Only start the drag once the pointer has clearly moved (not a tap).
      if (Math.hypot(e.clientX - c.startX, e.clientY - c.startY) < 6) return;
      c.moved = true;
    }
    if (!c.id) return; // the press began on an empty square — nothing to drag
    setDrag({ id: c.id, rank: c.rank, x: e.clientX, y: e.clientY });
    const cell = squareFromPoint(e.clientX, e.clientY);
    setHoverCell(cell && homeRowsRef.current.includes(cell[0]) ? cell : null);
  }, [squareFromPoint]);

  const handleUp = useCallback((e: PointerEvent) => {
    const c = candidateRef.current;
    if (!c) return;
    candidateRef.current = null;
    if (c.moved && c.id) {
      const cell = squareFromPoint(e.clientX, e.clientY);
      if (cell && homeRowsRef.current.includes(cell[0])) {
        onPlace(c.id, cell[0], cell[1]);
        setSelectedId(null);
      }
      // A real drag ends with a synthetic click on the origin — swallow it so it
      // doesn't also toggle a selection or re-pick the piece up.
      suppressClickRef.current = true;
    }
    setDrag(null);
    setHoverCell(null);
  }, [squareFromPoint, onPlace]);

  const handleCancel = useCallback(() => {
    candidateRef.current = null;
    setDrag(null);
    setHoverCell(null);
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [handleMove, handleUp, handleCancel]);

  /** Begin tracking a press over a tray piece or a board square. */
  function startCandidate(id: string | null, rank: number, fromTray: boolean, e: ReactPointerEvent) {
    if (ready) return;
    candidateRef.current = { id, rank, startX: e.clientX, startY: e.clientY, moved: false, fromTray };
    // Capture so the follow-up click lands on this element (keeps suppression reliable).
    (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
  }

  // Board: pointer-down starts a drag only over a home-row square.
  function onSquarePointerDown(r: number, c: number, e: ReactPointerEvent) {
    if (!homeRows.includes(r)) return;
    const occupant = positions.find((p) => p.r === r && p.c === c);
    startCandidate(occupant ? occupant.id : null, occupant ? occupant.rank : 0, false, e);
  }

  // Board: a tap (or keyboard Enter) places the selected piece or picks one up.
  function onSquareClick(r: number, c: number) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (ready || !homeRows.includes(r)) return;
    const occupant = positions.find((p) => p.r === r && p.c === c);
    if (occupant) {
      onPickup(occupant.id);
      setSelectedId(occupant.id);
      return;
    }
    if (selectedId) {
      onPlace(selectedId, r, c);
      setSelectedId(null);
    }
  }

  // Tray: a tap (or keyboard Enter) toggles a piece's selection.
  function onTrayClick(id: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (ready) return;
    setSelectedId((s) => (s === id ? null : id));
  }

  const helper = drag
    ? 'Drop on one of your three home rows.'
    : selectedId
      ? 'Tap a home-row square to place it — or drag it there instead.'
      : 'Drag a piece onto one of your three home rows (or tap a piece, then a square).';

  return (
    <div className="space-y-4">
      <Board
        board={board}
        side={side}
        activeTurn={null}
        lastMove={null}
        selected={null}
        destinations={[]}
        onSquareClick={onSquareClick}
        onSquarePointerDown={onSquarePointerDown}
        clickableSquares={clickableSquares}
        hoverCell={hoverCell}
        draggingId={drag?.id ?? null}
      />

      <p className="min-h-[1rem] text-center text-xs text-faint">{helper}</p>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-label">
            Your pieces · {placedCount}/{PIECE_COUNT} placed
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onUseStandard} disabled={ready} className="text-xs text-accent hover:underline disabled:opacity-50">
              Standard
            </button>
            <button type="button" onClick={onClear} disabled={ready} className="text-xs text-faint hover:underline disabled:opacity-50">
              Clear
            </button>
          </div>
        </div>

        {remaining.length === 0 ? (
          <p className="text-sm text-muted">All pieces placed.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map(([rank, pieces]) => (
              <div key={rank} className="flex items-center gap-1">
                {pieces.map((entry) => {
                  const isSel = selectedId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onPointerDown={(e) => startCandidate(entry.id, entry.rank, true, e)}
                      onClick={() => onTrayClick(entry.id)}
                      aria-label={rankLabel(rank)}
                      title={rankLabel(rank)}
                      className={cx(
                        'flex h-9 w-9 touch-none select-none items-center justify-center rounded-full text-[11px] font-bold ring-2 transition',
                        isSel
                          ? 'cursor-grabbing bg-accent text-accent-ink ring-accent'
                          : 'cursor-grab bg-[var(--piece-white-bg)] text-[var(--piece-white-ink)] ring-[var(--piece-white-ring)] hover:ring-accent/60',
                      )}
                    >
                      {rankBadge(rank)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-faint">{opponentReady ? 'Opponent is ready.' : 'Waiting for opponent to be ready…'}</span>
        {ready ? (
          <button type="button" onClick={onUnready} className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold text-ink hover:bg-card-soft">
            Un-ready
          </button>
        ) : (
          <button
            type="button"
            onClick={onLockIn}
            disabled={placedCount !== PIECE_COUNT}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {placedCount === PIECE_COUNT ? 'Ready' : `Place ${PIECE_COUNT - placedCount} more`}
          </button>
        )}
      </div>

      {/* Floating ghost that follows the pointer while a piece is dragged. */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 h-9 w-9 -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.x, top: drag.y }}
        >
          <span className={cx('flex h-full w-full items-center justify-center rounded-full text-[11px] font-bold ring-2 shadow-lg shadow-black/40', GHOST_CLASS[side])}>
            {rankBadge(drag.rank)}
          </span>
        </div>
      )}
    </div>
  );
}
