import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { countPieces, describeLastMove, legalDestinations } from '../lib/game';
import { otherSide } from '../lib/constants';
import { Board } from './Board/Board';
import { HUD } from './HUD/HUD';
import { PostMatchModal } from './Modals/PostMatchModal';
import { ErrorBanner, Notice } from './ui';

export function GameView() {
  const { board, side, activeTurn, turnStartedAt, turnSeconds, lastMove, opponent, conclusion, error, move, resign, dismissError, reset } = useSocket();
  const { play } = useSoundEffects();
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const prevConclusion = useRef<string | null>(null);
  const prevMoveId = useRef<string | null>(null);

  // Show the result modal the first time a new conclusion arrives.
  useEffect(() => {
    if (conclusion && prevConclusion.current !== conclusion.roomCode) {
      prevConclusion.current = conclusion.roomCode;
      setShowModal(true);
      if (side) play(conclusion.winnerSide === side ? 'win' : 'lose');
    }
  }, [conclusion, side, play]);

  // Sfx for the latest board update (capture vs. plain move).
  useEffect(() => {
    if (!lastMove) return;
    const id = lastMove.movedPieceId;
    if (prevMoveId.current === id) return;
    prevMoveId.current = id;
    play(lastMove.outcome === 'MOVE' ? 'move' : 'capture');
  }, [lastMove, play]);

  const myTurn = side !== null && activeTurn === side;

  const destinations = useMemo(() => {
    if (!board || !selected || !myTurn) return [];
    const piece = board[selected[0]][selected[1]];
    if (!piece || piece.side !== side) return [];
    return legalDestinations(board, selected[0], selected[1]);
  }, [board, selected, myTurn, side]);

  const myPieces = useMemo(() => (board && side ? countPieces(board, side) : 0), [board, side]);
  const oppPieces = useMemo(() => (board && side ? countPieces(board, otherSide(side)) : 0), [board, side]);

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (!board || !myTurn) return;
      const cell = board[r][c];
      // If a piece is selected and this is a legal destination, make the move.
      if (selected && destinations.some(([rr, cc]) => rr === r && cc === c)) {
        move(selected, [r, c]);
        setSelected(null);
        return;
      }
      // Otherwise, select one of my pieces (if it's my turn and I own it).
      if (cell && cell.side === side) {
        setSelected(selected && selected[0] === r && selected[1] === c ? null : [r, c]);
      } else {
        setSelected(null);
      }
    },
    [board, myTurn, selected, destinations, side, move],
  );

  if (!board || !side || !activeTurn) return null;

  const lastMoveText = lastMove ? describeLastMove(lastMove.outcome, lastMove.auto) : null;

  return (
    <div className="space-y-3">
      {error ? <ErrorBanner onDismiss={dismissError}>{error}</ErrorBanner> : null}

      {lastMoveText ? <div className="text-xs text-muted">{lastMoveText}</div> : null}

      <HUD side={side} opponent={opponent} activeTurn={activeTurn} turnStartedAt={turnStartedAt} turnSeconds={turnSeconds} myPieces={myPieces} oppPieces={oppPieces} onResign={resign} />

      <Board board={board} side={side} activeTurn={activeTurn} lastMove={lastMove} selected={selected} destinations={destinations} onSquareClick={handleSquareClick} />

      {!myTurn && !conclusion ? <Notice tone="info">Waiting for {opponent ?? 'your opponent'} to make a move…</Notice> : null}

      {conclusion && showModal ? <PostMatchModal conclusion={conclusion} side={side} onClose={() => setShowModal(false)} onRematch={reset} /> : null}
    </div>
  );
}
