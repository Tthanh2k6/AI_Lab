// ============================================================================
// 2048 — Logic trò chơi + AI Expectimax
// ============================================================================

export const GRID = 4;
export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export interface Tile {
  id: number;
  value: number;
  r: number;
  c: number;
  merged?: boolean; // vừa hợp nhất → hiệu ứng "pop"
  isNew?: boolean;  // vừa sinh ra → hiệu ứng "xuất hiện"
}

interface Cell { r: number; c: number; }

let _idSeq = 1;
const newId = () => _idSeq++;

// Thứ tự ô theo từng hàng/cột, "đầu" (nơi dồn về) đứng trước.
function buildLines(dir: Dir): Cell[][] {
  const lines: Cell[][] = [];
  for (let i = 0; i < GRID; i++) {
    const line: Cell[] = [];
    for (let j = 0; j < GRID; j++) {
      if (dir === 'left') line.push({ r: i, c: j });
      else if (dir === 'right') line.push({ r: i, c: GRID - 1 - j });
      else if (dir === 'up') line.push({ r: j, c: i });
      else line.push({ r: GRID - 1 - j, c: i }); // down
    }
    lines.push(line);
  }
  return lines;
}

// ─── Quản lý tile (cho hoạt ảnh) ─────────────────────────────────────────────

export function spawnTile(tiles: Tile[]): Tile | null {
  const occ = new Set(tiles.map(t => `${t.r},${t.c}`));
  const empties: Cell[] = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    if (!occ.has(`${r},${c}`)) empties.push({ r, c });
  }
  if (empties.length === 0) return null;
  const cell = empties[Math.floor(Math.random() * empties.length)];
  const t: Tile = { id: newId(), value: Math.random() < 0.9 ? 2 : 4, r: cell.r, c: cell.c, isNew: true };
  tiles.push(t);
  return t;
}

export function newGame(): Tile[] {
  const tiles: Tile[] = [];
  spawnTile(tiles);
  spawnTile(tiles);
  return tiles;
}

/**
 * Tính kết quả 1 nước đi cho hoạt ảnh:
 *  - slid:   vị trí MỌI tile sau khi trượt (kể cả tile bị nuốt, GIỮ id) → pha trượt.
 *  - settled: trạng thái sau hợp nhất (tile bị nuốt biến mất, tile sống nhân đôi) → pha chốt.
 */
export function planMove(tiles: Tile[], dir: Dir): { slid: Tile[]; settled: Tile[]; moved: boolean; gained: number } {
  const slid: Tile[] = tiles.map(t => ({ id: t.id, value: t.value, r: t.r, c: t.c }));
  const byId = new Map(slid.map(t => [t.id, t]));
  const settled: Tile[] = [];
  let moved = false;
  let gained = 0;

  for (const cells of buildLines(dir)) {
    const lineTiles = cells
      .map(cell => tiles.find(t => t.r === cell.r && t.c === cell.c))
      .filter((t): t is Tile => !!t);

    let targetIdx = 0;
    let lastSurvivor: Tile | null = null;
    let lastMerged = false;

    for (const t of lineTiles) {
      const st = byId.get(t.id)!;
      if (lastSurvivor && lastSurvivor.value === t.value && !lastMerged) {
        // Hợp nhất vào ô của tile sống trước đó
        const cell = cells[targetIdx - 1];
        if (st.r !== cell.r || st.c !== cell.c) moved = true;
        st.r = cell.r; st.c = cell.c;
        lastSurvivor.value *= 2;
        lastSurvivor.merged = true;
        gained += lastSurvivor.value;
        lastMerged = true;
      } else {
        const cell = cells[targetIdx];
        if (st.r !== cell.r || st.c !== cell.c) moved = true;
        const survivor: Tile = { id: t.id, value: t.value, r: cell.r, c: cell.c };
        settled.push(survivor);
        lastSurvivor = survivor;
        lastMerged = false;
        targetIdx++;
      }
    }
  }
  return { slid, settled, moved, gained };
}

// ─── Lưới số (cho AI) ────────────────────────────────────────────────────────

export function tilesToGrid(tiles: Tile[]): number[][] {
  const g = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
  for (const t of tiles) g[t.r][t.c] = t.value;
  return g;
}

function gridMove(grid: number[][], dir: Dir): { grid: number[][]; moved: boolean; gained: number } {
  const g = grid.map(row => row.slice());
  let moved = false, gained = 0;
  for (const cells of buildLines(dir)) {
    const vals = cells.map(c => g[c.r][c.c]).filter(v => v !== 0);
    const merged: number[] = [];
    let i = 0;
    while (i < vals.length) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        const m = vals[i] * 2; merged.push(m); gained += m; i += 2;
      } else { merged.push(vals[i]); i++; }
    }
    for (let k = 0; k < cells.length; k++) {
      const nv = k < merged.length ? merged[k] : 0;
      const cell = cells[k];
      if (g[cell.r][cell.c] !== nv) moved = true;
      g[cell.r][cell.c] = nv;
    }
  }
  return { grid: g, moved, gained };
}

export function movesAvailable(tiles: Tile[]): boolean {
  const grid = tilesToGrid(tiles);
  return DIRS.some(d => gridMove(grid, d).moved);
}

