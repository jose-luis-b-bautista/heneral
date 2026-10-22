import { memo, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Board as BoardType, LastMove, Side } from '../../types';
import { COLUMN_LETTERS, ROWS } from '../../lib/constants';
import { cx } from '../ui';
import { Piece } from './Piece';

interface BoardProps {
  board: BoardType;
  /** The viewer's side — drives row orientation (own base at the bottom). */
  side: Side;
  activeTurn: Side | null;
  lastMove: LastMove | null;
  selected: [number, number] | null;
  destinations: [number, number][];
  onSquareClick?: (r: number, c: number) => void;
  /**
   * When provided, a square is clickable iff its `"r:c"` key is in this set,
   * overriding the default game rules. Used by the setup screen, where the
   * turn/destination logic doesn't apply and only home-row squares are valid.
   */
  clickableSquares?: Set<string>;
  /** Fired on pointer-down over a square — the setup screen uses it to start a drag. */
  onSquarePointerDown?: (r: number, c: number, e: ReactPointerEvent) => void;
  /** A square highlighted as a valid drop target while a piece is being dragged. */
  hoverCell?: [number, number] | null;
  /** Id of the piece currently being dragged; it is faded in place while moving. */
  draggingId?: string | null;
}

/** Board coordinates for a display row, given the viewer's side. */
function boardRowFor(displayRow: number, side: Side): number {
  return side === 'white' ? ROWS - 1 - displayRow : displayRow;
}

/** Column letter header for the viewer (columns are not flipped). */
function columnHeader(side: Side, c: number): string {
  return side === 'white' ? COLUMN_LETTERS[c] : COLUMN_LETTERS[COLUMN_LETTERS.length - 1 - c];
}

export const Board = memo(function Board({
  board,
  side,
  activeTurn,
  lastMove,
  selected,
  destinations,
  onSquareClick,
  clickableSquares,
  onSquarePointerDown,
  hoverCell,
  draggingId,
}: BoardProps) {
  const destSet = useMemo(() => new Set(destinations.map(([r, c]) => `${r}:${c}`)), [destinations]);
  const lastSet = useMemo(() => {
    if (!lastMove) return new Set<string>();
    return new Set([`${lastMove.from[0]}:${lastMove.from[1]}`, `${lastMove.to[0]}:${lastMove.to[1]}`]);
  }, [lastMove]);

  const isMyTurn = activeTurn === side;

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {/* Column letters */}
      <div className="grid grid-cols-9 gap-1 px-0.5 pb-1" aria-hidden>
        {COLUMN_LETTERS.map((_, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-faint">
            {columnHeader(side, i)}
          </div>
        ))}
      </div>

      <div
        role="grid"
        aria-label="Game board"
        className="grid aspect-[9/8] w-full grid-cols-9 gap-1 rounded-lg border border-border p-1"
      >
        {Array.from({ length: ROWS }).map((_, displayRow) => {
          const boardRow = boardRowFor(displayRow, side);
          return Array.from({ length: board[0].length }).map((_, col) => {
            const cell = board[boardRow][col];
            const key = `${boardRow}:${col}`;
            const isSelected = selected?.[0] === boardRow && selected?.[1] === col;
            const isDest = destSet.has(key);
            const isLast = lastSet.has(key);
            const isHover = hoverCell?.[0] === boardRow && hoverCell?.[1] === col;
            const isCapturable = isDest && cell != null;
            const clickable =
              clickableSquares !== undefined
                ? clickableSquares.has(key)
                : (cell != null && cell.side === side && isMyTurn) || isDest;
            // A square can start a drag when it holds one of the viewer's pieces
            // and a pointer-down handler was provided (i.e. during setup).
            const grabbable = onSquarePointerDown !== undefined && cell != null && cell.side === side;

            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-label={`Square ${columnHeader(side, col)}${displayRow + 1}`}
                data-cell={key}
                onClick={() => onSquareClick?.(boardRow, col)}
                onPointerDown={(e) => onSquarePointerDown?.(boardRow, col, e)}
                disabled={!clickable}
                className={cx(
                  'relative flex items-center justify-center rounded-md transition-colors select-none',
                  (boardRow + col) % 2 === 0 ? 'bg-[var(--board-cell-a)]' : 'bg-[var(--board-cell-b)]',
                  isLast && 'ring-2 ring-inset ring-accent/40',
                  isHover && 'ring-2 ring-inset ring-emerald-400/80',
                  isSelected && 'ring-2 ring-inset ring-[var(--board-selected)]',
                  isDest && !isCapturable && 'after:absolute after:inset-0 after:m-auto after:h-2.5 after:w-2.5 after:rounded-full after:bg-[var(--board-highlight)] after:opacity-70',
                  isCapturable && 'ring-2 ring-inset ring-red-400/80',
                  grabbable && 'cursor-grab touch-none active:cursor-grabbing',
                  clickable && !grabbable && 'cursor-pointer hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--board-highlight)]',
                  !clickable && 'cursor-default',
                )}
              >
                {cell ? (
                  <span
                    className="flex h-full w-full items-center justify-center"
                    style={{ opacity: draggingId != null && cell.id === draggingId ? 0.35 : 1 }}
                  >
                    <Piece piece={cell} />
                  </span>
                ) : null}
              </button>
            );
          });
        })}
      </div>
    </div>
  );
});
