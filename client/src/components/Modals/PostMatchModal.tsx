import { useMemo } from 'react';
import type { Board, Conclusion, Side } from '../../types';
import { countPieces } from '../../lib/game';
import { cx } from '../ui';
import { Board as BoardView } from '../Board/Board';

const REASON_TEXT: Record<string, string> = {
  FLAG_CAPTURED: 'Flag captured',
  FLAG_REACHED_BACK_RANK: 'Flag reached the enemy back rank',
  STALEMATE: 'Opponent had no legal moves',
  RESIGNATION: 'Opponent resigned',
  DISCONNECT: 'Opponent disconnected',
};

interface PostMatchModalProps {
  conclusion: Conclusion;
  side: Side;
  onClose: () => void;
  onRematch: () => void;
}

function resultTitle(conclusion: Conclusion, side: Side): { text: string; won: boolean } {
  if (!conclusion.winnerSide) return { text: 'Draw', won: false };
  const won = conclusion.winnerSide === side;
  return { text: won ? 'You won' : 'You lost', won };
}

export function PostMatchModal({ conclusion, side, onClose, onRematch }: PostMatchModalProps) {
  const { text, won } = resultTitle(conclusion, side);
  const board = useMemo<Board>(() => conclusion.fullBoard, [conclusion]);
  const my = countPieces(board, side);
  const opp = countPieces(board, side === 'white' ? 'black' : 'white');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Match result">
      <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className={cx('text-xl font-bold', won ? 'text-accent' : 'text-red-300')}>{text}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg text-faint hover:text-ink">
            ✕
          </button>
        </div>

        <p className="mb-1 text-sm text-ink">
          {conclusion.winner ? `${conclusion.winner.username} wins` : 'No winner'} — {REASON_TEXT[conclusion.reason] || conclusion.reason}.
        </p>
        <p className="mb-4 text-xs text-faint">
          {my} of your pieces and {opp} of theirs remain on the board. All enemy ranks are now revealed.
        </p>

        <BoardView board={board} side={side} activeTurn={null} lastMove={null} selected={null} destinations={[]} onSquareClick={() => {}} />

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={onRematch} className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong">
            Back to lobby
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-semibold text-ink hover:bg-card-soft">
            Keep viewing
          </button>
        </div>
      </div>
    </div>
  );
}