// ─── Heuristic đánh giá bàn cờ ───────────────────────────────────────────────

const W_EMPTY = 270;
const W_MONO = 47;
const W_SMOOTH = 9;
const W_MAX = 110;
const W_CORNER = 220;

const lg = (v: number) => (v > 0 ? Math.log2(v) : 0);

function evaluate(grid: number[][]): number {
  let empty = 0, maxv = 0, smooth = 0;
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const v = grid[r][c];
    if (v === 0) empty++; else if (v > maxv) maxv = v;
  }

  // Smoothness: phạt chênh lệch giữa các ô kề nhau (theo log)
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    if (grid[r][c] === 0) continue;
    const lv = lg(grid[r][c]);
    if (c + 1 < GRID && grid[r][c + 1] !== 0) smooth -= Math.abs(lv - lg(grid[r][c + 1]));
    if (r + 1 < GRID && grid[r + 1][c] !== 0) smooth -= Math.abs(lv - lg(grid[r + 1][c]));
  }

  // Monotonicity: hàng/cột nên tăng hoặc giảm đều
  let mono = 0;
  for (let r = 0; r < GRID; r++) {
    let inc = 0, dec = 0;
    for (let c = 0; c < GRID - 1; c++) {
      const a = lg(grid[r][c]), b = lg(grid[r][c + 1]);
      if (a > b) dec += b - a; else inc += a - b;
    }
    mono += Math.max(inc, dec);
  }
  for (let c = 0; c < GRID; c++) {
    let inc = 0, dec = 0;
    for (let r = 0; r < GRID - 1; r++) {
      const a = lg(grid[r][c]), b = lg(grid[r + 1][c]);
      if (a > b) dec += b - a; else inc += a - b;
    }
    mono += Math.max(inc, dec);
  }

  // Thưởng nếu ô lớn nhất nằm ở góc
  let corner = 0;
  const corners = [grid[0][0], grid[0][GRID - 1], grid[GRID - 1][0], grid[GRID - 1][GRID - 1]];
  if (corners.includes(maxv)) corner = lg(maxv);

  return empty * W_EMPTY + mono * W_MONO + smooth * W_SMOOTH + lg(maxv) * W_MAX + corner * W_CORNER;
}

// ─── Expectimax ──────────────────────────────────────────────────────────────

function countEmpty(grid: number[][]): number {
  let e = 0;
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (grid[r][c] === 0) e++;
  return e;
}

function expectimax(grid: number[][], depth: number, chance: boolean): number {
  if (depth <= 0) return evaluate(grid);

  if (chance) {
    const empties: Cell[] = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (grid[r][c] === 0) empties.push({ r, c });
    if (empties.length === 0) return evaluate(grid);
    let total = 0;
    for (const e of empties) {
      grid[e.r][e.c] = 2;
      total += 0.9 * expectimax(grid, depth - 1, false);
      grid[e.r][e.c] = 4;
      total += 0.1 * expectimax(grid, depth - 1, false);
      grid[e.r][e.c] = 0;
    }
    return total / empties.length;
  }

  let best = -Infinity;
  for (const d of DIRS) {
    const { grid: g, moved } = gridMove(grid, d);
    if (moved) best = Math.max(best, expectimax(g, depth - 1, true));
  }
  return best === -Infinity ? evaluate(grid) : best;
}

/** Chọn nước đi tốt nhất bằng expectimax (độ sâu thích nghi theo số ô trống). */
export function bestMove(tiles: Tile[], depthOverride?: number): Dir | null {
  const grid = tilesToGrid(tiles);
  const empties = countEmpty(grid);
  const depth = depthOverride ?? (empties >= 6 ? 3 : empties >= 3 ? 4 : 6);

  let best: Dir | null = null;
  let bestVal = -Infinity;
  for (const d of DIRS) {
    const { grid: g, moved } = gridMove(grid, d);
    if (!moved) continue;
    const v = expectimax(g, depth - 1, true);
    if (v > bestVal) { bestVal = v; best = d; }
  }
  return best;
}

export type DirScores = { up: number | null; down: number | null; left: number | null; right: number | null };

/** Điểm Expectimax của từng hướng (null nếu hướng đó không đi được) — để hiển thị "AI đang nghĩ". */
export function moveScores(tiles: Tile[], depthOverride?: number): DirScores {
  const grid = tilesToGrid(tiles);
  const empties = countEmpty(grid);
  const depth = depthOverride ?? (empties >= 6 ? 3 : empties >= 3 ? 4 : 6);
  const res: DirScores = { up: null, down: null, left: null, right: null };
  for (const d of DIRS) {
    const { grid: g, moved } = gridMove(grid, d);
    if (moved) res[d] = expectimax(g, depth - 1, true);
  }
  return res;
}

/** Hướng tốt nhất từ bảng điểm. */
export function bestDirFromScores(s: DirScores): Dir | null {
  let best: Dir | null = null, bv = -Infinity;
  (Object.keys(s) as Dir[]).forEach(d => { const v = s[d]; if (v != null && v > bv) { bv = v; best = d; } });
  return best;
}
