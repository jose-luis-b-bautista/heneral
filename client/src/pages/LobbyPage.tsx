import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import { Card, ErrorBanner, Field, inputClass, primaryButtonClass, secondaryButtonClass, Spinner } from '../components/ui';
import { SetupTray } from '../components/Setup/SetupTray';

export function LobbyPage() {
  const { user } = useAuth();
  const socket = useSocket();
  const { positions, place, pickup, useStandard, clear } = useGame();

  // Setup phase: render the placement board + tray.
  if (socket.phase === 'setup' && socket.side) {
    return (
      <div className="space-y-3">
        <SetupTray
          side={socket.side}
          positions={positions}
          onPlace={place}
          onPickup={pickup}
          ready={socket.myReady}
          opponentReady={socket.opponentReady}
          onLockIn={socket.lockIn}
          onUnready={socket.unready}
          onUseStandard={useStandard}
          onClear={clear}
        />
        <div className="flex items-center justify-between text-xs text-faint">
          <button type="button" onClick={socket.leaveLobby} className="hover:text-ink hover:underline">
            Leave room
          </button>
          <span>Room code: <span className="font-mono text-label">{socket.roomCode}</span></span>
        </div>
      </div>
    );
  }

  // Queued for matchmaking.
  if (socket.phase === 'queued') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner label="Searching for an opponent…" />
          <p className="text-sm text-muted">
            {socket.queuePosition !== null ? `Position in queue: ${socket.queuePosition}` : 'Finding a match…'}
          </p>
          <button type="button" onClick={socket.leaveLobby} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      </Card>
    );
  }

  return <LobbyHome user={user?.username ?? ''} socket={socket} />;
}

function LobbyHome({ user, socket }: { user: string; socket: ReturnType<typeof useSocket> }) {
  const [code, setCode] = useState('');

  function onJoin(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) socket.joinRoom(trimmed);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Welcome, {user}</h2>
          <span className={socket.connected ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>
            {socket.connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>
        {socket.error ? (
          <div className="mb-3">
            <ErrorBanner onDismiss={socket.dismissError}>{socket.error}</ErrorBanner>
          </div>
        ) : null}

        <button type="button" onClick={socket.createRoom} className={`${primaryButtonClass} w-full`}>
          Create a match
        </button>
        <p className="mt-2 text-center text-xs text-faint">Get a 6-character code to share with a friend.</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Join with a code</h2>
        <form onSubmit={onJoin} className="flex gap-2">
          <Field label="Room code">
            <input
              className={`${inputClass} font-mono uppercase tracking-widest`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              maxLength={6}
              required
            />
          </Field>
          <button type="submit" className={`${secondaryButtonClass} shrink-0 self-end`} disabled={code.trim().length < 6}>
            Join
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Quick match</h2>
        <p className="mb-3 text-xs text-faint">Join the public queue and we’ll pair you with another player.</p>
        <button type="button" onClick={socket.joinQueue} className={`${secondaryButtonClass} w-full`}>
          Find an opponent
        </button>
      </Card>
    </div>
  );
}
