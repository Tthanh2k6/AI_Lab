// ============================================================================
// Mê cung Q-learning — Reinforcement Learning (bảng Q)
// ============================================================================

export interface Pos { r: number; c: number; }

export interface QMaze {
  size: number;
  grid: number[][];   // 0 = trống, 1 = tường
  start: Pos;
  goal: Pos;
  optimal: number;    // độ dài đường ngắn nhất (BFS), -1 nếu không tới được
}

// up, down, left, right
export const ACTIONS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function bfs(grid: number[][], start: Pos, goal: Pos): number {
  const size = grid.length;
  const dist = Array.from({ length: size }, () => new Array(size).fill(-1));
  dist[start.r][start.c] = 0;
  const q: Pos[] = [start];
  let head = 0;
  while (head < q.length) {
    const { r, c } = q[head++];
    if (r === goal.r && c === goal.c) return dist[r][c];
    for (const [dr, dc] of ACTIONS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      if (grid[nr][nc] === 1 || dist[nr][nc] !== -1) continue;
      dist[nr][nc] = dist[r][c] + 1;
      q.push({ r: nr, c: nc });
    }
  }
  return -1;
}

/** Sinh mê cung ngẫu nhiên có tường, đảm bảo đi được từ start (góc trên-trái) tới goal (góc dưới-phải). */
export function generateMaze(size: number, wallRatio = 0.28): QMaze {
  const start: Pos = { r: 0, c: 0 };
  const goal: Pos = { r: size - 1, c: size - 1 };
  for (let attempt = 0; attempt < 200; attempt++) {
    const ratio = wallRatio - attempt * 0.001; // nới dần nếu khó tạo đường
    const grid = Array.from({ length: size }, () => new Array(size).fill(0));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if ((r === start.r && c === start.c) || (r === goal.r && c === goal.c)) continue;
      if (Math.random() < ratio) grid[r][c] = 1;
    }
    const optimal = bfs(grid, start, goal);
    if (optimal > 0) return { size, grid, start, goal, optimal };
  }
  // fallback: không tường
  const grid = Array.from({ length: size }, () => new Array(size).fill(0));
  return { size, grid, start, goal, optimal: bfs(grid, start, goal) };
}

// ─── Tác nhân Q-learning ─────────────────────────────────────────────────────

export interface QAgent {
  size: number;
  Q: number[][][]; // [r][c][action]
  alpha: number;
  gamma: number;
  epsilon: number;
  epsilonMin: number;
  epsilonDecay: number;
  pos: Pos;
  steps: number;
  maxSteps: number;
  episode: number;
  bestSteps: number;
  lastSteps: number;
  recent: boolean[]; // kết quả các tập gần nhất (tới đích?)
}

export function createAgent(maze: QMaze): QAgent {
  const size = maze.size;
  const Q = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [0, 0, 0, 0]));
  return {
    size,
    Q,
    alpha: 0.15,
    gamma: 0.95,
    epsilon: 1.0,
    epsilonMin: 0.05,
    epsilonDecay: 0.99,
    pos: { ...maze.start },
    steps: 0,
    maxSteps: Math.max(250, size * size * 4),
    episode: 1,
    bestSteps: Infinity,
    lastSteps: 0,
    recent: [],
  };
}

export function cellValue(agent: QAgent, r: number, c: number): number {
  const q = agent.Q[r][c];
  return Math.max(q[0], q[1], q[2], q[3]);
}

/** Hành động tốt nhất tại ô (argmax). -1 nếu ô chưa học (toàn 0). */
export function bestAction(agent: QAgent, r: number, c: number): number {
  const q = agent.Q[r][c];
  if (q[0] === 0 && q[1] === 0 && q[2] === 0 && q[3] === 0) return -1;
  let best = 0;
  for (let a = 1; a < 4; a++) if (q[a] > q[best]) best = a;
  return best;
}

function chooseAction(agent: QAgent, r: number, c: number): number {
  if (Math.random() < agent.epsilon) return Math.floor(Math.random() * 4);
  const q = agent.Q[r][c];
  let best = 0;
  for (let a = 1; a < 4; a++) if (q[a] > q[best]) best = a;
  return best;
}

/** Thực hiện 1 bước môi trường + cập nhật Q. Trả về sự kiện để màn hình xử lý hoạt ảnh. */
export function qStep(agent: QAgent, maze: QMaze): { reachedGoal: boolean; episodeEnded: boolean } {
  const { r, c } = agent.pos;
  const a = chooseAction(agent, r, c);
  const [dr, dc] = ACTIONS[a];
  let nr = r + dr, nc = c + dc;
  let reward: number;

  if (nr < 0 || nc < 0 || nr >= agent.size || nc >= agent.size || maze.grid[nr][nc] === 1) {
    nr = r; nc = c; reward = -2; // đụng tường/biên → đứng yên
  } else {
    reward = -1; // chi phí mỗi bước → khuyến khích đường ngắn
  }

  const reachedGoal = nr === maze.goal.r && nc === maze.goal.c;
  if (reachedGoal) reward = 100;

  const qn = agent.Q[nr][nc];
  const maxNext = Math.max(qn[0], qn[1], qn[2], qn[3]);
  const target = reachedGoal ? reward : reward + agent.gamma * maxNext;
  agent.Q[r][c][a] += agent.alpha * (target - agent.Q[r][c][a]);

  agent.pos = { r: nr, c: nc };
  agent.steps++;

  let episodeEnded = false;
  if (reachedGoal || agent.steps >= agent.maxSteps) {
    episodeEnded = true;
    agent.lastSteps = agent.steps;
    if (reachedGoal && agent.steps < agent.bestSteps) agent.bestSteps = agent.steps;
    agent.recent.push(reachedGoal);
    if (agent.recent.length > 50) agent.recent.shift();
    agent.epsilon = Math.max(agent.epsilonMin, agent.epsilon * agent.epsilonDecay);
    agent.episode++;
    agent.pos = { ...maze.start };
    agent.steps = 0;
  }
  return { reachedGoal, episodeEnded };
}

export function successRate(agent: QAgent): number {
  if (agent.recent.length === 0) return 0;
  return agent.recent.filter(Boolean).length / agent.recent.length;
}
