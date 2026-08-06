// ============================================================================
// CELL WAR — Chiến tranh lãnh thổ (kiểu Territorial.io / State.io)
//   • Lưới ô vuông, mỗi phe (faction) chiếm các ô và sinh quân theo thời gian.
//   • Ô biên giới đẩy quân sang ô láng giềng để CHIẾM (đánh chiếm theo số quân).
//   • Mỗi phe có MỘT CHIẾN THUẬT khác nhau (hung hãn / mở rộng / cơ hội...) →
//     xem chiến thuật nào thống trị. Phe cuối cùng còn sống thắng.
//   • Thuần heuristic (không mạng nơ-ron) — mô phỏng AI chiến lược, chạy mượt.
// ============================================================================

export type Strategy = 'aggressive' | 'expand' | 'opportunist' | 'defensive' | 'balanced';

export interface StrategyInfo { id: Strategy; name: string; desc: string; }
export const STRATEGIES: StrategyInfo[] = [
  { id: 'aggressive',  name: 'Hung hãn',  desc: 'Ưu tiên tấn công phe địch, dồn quân mạnh.' },
  { id: 'expand',      name: 'Bành trướng', desc: 'Ưu tiên chiếm đất trung lập rẻ, lan nhanh.' },
  { id: 'opportunist', name: 'Cơ hội',    desc: 'Luôn đánh ô yếu nhất xung quanh.' },
  { id: 'defensive',   name: 'Phòng thủ', desc: 'Chỉ đánh khi quân đầy, lan chậm & chắc.' },
  { id: 'balanced',    name: 'Cân bằng',  desc: 'Pha trộn: nhắm ô yếu, hơi thiên về địch.' },
];

// Bảng màu các phe (id 1..N)
export const FACTION_COLORS = [
  { name: 'Đỏ',    hex: '#ef4444', rgb: [239, 68, 68] },
  { name: 'Xanh dương', hex: '#3b82f6', rgb: [59, 130, 246] },
  { name: 'Xanh lá', hex: '#22c55e', rgb: [34, 197, 94] },
  { name: 'Vàng',  hex: '#eab308', rgb: [234, 179, 8] },
  { name: 'Tím',   hex: '#a855f7', rgb: [168, 85, 247] },
  { name: 'Lục lam', hex: '#06b6d4', rgb: [6, 182, 212] },
] as const;

export const MAP_SIZES = {
  small:  { cols: 42, rows: 28, label: 'Nhỏ (42×28)' },
  medium: { cols: 54, rows: 36, label: 'Vừa (54×36)' },
  large:  { cols: 68, rows: 44, label: 'Lớn (68×44)' },
} as const;
export type MapSizeKey = keyof typeof MAP_SIZES;

export const CW = {
  NEUTRAL_DEF: 3,       // garrison cố định của ô trung lập
  MAX_TROOPS:  60,      // trần quân mỗi ô
  SEED_TROOPS: 25,      // quân khởi đầu ở thủ phủ
  GROWTH_INTERVAL: 7,   // mỗi 7 tick thì ô có chủ +1 quân
  ATTACK_MIN:  3,       // quân tối thiểu để 1 ô dám tấn công
  DIFFUSE_FRAC: 0.10,   // tỉ lệ ô nội địa được khuếch tán quân/tick
  ATTACK_FRAC:  0.18,   // tỉ lệ ô biên được hành động/tick
  STAT_INTERVAL: 8,     // nhịp tính lại thống kê & kiểm tra thắng
  MATCH_TICKS: 60 * 90, // ~90s trần thời gian (rồi tính phe nhiều đất nhất)
} as const;

export interface Faction {
  id: number;            // 1..N
  name: string;
  colorHex: string;
  rgb: [number, number, number];
  strategy: Strategy;
  alive: boolean;
  tiles: number;
  troops: number;
}

export interface CellWarWorld {
  cols: number; rows: number; n: number;
  owner: Uint8Array;     // 0 = trung lập, 1..N = phe
  troops: Float32Array;  // số quân mỗi ô
  factions: Faction[];   // index 0..N-1 (faction.id = index+1)
  numFactions: number;
  tick: number;
  growthRate: number;    // hệ số sinh quân (1 = chuẩn)
  winner: number | null; // id phe thắng (0..N), null nếu chưa
  startTiles: number;    // tổng số ô
}

