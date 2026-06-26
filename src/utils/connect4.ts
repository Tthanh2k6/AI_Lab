// ============================================================================
// Connect Four (Cờ thả 4 quân) — Minimax + Alpha-Beta
// ============================================================================

export const COLS = 7;
export const ROWS = 6;
export type Board = number[][]; // [row][col], r=0 trên cùng; 0 trống, 1 đỏ, 2 vàng

const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

export function newBoard(): Board {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

export function cloneBoard(b: Board): Board {
  return b.map(row => row.slice());
}

export function validCols(b: Board): number[] {
  return CENTER_ORDER.filter(c => b[0][c] === 0);
}

/** Hàng mà quân sẽ rơi xuống ở cột col (thấp nhất còn trống), -1 nếu đầy. */
export function dropRow(b: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (b[r][col] === 0) return r;
  return -1;
}

const ALL_WINDOWS: [number, number][][] = (() => {
  const w: [number, number][][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c + 3 < COLS) w.push([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]);
    if (r + 3 < ROWS) w.push([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]);
    if (r + 3 < ROWS && c + 3 < COLS) w.push([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]);
    if (r + 3 < ROWS && c - 3 >= 0) w.push([[r, c], [r + 1, c - 1], [r + 2, c - 2], [r + 3, c - 3]]);
  }
  return w;
})();

/** Tìm đường thắng: trả về { player, cells } hoặc null. */
export function findWin(b: Board): { player: number; cells: [number, number][] } | null {
  for (const win of ALL_WINDOWS) {
    const [a, bb, cc, dd] = win;
    const v = b[a[0]][a[1]];
    if (v !== 0 && v === b[bb[0]][bb[1]] && v === b[cc[0]][cc[1]] && v === b[dd[0]][dd[1]]) {
      return { player: v, cells: win };
    }
  }
  return null;
}

export function isFull(b: Board): boolean {
  return b[0].every(v => v !== 0);
}

// ─── Heuristic ───────────────────────────────────────────────────────────────

function scoreWindow(cells: [number, number][], b: Board, player: number): number {
  const opp = player === 1 ? 2 : 1;
  let p = 0, o = 0, e = 0;
  for (const [r, c] of cells) {
    const v = b[r][c];
    if (v === player) p++; else if (v === opp) o++; else e++;
  }
  if (p === 4) return 100000;
  if (p === 3 && e === 1) return 50;
  if (p === 2 && e === 2) return 10;
  if (o === 3 && e === 1) return -80; // chặn đối thủ
  return 0;
}

function scorePosition(b: Board, player: number): number {
  let score = 0;
  // Ưu tiên cột giữa
  for (let r = 0; r < ROWS; r++) if (b[r][3] === player) score += 6;
  for (const win of ALL_WINDOWS) score += scoreWindow(win, b, player);
  return score;
}

// ─── Minimax + Alpha-Beta ────────────────────────────────────────────────────

function minimax(b: Board, depth: number, alpha: number, beta: number, maxing: boolean, ai: number): number {
  const win = findWin(b);
  if (win) return win.player === ai ? 1000000 + depth : -1000000 - depth;
  if (isFull(b)) return 0;
  if (depth === 0) return scorePosition(b, ai);

  const opp = ai === 1 ? 2 : 1;
  const cols = validCols(b);
  if (maxing) {
    let best = -Infinity;
    for (const c of cols) {
      const r = dropRow(b, c);
      b[r][c] = ai;
      best = Math.max(best, minimax(b, depth - 1, alpha, beta, false, ai));
      b[r][c] = 0;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of cols) {
      const r = dropRow(b, c);
      b[r][c] = opp;
      best = Math.min(best, minimax(b, depth - 1, alpha, beta, true, ai));
      b[r][c] = 0;
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }
}

/** Nước đi tốt nhất cho `player` (chọn ngẫu nhiên trong các nước tốt ngang nhau cho đa dạng). */
export function bestMove(board: Board, player: number, depth = 6): number {
  const b = cloneBoard(board);
  const cols = validCols(b);
  if (cols.length === 0) return -1;
  let bestScore = -Infinity;
  let bestCols: number[] = [];
  for (const c of cols) {
    const r = dropRow(b, c);
    b[r][c] = player;
    const score = minimax(b, depth - 1, -Infinity, Infinity, false, player);
    b[r][c] = 0;
    if (score > bestScore + 1e-6) { bestScore = score; bestCols = [c]; }
    else if (Math.abs(score - bestScore) <= 1e-6) bestCols.push(c);
  }
  return bestCols[Math.floor(Math.random() * bestCols.length)];
}

/** Điểm Minimax của từng cột (null nếu cột đầy) — để hiển thị "AI đang nghĩ". */
export function columnScores(board: Board, player: number, depth = 6): (number | null)[] {
  const b = cloneBoard(board);
  const res: (number | null)[] = new Array(COLS).fill(null);
  for (let c = 0; c < COLS; c++) {
    if (b[0][c] !== 0) continue;
    const r = dropRow(b, c);
    b[r][c] = player;
    res[c] = minimax(b, depth - 1, -Infinity, Infinity, false, player);
    b[r][c] = 0;
  }
  return res;
}

/** Cột tốt nhất từ bảng điểm (ngẫu nhiên trong các cột ngang điểm). */
export function bestColFromScores(scores: (number | null)[]): number {
  let bv = -Infinity, cands: number[] = [];
  scores.forEach((v, c) => {
    if (v == null) return;
    if (v > bv + 1e-6) { bv = v; cands = [c]; }
    else if (Math.abs(v - bv) <= 1e-6) cands.push(c);
  });
  return cands.length ? cands[Math.floor(Math.random() * cands.length)] : -1;
}
