// Shared client-side types, mirroring the server's wire protocol.

export type Side = 'white' | 'black';

/** A rank value, or the fog-of-war placeholder for hidden enemy pieces. */
export type Rank = number | 'HIDDEN';

export interface Piece {
  id: string;
  side: Side;
  rank: Rank;
}

/** 8 rows x 9 cols. `null` = empty square. */
export type Board = (Piece | null)[][];

export type ChallengeOutcome = 'ATTACKER_WINS' | 'DEFENDER_WINS' | 'MUTUAL_ELIMINATION';

export interface LastMove {
  from: [number, number];
  to: [number, number];
  movedPieceId: string;
  defenderId: string | null;
  eliminatedIds: string[];
  outcome: ChallengeOutcome | 'MOVE';
  flagCaptured: boolean;
  auto: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
}

export type Phase = 'idle' | 'queued' | 'setup' | 'playing' | 'concluded';

export type ConcludeReason =
  | 'FLAG_CAPTURED'
  | 'FLAG_REACHED_BACK_RANK'
  | 'STALEMATE'
  | 'RESIGNATION'
  | 'DISCONNECT';

export interface Conclusion {
  roomCode: string;
  winnerSide: Side | null;
  reason: ConcludeReason;
  winner: { id: string; username: string } | null;
  fullBoard: Board;
}

export interface ReadyState {
  white: boolean;
  black: boolean;
}

/** Setup placement payload sent via `setup:ready`. */
export interface SetupPosition {
  rank: number;
  r: number;
  c: number;
}

/** A locally-tracked placed piece: a setup position plus its stable tray id. */
export interface PlacedPiece extends SetupPosition {
  id: string;
}

/** Everything the client needs to render a live match. */
export interface MatchState {
  roomCode: string;
  side: Side;
  opponent: string | null;
  opponentConnected: boolean;
  activeTurn: Side | null;
  turnStartedAt: number | null;
  turnSeconds: number;
  lastMove: LastMove | null;
  ready: ReadyState;
  conclusion: Conclusion | null;
}