const idx = (w: { cols: number }, x: number, y: number) => y * w.cols + x;

function seedPositions(cols: number, rows: number, n: number): { x: number; y: number }[] {
  // Rải thủ phủ quanh một vòng tròn để công bằng.
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const r = Math.min(cols, rows) * 0.36;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push({
      x: Math.max(1, Math.min(cols - 2, Math.round(cx + Math.cos(a) * r))),
      y: Math.max(1, Math.min(rows - 2, Math.round(cy + Math.sin(a) * r))),
    });
  }
  return out;
}

export function createCellWar(numFactions: number, sizeKey: MapSizeKey, growthRate = 1): CellWarWorld {
  const { cols, rows } = MAP_SIZES[sizeKey];
  const n = cols * rows;
  const owner = new Uint8Array(n);
  const troops = new Float32Array(n);
  // Trung lập có garrison cố định
  for (let i = 0; i < n; i++) troops[i] = CW.NEUTRAL_DEF;

  const N = Math.max(2, Math.min(FACTION_COLORS.length, numFactions));
  const factions: Faction[] = [];
  for (let i = 0; i < N; i++) {
    const c = FACTION_COLORS[i];
    const strat = STRATEGIES[i % STRATEGIES.length];
    factions.push({
      id: i + 1, name: c.name, colorHex: c.hex, rgb: [...c.rgb] as [number, number, number],
      strategy: strat.id, alive: true, tiles: 0, troops: 0,
    });
  }

  // Đặt thủ phủ (3×3) cho mỗi phe
  const pos = seedPositions(cols, rows, N);
  for (let i = 0; i < N; i++) {
    const { x, y } = pos[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = ny * cols + nx;
      owner[k] = i + 1;
      troops[k] = CW.SEED_TROOPS;
    }
  }

  const w: CellWarWorld = {
    cols, rows, n, owner, troops, factions, numFactions: N,
    tick: 0, growthRate, winner: null, startTiles: n,
  };
  recomputeStats(w);
  return w;
}

export function resetCellWar(w: CellWarWorld) {
  Object.assign(w, createCellWar(w.numFactions, sizeKeyOf(w), w.growthRate));
}

function sizeKeyOf(w: CellWarWorld): MapSizeKey {
  for (const k of Object.keys(MAP_SIZES) as MapSizeKey[]) {
    if (MAP_SIZES[k].cols === w.cols && MAP_SIZES[k].rows === w.rows) return k;
  }
  return 'medium';
}

function recomputeStats(w: CellWarWorld) {
  for (const f of w.factions) { f.tiles = 0; f.troops = 0; }
  for (let i = 0; i < w.n; i++) {
    const o = w.owner[i];
    if (o > 0) { const f = w.factions[o - 1]; f.tiles++; f.troops += w.troops[i]; }
  }
  let aliveCount = 0, lastAlive = 0;
  for (const f of w.factions) {
    if (f.tiles === 0) f.alive = false;
    if (f.alive) { aliveCount++; lastAlive = f.id; }
  }
  if (w.winner === null && aliveCount <= 1) w.winner = lastAlive || 0;
}

// 4 hướng láng giềng
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

function diffuseStep(w: CellWarWorld) {
  const { cols, rows, owner, troops } = w;
  const count = Math.floor(w.n * CW.DIFFUSE_FRAC);
  const cap = CW.MAX_TROOPS;
  for (let s = 0; s < count; s++) {
    const i = (Math.random() * w.n) | 0;
    const o = owner[i];
    if (o === 0 || troops[i] < cap * 0.5) continue;
    const x = i % cols, y = (i / cols) | 0;
    // Tìm láng giềng CÙNG PHE có ít quân nhất → dồn quân ra phía đó (chảy về biên)
    let bestK = -1, bestT = troops[i];
    let isInterior = true;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = ny * cols + nx;
      if (owner[k] !== o) { isInterior = false; }
      else if (troops[k] < bestT) { bestT = troops[k]; bestK = k; }
    }
    if (isInterior && bestK >= 0) {
      const move = Math.floor((troops[i] - troops[bestK]) * 0.5);
      if (move > 0) { troops[i] -= move; troops[bestK] = Math.min(cap, troops[bestK] + move); }
    }
  }
}

