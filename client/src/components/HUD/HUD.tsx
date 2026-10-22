import { useEffect, useState } from 'react';
import type { Side } from '../../types';
import { cx } from '../ui';

interface HUDProps {
  side: Side;
  opponent: string | null;
  activeTurn: Side;
  turnStartedAt: number | null;
  turnSeconds: number;
  myPieces: number;
  oppPieces: number;
  onResign: () => void;
}

/** A ticking countdown (seconds) for the active turn. */
function useCountdown(activeTurn: Side, side: Side, turnStartedAt: number | null, turnSeconds: number): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (activeTurn !== side || !turnStartedAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [activeTurn, side, turnStartedAt]);
  if (activeTurn !== side || !turnStartedAt) return null;
  const remaining = Math.max(0, turnSeconds - Math.floor((now - turnStartedAt) / 1000));
  return remaining;
}

export function HUD({ side, opponent, activeTurn, turnStartedAt, turnSeconds, myPieces, oppPieces, onResign }: HUDProps) {
  const countdown = useCountdown(activeTurn, side, turnStartedAt, turnSeconds);
  const isMyTurn = activeTurn === side;
  const low = countdown !== null && countdown <= 10;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            isMyTurn ? 'bg-accent text-accent-ink' : 'bg-card-soft text-muted',
          )}
        >
          <span className={cx('h-2 w-2 rounded-full', isMyTurn ? 'bg-accent-ink' : 'bg-current')} aria-hidden />
          {isMyTurn ? 'Your move' : `${opponent ?? 'Opponent'} is thinking`}
        </span>
        {countdown !== null ? (
          <span className={cx('font-mono text-sm tabular-nums', low ? 'text-red-400' : 'text-label')}>
            {isMyTurn ? `${countdown}s` : '—'}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted">
        <span>
          <span className="font-semibold text-ink">{myPieces}</span> your pieces
        </span>
        <span>
          <span className="font-semibold text-ink">{oppPieces}</span> theirs
        </span>
        <button
          type="button"
          onClick={onResign}
          className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 font-semibold text-red-200 transition hover:bg-red-950/70"
        >
          Resign
        </button>
      </div>
    </div>
  );
}
