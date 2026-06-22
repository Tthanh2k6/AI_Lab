export type FifaFsmState = 
  | 'IDLE' 
  | 'CHASE' 
  | 'ATTACKING' 
  | 'DEFENDING' 
  | 'WALK_TO_SET_PIECE' 
  | 'CELEBRATE';

export type FifaPlayerRole = 'GK' | 'DEF' | 'MID' | 'ATT';

export interface PlayerStats {
  speed: number;        // Max running speed (e.g., 2.5 - 4.5)
  passing: number;      // 0 - 100 accuracy
  shooting: number;     // 0 - 100 accuracy & power
  defending: number;    // 0 - 100 tackle success & speed
  reactionTime: number; // Interval in ms between decision updates (e.g., 100 - 300ms)
}

export interface FifaPlayer {
  id: string;
  name: string;
  number: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  team: 'A' | 'B';
  angle: number;
  baseRole: FifaPlayerRole;
  fsmState: FifaFsmState;
  
  // Tactical & Dynamic
  homeX: number;        // Dynamic tactical position set by Macro AI
  homeY: number;
  stamina: number;      // 0 - 100
  dashCooldown: number;  // Ticks
  sprintTimer: number;   // Ticks active
  isSprinting: boolean;
  hasBall: boolean;
  
  // Stats
  stats: PlayerStats;
  lastDecisionTick: number; // Game tick of last FSM update
}

export interface FifaBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ownerId: string | null;
  lastOwnerId: string | null;
  lastOwnerTime: number; // Ticks
}

export type GlobalGameState = 
  | 'PLAYING' 
  | 'GOAL_CELEBRATION' 
  | 'OUT_OF_BOUNDS' 
  | 'SET_PIECE' 
  | 'HALF_TIME'
  | 'GAME_OVER';

export type SetPieceType = 'KICK_OFF' | 'THROW_IN' | 'CORNER_KICK' | 'GOAL_KICK';

export interface FifaConfig {
  formationA: '4-3-3' | '4-4-2' | '3-5-2' | '5-4-1';
  formationB: '4-3-3' | '4-4-2' | '3-5-2' | '5-4-1';
  gameMode: 'player' | 'spectator';
  difficulty: 'easy' | 'medium' | 'hard';
  matchDuration: number; // in simulated minutes (e.g., 90) or real seconds (e.g., 90s)
  playerCount: 3 | 5 | 7 | 11;
}

export interface MatchStats {
  scoreA: number;
  scoreB: number;
  possessionA: number; // in %
  possessionB: number;
  shotsA: number;
  shotsB: number;
  passesA: number;
  passesAttemptedA: number;
  passesB: number;
  passesAttemptedB: number;
  tacklesA: number;
  tacklesB: number;
}
