export type Player = 'X' | 'O';
export type Cell = Player | null;
export type Board = Cell[][];

export interface Move {
  r: number; // row index (0 to 19)
  c: number; // col index (0 to 19)
}

export type GameStatus = 'PLAYING' | 'WON' | 'DRAW';

export type AIAlgorithm = 'MINIMAX' | 'MCTS' | 'RANDOM';

export interface HeuristicWeights {
  win5: number;       // 5 in a row
  live4: number;      // Open 4 (e.g. .XXXX.)
  closed4: number;    // Closed/Blocked 4 (e.g. OXXXX. or .XXXXO)
  live3: number;      // Open 3 (e.g. .XXX.)
  closed3: number;    // Closed/Blocked 3 (e.g. OXXX. or .XXXO)
  live2: number;      // Open 2 (e.g. .XX.)
  closed2: number;    // Closed/Blocked 2 (e.g. OXX. or .XXO)
  doubleLive3: number; // 3-3 Fork (Nước đôi 3)
  fork43: number;      // 4-3 Fork (Nước đôi 4-3)
  blockLive4: number;  // Block opponent Live 4 (Chặn nước 4 đối thủ)
  blockLive3: number;  // Block opponent Live 3 (Chặn nước 3 đối thủ)
  center: number;     // Preference for middle of the board
}

export interface AIConfig {
  algorithm: AIAlgorithm;
  maxDepth: number;               // For Minimax
  mctsSimulations: number;        // For MCTS
  explorationConstant: number;    // For MCTS UCT (C constant)
  useTranspositionTable: boolean; // Enable/Disable Zobrist TT
  useBoundingBox: boolean;        // Restrict search near existing stones
  weights: HeuristicWeights;      // Adjustable / Evolving weights
}

export interface SearchMetrics {
  nodesEvaluated: number;
  maxDepthReached: number;
  timeSpentMs: number;
  transpositionHits: number;
  evaluationScore: number;
}

export interface GameRecord {
  winner: Player | 'DRAW';
  movesCount: number;
}

export interface TrainingMetrics {
  gamesPlayed: number;
  ai1Wins: number;
  ai2Wins: number;
  draws: number;
  winRateHistory50: number[]; // rolling last 50 games win rate
  generation: number;
}

// ============================================================================
// RACING GAME TYPES
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface Line {
  p1: Point;
  p2: Point;
}

export interface NetworkLayer {
  inputs: number;
  outputs: number;
  weights: number[][]; // [outputNode][inputNode]
  biases: number[];    // [outputNode]
}

export interface NeuralNetworkType {
  layers: NetworkLayer[];
}

export interface RacingConfig {
  numCars: number;
  numSensors: number;
  mutationRate: number;
  speed: number; // constant speed
  trackId: string; // 'oval' | 'scurve' | 'grandprix' | 'random' | 'custom'
  enableFailureAvoidance: boolean;
  enablePlayerCar: boolean;
  customTrack?: any;
}

// ============================================================================
// FLAPPY BIRD GAME TYPES
// ============================================================================

export interface FlappyConfig {
  populationSize: number; // số chim mỗi thế hệ
  mutationRate: number;   // tỉ lệ đột biến (0..1)
  gapSize: number;        // độ rộng khe giữa 2 ống (px) — độ khó
}

// ============================================================================
// 2048 GAME TYPES
// ============================================================================

export interface Game2048Config {
  speed: number; // tốc độ AI tự chơi ban đầu (1..8)
}

// ============================================================================
// Q-LEARNING MAZE TYPES
// ============================================================================

export interface QMazeConfig {
  size: number;  // kích thước lưới (vd 8..16)
  speed: number; // tốc độ học ban đầu (bước/khung)
}

// ============================================================================
// CONNECT FOUR TYPES
// ============================================================================

export interface Connect4Config {
  depth: number; // độ sâu Minimax (sức mạnh AI)
  speed: number; // tốc độ máy đấu máy (1..4)
}

// ============================================================================
// SOCCER ARENA TYPES (2 AI tiến hoá đối kháng trong phòng kín 3D)
// ============================================================================

export interface SoccerConfig {
  mutationRate: number; // tỉ lệ đột biến khi tiến hoá (0..1)
  speed: number;        // số tick mô phỏng mỗi khung hình (1..8) — tua nhanh quá trình học
}

// ============================================================================
// SOCCER 2 — Dẫn bóng + Kỹ năng sút + Va chạm cứng
// ============================================================================

export interface Soccer2Config {
  mutationRate: number;
  speed: number;
}

// ============================================================================
// TAG GAME — Đuổi bắt 3D (Chaser vs Evader)
// ============================================================================

export interface TagConfig {
  mutationRate: number; // tỉ lệ đột biến (0..1)
  speed: number;        // số tick mô phỏng mỗi frame
}