function sendFracFor(strat: Strategy): number {
  switch (strat) {
    case 'aggressive':  return 0.85;
    case 'opportunist': return 0.70;
    case 'expand':      return 0.62;
    case 'defensive':   return 0.55;
    default:            return 0.65;
  }
}

// Chọn ô đích tốt nhất cho 1 ô biên thuộc phe `o` (chiến thuật `strat`).
function pickTarget(w: CellWarWorld, x: number, y: number, o: number, strat: Strategy): number {
  const { cols, rows, owner, troops } = w;
  let best = -1, bestScore = -Infinity;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const k = ny * cols + nx;
    const to = owner[k];
    if (to === o) continue;                  // cùng phe → bỏ
    const def = troops[k];
    const isEnemy = to !== 0;
    let score: number;
    switch (strat) {
      case 'expand':      score = -def + (isEnemy ? -8 : 6); break;   // thích đất trung lập
      case 'aggressive':  score = -def + (isEnemy ? 10 : -2); break;  // thích phe địch
      case 'opportunist': score = -def; break;                        // ô yếu nhất
      case 'defensive':   score = -def + (isEnemy ? -4 : 3); break;   // thiên trung lập, tránh địch mạnh
      default:            score = -def + (isEnemy ? 3 : 0); break;     // cân bằng
    }
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}

function attackStep(w: CellWarWorld) {
  const { cols, rows, owner, troops } = w;
  const count = Math.floor(w.n * CW.ATTACK_FRAC);
  for (let s = 0; s < count; s++) {
    const i = (Math.random() * w.n) | 0;
    const o = owner[i];
    if (o === 0) continue;
    const f = w.factions[o - 1];
    if (!f.alive) continue;
    if (troops[i] < CW.ATTACK_MIN) continue;
    // Phòng thủ: chỉ tấn công khi quân gần đầy
    if (f.strategy === 'defensive' && troops[i] < CW.MAX_TROOPS * 0.7) continue;

    const x = i % cols, y = (i / cols) | 0;
    const target = pickTarget(w, x, y, o, f.strategy);
    if (target < 0) continue;                // ô nội địa (không có biên) → bỏ

    const send = Math.floor(troops[i] * sendFracFor(f.strategy));
    if (send < 1) continue;
    const def = troops[target];
    if (send > def) {
      owner[target] = o;
      troops[target] = Math.min(CW.MAX_TROOPS, send - def);
      troops[i] -= send;
    } else {
      troops[target] = def - send;
      troops[i] -= send;
    }
  }
}

export function stepCellWar(w: CellWarWorld, speed = 1) {
  if (w.winner !== null) { recomputeStats(w); return; }
  for (let s = 0; s < speed; s++) {
    // Sinh quân
    if (w.tick % CW.GROWTH_INTERVAL === 0) {
      const inc = w.growthRate;
      for (let i = 0; i < w.n; i++) {
        if (w.owner[i] > 0 && w.troops[i] < CW.MAX_TROOPS) {
          w.troops[i] = Math.min(CW.MAX_TROOPS, w.troops[i] + inc);
        }
      }
    }
    diffuseStep(w);
    attackStep(w);
    w.tick++;
    if (w.tick % CW.STAT_INTERVAL === 0) recomputeStats(w);
    if (w.tick >= CW.MATCH_TICKS && w.winner === null) {
      // Hết giờ → phe nhiều đất nhất thắng
      recomputeStats(w);
      let bi = 0, bt = -1;
      for (const f of w.factions) if (f.tiles > bt) { bt = f.tiles; bi = f.id; }
      w.winner = bi;
    }
    if (w.winner !== null) break;
  }
  recomputeStats(w);
}

export function secondsLeftCellWar(w: CellWarWorld): number {
  return Math.max(0, Math.ceil((CW.MATCH_TICKS - w.tick) / 60));
}
