import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { getSocketUrl } from '../services/api';
import { useAuth } from './AuthContext';
import type {
  Board,
  Conclusion,
  LastMove,
  Phase,
  SetupPosition,
  Side,
} from '../types';

export interface SocketState {
  connected: boolean;
  phase: Phase;
  roomCode: string | null;
  side: Side | null;
  opponent: string | null;
  opponentConnected: boolean;
  board: Board | null;
  activeTurn: Side | null;
  turnStartedAt: number | null;
  turnSeconds: number;
  lastMove: LastMove | null;
  myReady: boolean;
  opponentReady: boolean;
  conclusion: Conclusion | null;
  queuePosition: number | null;
  queueLength: number | null;
  error: string | null;
}

const INITIAL: SocketState = {
  connected: false,
  phase: 'idle',
  roomCode: null,
  side: null,
  opponent: null,
  opponentConnected: false,
  board: null,
  activeTurn: null,
  turnStartedAt: null,
  turnSeconds: 60,
  lastMove: null,
  myReady: false,
  opponentReady: false,
  conclusion: null,
  queuePosition: null,
  queueLength: null,
  error: null,
};

interface SocketContextValue extends SocketState {
  /** Local placement during the setup phase (not yet sent). */
  mySetup: SetupPosition[];
  setMySetup: (positions: SetupPosition[]) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  joinQueue: () => void;
  leaveLobby: () => void;
  lockIn: () => void;
  unready: () => void;
  move: (from: [number, number], to: [number, number]) => void;
  resign: () => void;
  dismissError: () => void;
  reset: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function freshMatch(): Partial<SocketState> {
  return {
    phase: 'idle',
    roomCode: null,
    side: null,
    opponent: null,
    opponentConnected: false,
    board: null,
    activeTurn: null,
    turnStartedAt: null,
    lastMove: null,
    myReady: false,
    opponentReady: false,
    conclusion: null,
    queuePosition: null,
    queueLength: null,
    error: null,
  };
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SocketState>(INITIAL);
  const [mySetup, setMySetupState] = useState<SetupPosition[]>([]);
  const socketRef = useRef<Socket | null>(null);
  // Always-current snapshot so event handlers never read a stale closure.
  const stateRef = useRef(state);
  const patch = useCallback((p: Partial<SocketState>) => {
    setState((s) => {
      const next = { ...s, ...p };
      stateRef.current = next;
      return next;
    });
  }, []);

  // (Re)connect whenever the auth token changes (sourced from AuthContext so
  // logout/login in the same render tree actually tears down / opens the socket).
  const { token } = useAuth();
  useEffect(() => {
    if (!token) return;
    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => patch({ connected: true }));
    socket.on('disconnect', () => patch({ connected: false }));
    socket.on('connect_error', () => patch({ connected: false }));

    // ----- Lobby -----
    socket.on('lobby:joined', (p: { code: string; side: Side; opponent: { username: string } | null }) => {
      setMySetupState([]);
      patch({ ...freshMatch(), phase: 'setup', roomCode: p.code, side: p.side, opponent: p.opponent?.username ?? null, opponentConnected: true });
    });
    socket.on('lobby:opponent-joined', (p: { opponent: { username: string } }) => {
      patch({ opponent: p.opponent.username, opponentConnected: true });
    });
    socket.on('lobby:queued', (p: { position: number; queueLength: number }) => {
      patch({ phase: 'queued', queuePosition: p.position, queueLength: p.queueLength });
    });
    socket.on('lobby:left', () => patch(freshMatch()));
    socket.on('lobby:status-result', (p: { inRoom: string | null; roomPhase: string | null; queueLength: number }) => {
      if (p.inRoom) patch({ roomCode: p.inRoom });
      patch({ queueLength: p.queueLength });
    });
    socket.on('lobby:error', (p: { reason: string }) => patch({ error: p.reason }));
    socket.on('room:closed', () => patch(freshMatch()));
    socket.on('room:replaced', () => {
      // A newer tab took our seat; drop this one.
      socket.disconnect();
      setState((s) => {
        const next = { ...s, ...freshMatch(), error: 'You are connected in another tab.' };
        stateRef.current = next;
        return next;
      });
    });

    // ----- Setup -----
    socket.on('setup:locked', (p: { ready: { white: boolean; black: boolean } }) => {
      const side = stateRef.current.side;
      patch({
        myReady: side ? p.ready[side] : false,
        opponentReady: side ? p.ready[side === 'white' ? 'black' : 'white'] : false,
      });
    });
    socket.on('setup:opponent-ready', () => patch({ opponentReady: true }));
    socket.on('setup:error', (p: { reason: string }) => patch({ error: p.reason }));

    // ----- Match -----
    socket.on('match:start', (p: { board: Board; side: Side; roomCode: string; activeTurn: Side; turnStartedAt: number; turnSeconds: number; opponent: { username: string } }) => {
      patch({
        phase: 'playing',
        board: p.board,
        side: p.side,
        roomCode: p.roomCode,
        activeTurn: p.activeTurn,
        turnStartedAt: p.turnStartedAt,
        turnSeconds: p.turnSeconds,
        opponent: p.opponent.username,
        lastMove: null,
        myReady: true,
        opponentReady: true,
      });
    });
    socket.on('board:update', (p: { board: Board; activeTurn: Side; lastMove: LastMove | null; turnStartedAt: number; turnSeconds: number }) => {
      patch({ board: p.board, activeTurn: p.activeTurn, lastMove: p.lastMove, turnStartedAt: p.turnStartedAt, turnSeconds: p.turnSeconds });
    });
    socket.on('move:error', (p: { reason: string }) => patch({ error: p.reason }));

    // ----- Conclusion -----
    socket.on('match:conclude', (conclusion: Conclusion) => {
      patch({ phase: 'concluded', conclusion, board: conclusion.fullBoard });
    });

    // ----- Presence -----
    socket.on('room:opponent-left', (p: { phase: string; graceMs: number }) => {
      patch({ opponentConnected: false, error: 'Opponent disconnected. ' + (p.phase === 'setup' ? 'They have a short window to reconnect.' : 'They will lose if they do not return.') });
    });
    socket.on('match:opponent-reconnected', () => patch({ opponentConnected: true, error: null }));

    // ----- Resync (sent automatically on (re)connect) -----
    socket.on('room:resync', (p: {
      roomCode: string;
      side: Side;
      phase: string;
      opponent: { username: string } | null;
      opponentConnected: boolean;
      turnSeconds: number;
      setup?: { positions: SetupPosition[]; ready: { white: boolean; black: boolean } };
      board?: Board;
      activeTurn?: Side;
      turnStartedAt?: number;
      lastMove?: LastMove | null;
      conclusion?: Conclusion;
    }) => {
      const base = {
        roomCode: p.roomCode,
        side: p.side,
        opponent: p.opponent?.username ?? null,
        opponentConnected: p.opponentConnected,
        turnSeconds: p.turnSeconds,
      };
      if (p.phase === 'setup') {
        setMySetupState(p.setup?.positions ?? []);
        patch({ ...base, phase: 'setup', myReady: p.setup?.ready[p.side] ?? false, opponentReady: p.setup?.ready[p.side === 'white' ? 'black' : 'white'] ?? false, board: null });
      } else if (p.phase === 'playing') {
        patch({ ...base, phase: 'playing', board: p.board, activeTurn: p.activeTurn, turnStartedAt: p.turnStartedAt, lastMove: p.lastMove ?? null });
      } else if (p.phase === 'concluded') {
        patch({ ...base, phase: 'concluded', conclusion: p.conclusion, board: p.conclusion?.fullBoard });
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, patch]);

  const createRoom = useCallback(() => {
    patch({ ...freshMatch(), error: null });
    socketRef.current?.emit('lobby:create');
  }, [patch]);

  const joinRoom = useCallback(
    (code: string) => {
      patch({ ...freshMatch(), error: null });
      socketRef.current?.emit('lobby:join', { code });
    },
    [patch],
  );

  // Join the public matchmaking queue (server pairs with another queued player).
  const joinQueue = useCallback(() => {
    patch({ ...freshMatch(), error: null, phase: 'queued' });
    socketRef.current?.emit('lobby:join', {});
  }, [patch]);

  const leaveLobby = useCallback(() => {
    setMySetupState([]);
    patch(freshMatch());
    socketRef.current?.emit('lobby:leave');
  }, [patch]);

  const setMySetup = useCallback((positions: SetupPosition[]) => setMySetupState(positions), []);

  const lockIn = useCallback(() => {
    socketRef.current?.emit('setup:ready', { positions: mySetup });
  }, [mySetup]);

  const unready = useCallback(() => {
    patch({ myReady: false, opponentReady: false });
    socketRef.current?.emit('setup:unready');
  }, [patch]);

  const move = useCallback((from: [number, number], to: [number, number]) => {
    socketRef.current?.emit('move:request', { from, to });
  }, []);

  const resign = useCallback(() => {
    socketRef.current?.emit('match:resign');
  }, []);

  const dismissError = useCallback(() => patch({ error: null }), [patch]);

  const reset = useCallback(() => {
    setMySetupState([]);
    patch(freshMatch());
  }, [patch]);

  const value = useMemo<SocketContextValue>(
    () => ({ ...state, mySetup, setMySetup, createRoom, joinRoom, joinQueue, leaveLobby, lockIn, unready, move, resign, dismissError, reset }),
    [state, mySetup, setMySetup, createRoom, joinRoom, joinQueue, leaveLobby, lockIn, unready, move, resign, dismissError, reset],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
