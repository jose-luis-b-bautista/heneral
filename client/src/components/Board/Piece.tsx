import type { Piece as PieceType } from '../../types';
import { rankBadge } from '../../lib/constants';
import { cx } from '../ui';

const SIDE_CLASSES = {
  white: 'bg-[var(--piece-white-bg)] text-[var(--piece-white-ink)] ring-[var(--piece-white-ring)]',
  black: 'bg-[var(--piece-black-bg)] text-[var(--piece-black-ink)] ring-[var(--piece-black-ring)]',
} as const;

const HIDDEN_CLASS = 'bg-[var(--piece-hidden-bg)] text-[var(--piece-hidden-ink)] ring-white/10';

/**
 * A single piece token. Enemy pieces arrive with rank 'HIDDEN' (fog of war)
 * and render as a featureless back until revealed at the end of the match.
 */
export function Piece({ piece, small = false }: { piece: PieceType; small?: boolean }) {
  const hidden = piece.rank === 'HIDDEN';
  const cls = hidden ? HIDDEN_CLASS : SIDE_CLASSES[piece.side];
  return (
    <span
      className={cx(
        'flex select-none items-center justify-center rounded-full font-bold ring-2 shadow-md shadow-black/30',
        small ? 'h-6 w-6 text-[9px] leading-none' : 'h-full w-full text-[11px] leading-none sm:text-xs',
        cls,
      )}
      title={hidden ? 'Unknown piece' : undefined}
    >
      <span aria-hidden>{hidden ? '?' : rankBadge(piece.rank as number)}</span>
    </span>
  );
}
