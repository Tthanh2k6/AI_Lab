import { Point } from '../types/game';
import { RacingTrack, buildTrackBoundaries, getIntersection, distancePointToPoint } from './racingPhysics';

// ============================================================================
// PROCEDURAL TRACK GENERATION — HỆ BLOCK TRÊN LƯỚI Ô
// ----------------------------------------------------------------------------
// Cùng một seed  →  luôn ra đúng một đường đua (giống seed của Minecraft).
//
// Pipeline:
//   seed → PRNG → sinh VÙNG trên lưới (hợp của vài hình chữ nhật)
//        → lấp lỗ, khử điểm chạm chéo
//        → lần theo BIÊN của vùng  ⇒  chu trình ô lưới, khép kín & không tự cắt
//        → mỗi ô lưới thành một BLOCK (thẳng / cong nhẹ / cong vừa / cua gấp)
//        → bo góc theo bán kính của từng block
//        → kiểm định + biome + bề rộng biến thiên → RacingTrack
//
// Vì sao là biên của một vùng chứ không phải đường đi ngẫu nhiên?
//   Đường đi ngẫu nhiên trên lưới cho ra hình loằng ngoằng, không có đoạn thẳng dài.
//   Biên của hợp vài hình chữ nhật thì luôn có các cạnh dài — đúng cái mà đường đua
//   thật cần: thẳng để tăng tốc, rồi mới tới tổ hợp cua.
// ============================================================================

// ============================================================================
// 1. SEEDED PRNG — nguồn ngẫu nhiên tất định
// ============================================================================

export type Rng = () => number;

/** mulberry32: PRNG 32-bit nhanh, chất lượng tốt, cùng seed → cùng dãy số. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Hash FNV-1a: biến chuỗi bất kỳ thành seed (người chơi gõ "abc" cũng ra map). */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Người dùng gõ số → dùng thẳng; gõ chữ → hash. Giống hệt cách Minecraft nhận seed. */
export function parseSeed(input: string): number {
  const s = input.trim();
  if (!s) return randomSeed();
  if (/^-?\d+$/.test(s)) return Math.abs(parseInt(s, 10)) >>> 0;
  return hashString(s);
}

/** Seed hiển thị dạng base36 ngắn gọn, dễ chép cho bạn bè. */
export function seedToString(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase();
}

// ============================================================================
// 2. VALUE NOISE — dùng cho biome và bề rộng lòng đường
// ============================================================================

function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hàm làm mượt Hermite 3t²−2t³ — biến nội suy tuyến tính thành đường cong mượt. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise 2D: random tại các nút lưới rồi nội suy mượt → trả [0,1]. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smoothstep(x - xi);
  const v = smoothstep(y - yi);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * Ring noise: nhiễu fBm TUẦN HOÀN theo t ∈ [0,1).
 * Mẹo: lấy mẫu noise 2D dọc theo một đường tròn → t=0 và t=1 trùng nhau tuyệt đối,
 * nên bề rộng lòng đường không bị "vết nối" ở chỗ khép vòng.
 */
export function makeRingNoise(seed: number, octaves = 4): (t: number) => number {
  return (t: number) => {
    const ang = t * Math.PI * 2;
    let value = 0;
    let amp = 1;
    let norm = 0;
    let radius = 1.7;

    for (let o = 0; o < octaves; o++) {
      const n = valueNoise2D(Math.cos(ang) * radius, Math.sin(ang) * radius, (seed + o * 7919) >>> 0);
      value += (n * 2 - 1) * amp;
      norm += amp;
      amp *= 0.5;
      radius *= 2;
    }
    return value / norm; // [-1, 1]
  };
}

// ============================================================================
// 3. BIOME — chọn "vùng khí hậu" bằng 2 bản đồ noise độc lập
// ============================================================================

export interface TrackTheme {
  id: string;
  name: string;
  bg: string;
  grid: string;
  road: string;
  roadEdge: string;
  lane: string;
  wallLeft: string;
  wallRight: string;
  glowLeft: string;
  glowRight: string;
  accent: string;
}

export const TRACK_THEMES: Record<string, TrackTheme> = {
  neon: {
    id: 'neon', name: 'Đô Thị Neon',
    bg: '#06070c', grid: 'rgba(124, 58, 237, 0.05)',
    road: 'rgba(6, 182, 212, 0.18)', roadEdge: 'rgba(8, 47, 73, 0.55)',
    lane: 'rgba(255, 255, 255, 0.07)',
    wallLeft: 'rgba(168, 85, 247, 0.6)', wallRight: 'rgba(236, 72, 153, 0.6)',
    glowLeft: '#a855f7', glowRight: '#ec4899', accent: '#22d3ee',
  },
  desert: {
    id: 'desert', name: 'Sa Mạc Cát Bỏng',
    bg: '#0d0904', grid: 'rgba(217, 119, 6, 0.05)',
    road: 'rgba(234, 179, 8, 0.14)', roadEdge: 'rgba(69, 39, 6, 0.6)',
    lane: 'rgba(255, 237, 180, 0.09)',
    wallLeft: 'rgba(251, 146, 60, 0.6)', wallRight: 'rgba(234, 88, 12, 0.6)',
    glowLeft: '#fb923c', glowRight: '#ea580c', accent: '#fbbf24',
  },
  tundra: {
    id: 'tundra', name: 'Cao Nguyên Băng Giá',
    bg: '#04080d', grid: 'rgba(148, 197, 255, 0.05)',
    road: 'rgba(186, 230, 253, 0.15)', roadEdge: 'rgba(12, 45, 72, 0.6)',
    lane: 'rgba(255, 255, 255, 0.10)',
    wallLeft: 'rgba(125, 211, 252, 0.6)', wallRight: 'rgba(129, 140, 248, 0.6)',
    glowLeft: '#7dd3fc', glowRight: '#818cf8', accent: '#bae6fd',
  },
  jungle: {
    id: 'jungle', name: 'Rừng Rậm Nhiệt Đới',
    bg: '#040a06', grid: 'rgba(34, 197, 94, 0.05)',
    road: 'rgba(74, 222, 128, 0.13)', roadEdge: 'rgba(6, 46, 25, 0.6)',
    lane: 'rgba(220, 255, 230, 0.08)',
    wallLeft: 'rgba(34, 197, 94, 0.6)', wallRight: 'rgba(20, 184, 166, 0.6)',
    glowLeft: '#22c55e', glowRight: '#14b8a6', accent: '#4ade80',
  },
  volcano: {
    id: 'volcano', name: 'Miệng Núi Lửa',
    bg: '#0b0304', grid: 'rgba(239, 68, 68, 0.05)',
    road: 'rgba(248, 113, 113, 0.13)', roadEdge: 'rgba(60, 8, 12, 0.65)',
    lane: 'rgba(255, 200, 180, 0.08)',
    wallLeft: 'rgba(249, 115, 22, 0.65)', wallRight: 'rgba(220, 38, 38, 0.65)',
    glowLeft: '#f97316', glowRight: '#dc2626', accent: '#f87171',
  },
  abyss: {
    id: 'abyss', name: 'Vực Sâu Đêm Tối',
    bg: '#03050c', grid: 'rgba(59, 130, 246, 0.045)',
    road: 'rgba(96, 165, 250, 0.13)', roadEdge: 'rgba(9, 20, 50, 0.65)',
    lane: 'rgba(200, 220, 255, 0.07)',
    wallLeft: 'rgba(59, 130, 246, 0.6)', wallRight: 'rgba(139, 92, 246, 0.6)',
    glowLeft: '#3b82f6', glowRight: '#8b5cf6', accent: '#60a5fa',
  },
};

/**
 * Chọn biome đúng theo cách Minecraft làm: hai bản đồ noise ĐỘC LẬP
 * (nhiệt độ & độ ẩm) tra vào một bảng 2 chiều. Seed gần nhau → biome liên quan nhau,
 * chứ không phải bốc thăm hoàn toàn rời rạc.
 */
export function pickTheme(seed: number): TrackTheme {
  const wx = (seed % 1013) * 0.137;
  const wy = ((seed >>> 10) % 1013) * 0.137;

  const temperature = valueNoise2D(wx, wy, 0x5eed01);
  const humidity = valueNoise2D(wx + 41.7, wy + 17.3, 0x5eed02);

  if (temperature < 0.35) return TRACK_THEMES.tundra;
  if (temperature > 0.68) return humidity > 0.5 ? TRACK_THEMES.jungle : TRACK_THEMES.volcano;
  if (humidity > 0.62) return TRACK_THEMES.abyss;
  if (humidity < 0.36) return TRACK_THEMES.desert;
  return TRACK_THEMES.neon;
}

// ============================================================================
// 4. ĐẶT TÊN ĐƯỜNG ĐUA — ghép từ vựng theo seed
// ============================================================================

const NAME_HEAD = ['Vòng Cua', 'Đèo', 'Cung Đường', 'Đại Lộ', 'Hẻm Núi', 'Vành Đai', 'Đường Đua'];
const NAME_MID = ['Tử Thần', 'Bão Cát', 'Sương Mù', 'Hoả Ngục', 'Bạc Mệnh', 'Chớp Nhoáng', 'Vô Cực', 'Gãy Khúc', 'Xoáy Ốc', 'Hoàng Hôn'];

function makeTrackName(rng: Rng, seed: number): string {
  const head = NAME_HEAD[Math.floor(rng() * NAME_HEAD.length)];
  const mid = NAME_MID[Math.floor(rng() * NAME_MID.length)];
  return `${head} ${mid} #${seedToString(seed).slice(0, 5)}`;
}

// ============================================================================
// 5. LƯỚI Ô — SINH VÙNG RỒI LẦN THEO BIÊN
// ============================================================================

/** Một ô trên lưới đường đua (lưới nút, không phải lưới vùng). */
interface GridCell {
  c: number;
  r: number;
}

/**
 * Vùng được định nghĩa trên lưới "ô vùng" kích thước (cols-1)×(rows-1).
 * Ô vùng (c,r) nằm lọt giữa 4 nút lưới (c,r), (c+1,r), (c,r+1), (c+1,r+1).
 * Biên của vùng vì thế chạy đúng trên các nút lưới → đó chính là các ô đặt block.
 */
type Region = boolean[][]; // region[r][c]

function makeRegion(rows: number, cols: number): Region {
  return Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
}

function regionArea(region: Region): number {
  let n = 0;
  for (const row of region) for (const v of row) if (v) n++;
  return n;
}

/**
 * Tô vùng bằng hợp của vài hình chữ nhật chồng lấn nhau.
 * Mỗi hình sau bắt buộc chạm hình trước → vùng luôn liên thông,
 * và biên của nó luôn có những cạnh dài (= đoạn thẳng tăng tốc).
 */
function paintRegion(rng: Rng, rows: number, cols: number, rectCount: number): Region | null {
  const region = makeRegion(rows, cols);

  const randRect = () => {
    const w = 2 + Math.floor(rng() * Math.max(1, cols - 2));
    const h = 2 + Math.floor(rng() * Math.max(1, rows - 2));
    const c0 = Math.floor(rng() * (cols - w + 1));
    const r0 = Math.floor(rng() * (rows - h + 1));
    return { c0, r0, w, h };
  };

  const paint = (rect: { c0: number; r0: number; w: number; h: number }) => {
    for (let r = rect.r0; r < rect.r0 + rect.h; r++) {
      for (let c = rect.c0; c < rect.c0 + rect.w; c++) region[r][c] = true;
    }
  };

  const touchesRegion = (rect: { c0: number; r0: number; w: number; h: number }) => {
    for (let r = rect.r0; r < rect.r0 + rect.h; r++) {
      for (let c = rect.c0; c < rect.c0 + rect.w; c++) if (region[r][c]) return true;
    }
    return false;
  };

  paint(randRect());

  for (let i = 1; i < rectCount; i++) {
    // Thử vài lần để tìm hình chồng lên phần đã có (giữ vùng liên thông)
    for (let attempt = 0; attempt < 24; attempt++) {
      const rect = randRect();
      if (!touchesRegion(rect)) continue;
      paint(rect);
      break;
    }
  }

  return region;
}

/** Vùng có còn là MỘT mảnh liền không? Vùng đứt đôi ⇒ biên thành hai vòng rời. */
function isConnected(region: Region): boolean {
  const rows = region.length;
  const cols = region[0].length;

  let start: [number, number] | null = null;
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!region[r][c]) continue;
      total++;
      if (!start) start = [r, c];
    }
  }
  if (!start) return false;

  const seen = makeRegion(rows, cols);
  const stack: [number, number][] = [start];
  seen[start[0]][start[1]] = true;
  let reached = 1;

  while (stack.length) {
    const [r, c] = stack.pop()!;
    const nb: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of nb) {
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (!region[nr][nc] || seen[nr][nc]) continue;
      seen[nr][nc] = true;
      reached++;
      stack.push([nr, nc]);
    }
  }

  return reached === total;
}

/**
 * Khoét RÃNH từ mép vùng ăn vào trong — đây là đòn bẩy chính để có nhiều cua.
 *
 * Hợp vài hình chữ nhật cho biên khá trơn (chỉ ~10 góc). Mỗi rãnh rộng 1 ô đâm
 * vào thân vùng bắt biên phải đi vào rồi vòng ra, đẻ thêm 4 góc và một cặp
 * răng lược — đúng kiểu tổ hợp cua kỹ thuật của đường đua thật.
 *
 * Khoét từng rãnh một và HOÀN TÁC ngay nếu rãnh đó cắt đứt vùng. Nếu để mặc cho
 * khâu lần biên loại bỏ thì với 12 rãnh gần như map nào cũng hỏng — đo được
 * 50 lần thử bị loại cho mỗi map giữ lại.
 */
function carveSlots(rng: Rng, region: Region, count: number): void {
  const rows = region.length;
  const cols = region[0].length;

  for (let i = 0; i < count; i++) {
    const side = Math.floor(rng() * 4);
    const vertical = side < 2;
    const span = vertical ? rows : cols;
    const depth = 1 + Math.floor(rng() * Math.max(1, Math.round(span * 0.62)));

    const touched: [number, number][] = [];
    for (let k = 0; k < depth; k++) {
      const r = vertical ? (side === 0 ? k : rows - 1 - k) : Math.floor(rng() * rows);
      const c = vertical ? Math.floor(rng() * cols) : (side === 2 ? k : cols - 1 - k);
      if (region[r][c]) touched.push([r, c]);
    }
    if (!touched.length) continue;

    for (const [r, c] of touched) region[r][c] = false;
    if (!isConnected(region)) {
      for (const [r, c] of touched) region[r][c] = true; // hoàn tác
    }
  }
}

/**
 * Lấp lỗ: hợp của các hình chữ nhật có thể bao quanh một khoảng trống.
 * Lỗ tạo ra biên thứ hai → hai vòng rời nhau, không dùng được.
 * Loang từ ngoài vào; ô trống nào không loang tới được chính là lỗ.
 */
function fillHoles(region: Region): void {
  const rows = region.length;
  const cols = region[0].length;
  const outside = makeRegion(rows, cols);
  const stack: [number, number][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r === 0 || c === 0 || r === rows - 1 || c === cols - 1) && !region[r][c]) {
        outside[r][c] = true;
        stack.push([r, c]);
      }
    }
  }

  while (stack.length) {
    const [r, c] = stack.pop()!;
    const nb: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of nb) {
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (region[nr][nc] || outside[nr][nc]) continue;
      outside[nr][nc] = true;
      stack.push([nr, nc]);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!region[r][c] && !outside[r][c]) region[r][c] = true;
    }
  }
}

/**
 * Khử "điểm chạm chéo": hai ô vùng kề nhau theo đường chéo, hai ô còn lại trống.
 * Tại nút lưới chung đó biên sẽ đi qua HAI lần → chu trình tự chạm, đường đua
 * sẽ có một điểm thắt bằng 0. Lấp một trong hai ô trống là hết.
 */
function fixDiagonalPinches(region: Region, rng: Rng): void {
  const rows = region.length;
  const cols = region[0].length;

  for (let pass = 0; pass < 8; pass++) {
    let found = false;
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        const a = region[r][c];
        const b = region[r][c + 1];
        const d = region[r + 1][c];
        const e = region[r + 1][c + 1];

        if (a && e && !b && !d) {
          if (rng() < 0.5) region[r][c + 1] = true; else region[r + 1][c] = true;
          found = true;
        } else if (b && d && !a && !e) {
          if (rng() < 0.5) region[r][c] = true; else region[r + 1][c + 1] = true;
          found = true;
        }
      }
    }
    if (!found) return;
  }
}

/**
 * Lần theo biên vùng → chu trình các nút lưới.
 * Một cạnh của ô vùng nằm trên biên khi ô láng giềng phía đó trống (hoặc ngoài lưới).
 * Vùng đã liên thông, không lỗ, không chạm chéo ⇒ mỗi nút biên có đúng bậc 2
 * ⇒ các cạnh biên ghép lại thành đúng MỘT chu trình đơn.
 */
function traceContour(region: Region, cols: number, rows: number): GridCell[] | null {
  const rRows = region.length;
  const rCols = region[0].length;
  const nodeId = (c: number, r: number) => r * cols + c;

  // Danh sách kề của đồ thị biên
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };

  let edgeCount = 0;
  const filled = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < rRows && c < rCols && region[r][c];

  for (let r = 0; r < rRows; r++) {
    for (let c = 0; c < rCols; c++) {
      if (!region[r][c]) continue;
      if (!filled(r - 1, c)) { link(nodeId(c, r), nodeId(c + 1, r)); edgeCount++; }               // cạnh trên
      if (!filled(r + 1, c)) { link(nodeId(c, r + 1), nodeId(c + 1, r + 1)); edgeCount++; }       // cạnh dưới
      if (!filled(r, c - 1)) { link(nodeId(c, r), nodeId(c, r + 1)); edgeCount++; }               // cạnh trái
      if (!filled(r, c + 1)) { link(nodeId(c + 1, r), nodeId(c + 1, r + 1)); edgeCount++; }       // cạnh phải
    }
  }

  if (edgeCount === 0) return null;
  // Bậc khác 2 nghĩa là còn điểm thắt — không tạo được chu trình đơn
  for (const neighbours of adj.values()) if (neighbours.length !== 2) return null;

  // Đi vòng theo chu trình
  const start = adj.keys().next().value as number;
  const cycle: number[] = [start];
  let prev = -1;
  let curr = start;

  for (let guard = 0; guard < edgeCount + 2; guard++) {
    const neighbours = adj.get(curr)!;
    const next = neighbours[0] === prev ? neighbours[1] : neighbours[0];
    if (next === start) break;
    cycle.push(next);
    prev = curr;
    curr = next;
  }

  // Phải phủ hết cạnh biên, nếu không là có nhiều vòng rời nhau
  if (cycle.length !== edgeCount) return null;

  return cycle.map(id => ({ c: id % cols, r: Math.floor(id / cols) }));
}

/**
 * CẮT CHÉO GÓC — biến lưới 4 hướng thành lưới 8 hướng.
 *
 * Biên của một vùng chỉ đẻ ra góc 90°, nên map nhìn vuông vức như bàn cờ.
 * Đường đua F1 thật thì đầy cua 45° và 135°, cùng những đoạn thẳng chạy chéo.
 *
 * Cách làm: tại một ô góc V có ô trước P và ô sau N, bỏ hẳn V đi. P và N vốn nằm
 * chéo nhau nên vẫn nối được bằng một bước chéo. Một cua 90° biến thành HAI cua 45°.
 * Cắt cả một dãy góc so le (bậc thang) thì được nguyên một đoạn thẳng chạy chéo.
 *
 * Không cắt hai ô liền kề — bỏ cả hai thì hai ô còn lại không còn kề nhau, đứt mạch.
 *
 * Và chỉ cắt khi hai ô kề KHÔNG bẻ cùng chiều với V. Lý do hình học: nếu ô sau bẻ
 * cùng chiều (kiểu xoáy trôn ốc / hairpin), bước chéo mới làm góc tại đó thành 135°,
 * mà cua 135° ăn tới 2.41·R tiếp tuyến nên cần cạnh dài gấp 5 lần bán kính — cạnh
 * 1 ô không bao giờ đủ. Ngược lại nếu bẻ ngược chiều (kiểu bậc thang) thì thành 45°,
 * và cả dãy bậc thang gộp lại thành một đoạn thẳng chạy chéo rất đẹp.
 */
function diagonalizeContour(cells: GridCell[], rng: Rng, probability: number): GridCell[] {
  const n = cells.length;
  if (n < 8) return cells;

  /** Chiều bẻ tại ô i: +1 / −1, hoặc 0 nếu đi thẳng qua. */
  const turnSign = (i: number): number => {
    const prev = cells[(i - 1 + n) % n];
    const curr = cells[i];
    const next = cells[(i + 1) % n];
    const ix = curr.c - prev.c, iy = curr.r - prev.r;
    const ox = next.c - curr.c, oy = next.r - curr.r;
    return Math.sign(ix * oy - iy * ox);
  };

  const remove = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const sign = turnSign(i);
    if (sign === 0) continue; // ô thẳng, không phải góc

    // Không cắt sát ô vừa cắt
    if (remove[(i - 1 + n) % n]) continue;

    // Hàng xóm bẻ cùng chiều ⇒ cắt sẽ đẻ ra cua 135° bất khả thi
    const prevSign = turnSign((i - 1 + n) % n);
    const nextSign = turnSign((i + 1) % n);
    if (prevSign === sign || nextSign === sign) continue;

    if (rng() >= probability) continue;
    remove[i] = true;
  }

  // Ô đầu và ô cuối cũng là hàng xóm của nhau
  if (remove[0] && remove[n - 1]) remove[n - 1] = false;

  const out = cells.filter((_, i) => !remove[i]);
  return out.length >= 8 ? out : cells;
}

// ============================================================================
// 6. BLOCK — mỗi ô lưới trên chu trình là một mảnh ghép đường đua
// ============================================================================

export type BlockKind = 'straight' | 'sweep' | 'medium' | 'hairpin';

export const BLOCK_LABELS: Record<BlockKind, string> = {
  straight: 'Thẳng',
  sweep: 'Cong nhẹ',
  medium: 'Cong vừa',
  hairpin: 'Cua gấp',
};

export interface TrackGrid {
  cols: number;
  rows: number;
  /** Cạnh một ô lưới, px */
  cell: number;
  /** Số ô lưới mà đường đua đi qua (phần còn lại là ô trống) */
  usedCells: number;
  /** Toạ độ thế giới của nút lưới (0,0) — dùng để vẽ lưới trùng khít đường đua */
  originX: number;
  originY: number;
}

export interface BlockSummary {
  straight: number;
  sweep: number;
  medium: number;
  hairpin: number;
  /** Đoạn thẳng dài nhất (px) — chỗ xe đạt tốc độ cao nhất */
  longestStraight: number;
}

/**
 * Bán kính cua nhỏ nhất mà xe còn ôm được.
 * Xe chạy 3.6 px/frame và bẻ tối đa 0.08 rad/frame → giới hạn cứng 45px.
 * Nhân 1.5 để AI còn biên an toàn khi vào cua không hoàn hảo.
 */
const HARD_MIN_RADIUS = 68;

/** Tỉ lệ bán kính (so với khoảng bo tối đa cho phép) của từng loại block cong. */
const CORNER_RANGE: Record<Exclude<BlockKind, 'straight'>, [number, number]> = {
  sweep: [0.80, 1.00],   // cong nhẹ — ôm cua gần như không giảm tốc
  medium: [0.42, 0.68],  // cong vừa
  hairpin: [0.00, 0.16], // cua gấp — sát ngưỡng vật lý của xe
};

/** Rút gọn chu trình ô lưới thành các ĐỈNH gấp khúc (bỏ các ô thẳng hàng ở giữa). */
function contourToVertices(cells: GridCell[], cell: number): Point[] {
  const n = cells.length;
  const verts: Point[] = [];

  for (let i = 0; i < n; i++) {
    const prev = cells[(i - 1 + n) % n];
    const curr = cells[i];
    const next = cells[(i + 1) % n];

    const inDir = { c: curr.c - prev.c, r: curr.r - prev.r };
    const outDir = { c: next.c - curr.c, r: next.r - curr.r };

    // Ô thẳng hàng thì không phải đỉnh — nó nằm giữa một đoạn thẳng
    if (inDir.c === outDir.c && inDir.r === outDir.r) continue;

    verts.push({ x: curr.c * cell, y: curr.r * cell });
  }
  return verts;
}

/** Góc bẻ tại một đỉnh (rad, luôn dương): 0 = đi thẳng, π = quay đầu. */
function turnAngle(uIn: Point, uOut: Point): number {
  const dot = Math.max(-1, Math.min(1, uIn.x * uOut.x + uIn.y * uOut.y));
  return Math.acos(dot);
}

/**
 * Chiều dài tiếp tuyến mà một cung bo góc ăn vào mỗi cạnh kề: T = R·tan(θ/2).
 * Cua 45° chỉ ăn 0.41·R nên cạnh ngắn vẫn ôm được cung rất rộng;
 * cua 135° ăn tới 2.41·R nên chỉ đặt được trên cạnh thật dài.
 */
function tangentFactor(theta: number): number {
  return Math.tan(theta / 2);
}

/** Vẽ cung bo góc tại đỉnh V, tiếp tuyến với hai cạnh kề (mọi góc bẻ). */
function emitCornerArc(V: Point, uIn: Point, uOut: Point, radius: number, out: Point[]): void {
  const tangent = radius * tangentFactor(turnAngle(uIn, uOut));
  const start = { x: V.x - uIn.x * tangent, y: V.y - uIn.y * tangent };
  const end = { x: V.x + uOut.x * tangent, y: V.y + uOut.y * tangent };

  const side = Math.sign(uIn.x * uOut.y - uIn.y * uOut.x); // +1 / −1 tuỳ chiều rẽ
  const normal = { x: -uIn.y * side, y: uIn.x * side };
  const center = { x: start.x + normal.x * radius, y: start.y + normal.y * radius };

  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;

  // Cua càng ngoặt càng cần nhiều điểm để cung không bị cắt góc
  const steps = Math.max(8, Math.round((Math.abs(sweep) / (Math.PI / 2)) * 14));
  for (let k = 0; k <= steps; k++) {
    const a = a0 + sweep * (k / steps);
    out.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
}

/**
 * Đỉnh gấp khúc → đường tim mượt.
 * Mỗi đỉnh được bo bằng một cung tròn có bán kính riêng, bốc theo phân phối
 * loại block của độ khó. Bán kính bị chặn trên bởi NỬA cạnh ngắn hơn ở hai bên,
 * nên hai góc kề nhau không bao giờ ăn lấn vào nhau.
 */
function verticesToCenterline(
  verts: Point[],
  rng: Rng,
  prof: DifficultyProfile,
  cell: number
): { points: Point[]; blocks: BlockSummary } | null {
  const n = verts.length;
  const points: Point[] = [];
  const blocks: BlockSummary = { straight: 0, sweep: 0, medium: 0, hairpin: 0, longestStraight: 0 };

  const dirs: Point[] = [];
  const lens: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const len = distancePointToPoint(a, b);
    if (len < 1e-6) return null;
    lens.push(len);
    dirs.push({ x: (b.x - a.x) / len, y: (b.y - a.y) / len });
  }

  // Chọn loại block + bán kính cho từng đỉnh
  const radii: number[] = [];
  const tangents: number[] = [];
  const angles: number[] = [];

  for (let i = 0; i < n; i++) {
    const uIn = dirs[(i - 1 + n) % n];
    const uOut = dirs[i];
    const theta = turnAngle(uIn, uOut);
    const k = tangentFactor(theta); // cung ăn k·R vào mỗi cạnh kề
    angles.push(theta);

    const lenIn = lens[(i - 1 + n) % n];
    const lenOut = lens[i];
    // Chia đôi cạnh ngắn hơn cho hai góc ở hai đầu, rồi quy ngược ra bán kính.
    // Cua càng ngoặt (k lớn) thì cùng một cạnh chỉ đỡ được bán kính nhỏ hơn.
    const rMax = Math.min(Math.min(lenIn, lenOut) * 0.5 / k, cell * 2.2);

    // Cạnh quá ngắn cho góc quá ngoặt ⇒ hình học bất khả thi, bỏ lần thử này
    if (rMax < HARD_MIN_RADIUS) return null;

    const floor = Math.min(prof.radiusFloor, rMax);

    const roll = rng();
    let kind: Exclude<BlockKind, 'straight'>;
    if (roll < prof.mixHairpin) kind = 'hairpin';
    else if (roll < prof.mixHairpin + prof.mixMedium) kind = 'medium';
    else kind = 'sweep';

    const [lo, hi] = CORNER_RANGE[kind];
    const t = lo + rng() * (hi - lo);
    const radius = Math.max(HARD_MIN_RADIUS, Math.min(rMax, floor + t * (rMax - floor)));

    radii.push(radius);
    tangents.push(radius * k);

    // Phân loại theo ĐỘ KHÓ THỰC TẾ với chiếc xe: vừa bán kính vừa độ ngoặt.
    // Cua 135° bán kính 120 vẫn là cua gấp, còn cua 45° bán kính 120 thì nhẹ nhàng.
    const deg = (theta * 180) / Math.PI;
    if (radius < 100 || deg >= 115) blocks.hairpin++;
    else if (radius >= 175 && deg <= 55) blocks.sweep++;
    else blocks.medium++;
  }

  // Phát điểm: cung bo tại mỗi đỉnh, đoạn thẳng nối giữa các cung
  for (let i = 0; i < n; i++) {
    const V = verts[i];
    const uIn = dirs[(i - 1 + n) % n];
    const uOut = dirs[i];
    emitCornerArc(V, uIn, uOut, radii[i], points);

    // Đoạn thẳng từ cuối cung này tới đầu cung sau
    const next = (i + 1) % n;
    const straightLen = lens[i] - tangents[i] - tangents[next];
    if (straightLen > 1) {
      blocks.straight++;
      if (straightLen > blocks.longestStraight) blocks.longestStraight = Math.round(straightLen);
      const from = { x: V.x + uOut.x * tangents[i], y: V.y + uOut.y * tangents[i] };
      const steps = Math.max(1, Math.round(straightLen / 60));
      for (let k = 1; k <= steps; k++) {
        points.push({
          x: from.x + uOut.x * (straightLen * k) / steps,
          y: from.y + uOut.y * (straightLen * k) / steps,
        });
      }
    }
  }

  return { points, blocks };
}

// ============================================================================
// 7. HÌNH HỌC CHUNG — lấy mẫu lại, kiểm định, đặt vạch xuất phát
// ============================================================================

/**
 * Bỏ các điểm trùng/sát nhau — nếu để lọt, phép nội suy sau đó chia cho 0
 * và NaN sẽ lan ra toàn bộ đường đua.
 */
function dedupeConsecutive(pts: Point[], minGap = 1): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (out.length && distancePointToPoint(out[out.length - 1], p) < minGap) continue;
    out.push(p);
  }
  while (out.length > 2 && distancePointToPoint(out[out.length - 1], out[0]) < minGap) out.pop();
  return out;
}

/** Lấy mẫu lại đường cong cho các điểm cách đều nhau → checkpoint đều, cảm biến ổn định. */
function resampleByArcLength(path: Point[], spacing: number): Point[] {
  const n = path.length;
  if (n < 3) return [];

  let total = 0;
  for (let i = 0; i < n; i++) total += distancePointToPoint(path[i], path[(i + 1) % n]);

  // Chốt an toàn: chu vi hợp lệ không thể vượt 40k px. Nếu một bước phía trên sinh ra
  // toạ độ hỏng, trả mảng rỗng để lần thử này bị loại, thay vì cấp phát mảng khổng lồ.
  if (!Number.isFinite(total) || total <= 0 || total > 40000) return [];

  const count = Math.max(48, Math.round(total / spacing));
  const step = total / count;

  const out: Point[] = [];
  let segIdx = 0;
  let segStart = path[0];
  let segEnd = path[1 % n];
  let segLen = distancePointToPoint(segStart, segEnd) || 1e-6;
  let walked = 0;

  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (walked + segLen < target && segIdx < n) {
      walked += segLen;
      segIdx++;
      segStart = path[segIdx % n];
      segEnd = path[(segIdx + 1) % n];
      segLen = distancePointToPoint(segStart, segEnd) || 1e-6;
    }
    const t = (target - walked) / segLen;
    out.push({
      x: segStart.x + (segEnd.x - segStart.x) * t,
      y: segStart.y + (segEnd.y - segStart.y) * t,
    });
  }
  return out;
}

/** Bán kính cong Menger tại một điểm: R = (a·b·c) / (4·diện tích tam giác 3 điểm liên tiếp). */
function radiusAt(path: Point[], i: number): number {
  const n = path.length;
  const p0 = path[(i - 1 + n) % n];
  const p1 = path[i];
  const p2 = path[(i + 1) % n];

  const a = distancePointToPoint(p0, p1);
  const b = distancePointToPoint(p1, p2);
  const c = distancePointToPoint(p0, p2);
  const area = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)) / 2;
  if (area < 1e-9) return Infinity; // 3 điểm thẳng hàng → đường thẳng

  return (a * b * c) / (4 * area);
}

function minCurvatureRadius(path: Point[]): number {
  let minR = Infinity;
  for (let i = 0; i < path.length; i++) {
    const r = radiusAt(path, i);
    if (r < minR) minR = r;
  }
  return minR;
}

/** Đường có tự cắt chính nó không? */
function selfIntersects(path: Point[]): boolean {
  const n = path.length;
  const skip = Math.max(4, Math.floor(n * 0.04));
  for (let i = 0; i < n; i++) {
    const a1 = path[i];
    const a2 = path[(i + 1) % n];
    for (let j = i + skip; j < n; j++) {
      if (j === i || (j + 1) % n === i) continue;
      if (getIntersection(a1, a2, path[j], path[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Hai đoạn xa nhau về chỉ số nhưng gần nhau trong không gian → tường sẽ chồng nhau. */
function sectionsTooClose(path: Point[], minDist: number): boolean {
  const n = path.length;
  const skip = Math.max(8, Math.floor(n * 0.08));
  for (let i = 0; i < n; i++) {
    for (let j = i + skip; j < n - Math.min(skip, n - 1); j++) {
      if (distancePointToPoint(path[i], path[j]) < minDist) return true;
    }
  }
  return false;
}

/** Bán kính lớn hơn mức này thì với chiếc xe coi như đang đi thẳng. */
const STRAIGHT_RADIUS = 420;

/**
 * Quãng chạy đà từ vạch xuất phát (index 0) tới khúc cua thật sự đầu tiên.
 * Xe bị ép đi thẳng 20 frame đầu để cả đàn rời vạch, nên nếu vạch nằm ngay trong
 * cua thì cả thế hệ đầu đâm tường trước khi kịp học gì.
 */
function startRunway(path: Point[]): number {
  const n = path.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (radiusAt(path, i) < STRAIGHT_RADIUS) return acc;
    acc += distancePointToPoint(path[i], path[(i + 1) % n]);
  }
  return acc;
}

/**
 * Xoay mảng để vạch xuất phát nằm ở ĐẦU đoạn thẳng dài nhất.
 *
 * Bản trước dùng cửa sổ trượt có tổng độ bẻ nhỏ nhất. Khi map còn ít cua thì cách đó
 * ổn, nhưng với mật độ cua hiện tại "ít bẻ nhất" vẫn có thể là một khúc cua — đo được
 * 5% số map có quãng chạy đà bằng 0. Giờ tìm đúng dãy điểm thẳng dài nhất và đặt vạch
 * ở đầu dãy, để xe được hưởng trọn đoạn thẳng đó.
 */
function rotateToLongestStraight(path: Point[]): Point[] {
  const n = path.length;

  const isStraight: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) isStraight[i] = radiusAt(path, i) >= STRAIGHT_RADIUS;

  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  let runLen = 0;

  // Quét 2 vòng để bắt được cả dãy vắt qua chỗ nối mảng
  for (let k = 0; k < n * 2; k++) {
    const idx = k % n;
    if (isStraight[idx]) {
      if (runLen === 0) runStart = idx;
      runLen++;
      if (runLen > bestLen && runLen <= n) {
        bestLen = runLen;
        bestStart = runStart;
      }
    } else {
      runLen = 0;
    }
  }

  if (bestStart < 0) return path; // toàn cua, không có đoạn thẳng nào
  return [...path.slice(bestStart), ...path.slice(0, bestStart)];
}

// ============================================================================
// 8. ĐỘ KHÓ
// ============================================================================

export interface DifficultyProfile {
  /** Số nút lưới theo chiều ngang / dọc — đường đua chạy trên các nút này */
  cols: number;
  rows: number;
  /** Cạnh một ô lưới (px) */
  cell: number;
  /** Số hình chữ nhật hợp lại thành vùng — nhiều hơn = bố cục phức tạp hơn */
  rectCount: number;
  /** Số rãnh khoét từ mép vào — đòn bẩy chính để tăng số khúc cua */
  carveCount: number;
  /** Xác suất cắt chéo một góc vuông thành hai cua 45° */
  diagonalChance: number;
  /** Số đỉnh gấp khúc tối thiểu (4 = hình chữ nhật trơn, quá nhàm) */
  minVertices: number;
  /** Chu vi tối đa — chặn để một vòng đua không dài lê thê */
  maxLengthPx: number;
  baseWidth: number;
  widthVar: number;
  /** Sàn bán kính bo góc theo độ khó (vẫn bị chặn bởi chiều dài cạnh) */
  radiusFloor: number;
  mixHairpin: number;
  mixMedium: number;
}

const WORLD_CX = 1100;
const WORLD_CY = 900;

/**
 * Vì sao ô lưới không nhỏ hơn ~145px?
 * Hai khúc cua kề nhau chung một cạnh dài 1 ô, mỗi cua ăn mất một đoạn tiếp tuyến
 * bằng đúng bán kính của nó ⇒ cạnh phải ≥ 2 × bán kính nhỏ nhất = 2 × 68 = 136px.
 * Ô nhỏ hơn thế thì hai cua kề nhau chồng lên nhau và xe không thể ôm nổi.
 * Muốn lưới dày hơn nữa thì phải nới turnSpeed của xe trong racingPhysics.ts trước.
 *
 * Nên để có NHIỀU cua hơn, ta tăng số ô (thế giới rộng ra) và khoét rãnh vào vùng,
 * chứ không thu nhỏ ô.
 */
export function difficultyProfile(difficulty: number): DifficultyProfile {
  const d = Math.max(1, Math.min(5, difficulty));
  const t = (d - 1) / 4;
  const lerp = (a: number, b: number) => a + (b - a) * t;

  const cols = Math.round(lerp(11, 17));
  const rows = Math.round(lerp(8, 12));
  const cell = Math.round(lerp(215, 148));

  return {
    cols,
    rows,
    cell,
    rectCount: Math.round(lerp(3, 6)),
    carveCount: Math.round(lerp(7, 17)),
    diagonalChance: lerp(0.55, 0.40),
    minVertices: Math.round(lerp(24, 38)),
    maxLengthPx: lerp(8500, 11000),
    // Lòng đường không được rộng quá nửa ô, nếu không hai lằn đường kề nhau sẽ dính
    baseWidth: Math.round(Math.min(lerp(88, 52), cell * 0.48)),
    widthVar: lerp(0.04, 0.30),
    radiusFloor: lerp(150, HARD_MIN_RADIUS),
    mixHairpin: lerp(0.00, 0.45),
    mixMedium: lerp(0.25, 0.40),
  };
}

// ============================================================================
// 9. ENTRY POINT
// ============================================================================

/** Thống kê lý do loại của các lần sinh — phục vụ chỉnh tham số bộ sinh. */
export const genStats: Record<string, number> = {};
function reject(reason: string) {
  genStats[reason] = (genStats[reason] ?? 0) + 1;
}

export interface GenerateTrackOptions {
  seed?: number;
  difficulty?: number; // 1..5
  width?: number;      // ép bề rộng cố định (bỏ trống = theo độ khó)
}

export interface GeneratedTrack extends RacingTrack {
  seed: number;
  seedLabel: string;
  difficulty: number;
  theme: TrackTheme;
  grid: TrackGrid;
  blocks: BlockSummary;
  widths: number[];
  lengthPx: number;
  minRadius: number;
}

/**
 * Sinh một đường đua hoàn chỉnh từ seed.
 * Lưới đảm bảo sẵn tính khép kín và không tự cắt, nên vòng lặp thử ở đây chủ yếu để
 * loại những bố cục vùng xấu (quá nhỏ, có điểm thắt, biên rời thành nhiều vòng).
 */
export function generateTrack(opts: GenerateTrackOptions = {}): GeneratedTrack {
  const seed = (opts.seed ?? randomSeed()) >>> 0;
  const difficulty = Math.max(1, Math.min(5, opts.difficulty ?? 3));
  const prof = difficultyProfile(difficulty);
  const baseWidth = opts.width ?? prof.baseWidth;

  const theme = pickTheme(seed);
  const nameRng = mulberry32((seed ^ 0x5bf03635) >>> 0);
  const name = makeTrackName(nameRng, seed);

  const cell = prof.cell;
  const MAX_ATTEMPTS = 120;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Mỗi lần thử là một nhánh PRNG khác nhau nhưng vẫn tất định theo seed gốc
    const rng = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);

    // ── Vùng trên lưới ô ──
    const rRows = prof.rows - 1;
    const rCols = prof.cols - 1;
    const region = paintRegion(rng, rRows, rCols, prof.rectCount);
    if (!region) { reject('region'); continue; }

    carveSlots(rng, region, prof.carveCount);
    fillHoles(region);
    fixDiagonalPinches(region, rng);
    fillHoles(region); // lấp chéo có thể tạo lỗ mới

    // Kiểm diện tích SAU khi khoét: quá nhỏ thì đường đua vụn, quá to thì biên trơn
    const area = regionArea(region);
    const total = rRows * rCols;
    if (area < total * 0.15 || area > total * 0.82) { reject('area'); continue; }

    // ── Biên vùng → chu trình ô lưới ──
    const rawContour = traceContour(region, prof.cols, prof.rows);
    if (!rawContour) { reject('contour'); continue; }
    if (rawContour.length < 14) { reject('tooShort'); continue; }

    // Cắt chéo một phần góc vuông → có cua 45°/135° và đoạn thẳng chạy chéo
    const contour = diagonalizeContour(rawContour, rng, prof.diagonalChance);

    // ── Ô lưới → block → đường tim ──
    // Hình chữ nhật trơn có đúng 4 đỉnh — loại luôn, ta muốn bố cục có tính cách
    const verts = contourToVertices(contour, cell);
    if (verts.length < prof.minVertices) { reject('tooSimple'); continue; }

    const built = verticesToCenterline(verts, rng, prof, cell);
    if (!built) { reject('cornerGeometry'); continue; }
    const { points, blocks } = built;
    const path = resampleByArcLength(dedupeConsecutive(points, 2), 34);
    if (path.length < 48) { reject('resample'); continue; }

    if (selfIntersects(path)) { reject('selfcut'); continue; }
    if (sectionsTooClose(path, baseWidth * 1.8)) { reject('tooclose'); continue; }

    const minR = minCurvatureRadius(path);
    if (minR < HARD_MIN_RADIUS * 0.92) { reject('radius'); continue; }

    let perimeter = 0;
    for (let i = 0; i < path.length; i++) perimeter += distancePointToPoint(path[i], path[(i + 1) % path.length]);
    if (perimeter > prof.maxLengthPx) { reject('tooLong'); continue; }

    // Vạch xuất phát phải có đoạn chạy đà, nếu không cả thế hệ đầu đâm tường
    const aligned = rotateToLongestStraight(path);
    const runway = startRunway(aligned);
    if (runway < 300) { reject('noRunway'); continue; }

    // ── Map hợp lệ ──
    const shift = centerOnWorld(aligned);

    // Bề rộng biến thiên theo fBm: chỗ thắt cổ chai, chỗ mở rộng cho phép vượt
    const widthNoise = makeRingNoise((seed ^ 0x1b873593) >>> 0, 3);
    const n = aligned.length;
    const widths: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      widths[i] = baseWidth * (1 + prof.widthVar * widthNoise(i / n));
    }
    // Giữ vạch xuất phát và vùng lân cận rộng đúng chuẩn để cả đàn xe cùng xuất phát
    const startEase = Math.max(3, Math.floor(n * 0.05));
    for (let k = 0; k < startEase; k++) {
      const w = k / startEase;
      const idxA = k % n;
      const idxB = (n - 1 - k + n) % n;
      widths[idxA] = widths[idxA] * w + baseWidth * (1 - w);
      widths[idxB] = widths[idxB] * w + baseWidth * (1 - w);
    }

    const { leftWall, rightWall, checkpoints } = buildTrackBoundaries(aligned, widths, true);

    let lengthPx = 0;
    for (let i = 0; i < n; i++) lengthPx += distancePointToPoint(aligned[i], aligned[(i + 1) % n]);

    return {
      id: 'procedural',
      name,
      centerLine: aligned,
      leftWall,
      rightWall,
      checkpoints,
      startPoint: aligned[0],
      startAngle: Math.atan2(aligned[1].y - aligned[0].y, aligned[1].x - aligned[0].x),
      width: baseWidth,
      seed,
      seedLabel: seedToString(seed),
      difficulty,
      theme,
      grid: {
        cols: prof.cols,
        rows: prof.rows,
        cell: Math.round(cell),
        usedCells: contour.length,
        originX: shift.dx,
        originY: shift.dy,
      },
      blocks,
      widths,
      lengthPx: Math.round(lengthPx),
      minRadius: Math.round(minR),
    };
  }

  // Lưới an toàn tuyệt đối: một hình chữ nhật bo góc — không thể tự cắt
  return buildFallbackTrack(seed, difficulty, baseWidth, theme, name, prof, cell);
}

/**
 * Dời đường đua sao cho tâm hộp bao trùng với tâm thế giới.
 * Trả về độ dời để bên ngoài biết gốc lưới nằm ở đâu (dùng vẽ lưới ô trong UI).
 */
function centerOnWorld(path: Point[]): { dx: number; dy: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = WORLD_CX - (minX + maxX) / 2;
  const dy = WORLD_CY - (minY + maxY) / 2;
  for (const p of path) {
    p.x += dx;
    p.y += dy;
  }
  return { dx, dy };
}

function buildFallbackTrack(
  seed: number,
  difficulty: number,
  baseWidth: number,
  theme: TrackTheme,
  name: string,
  prof: DifficultyProfile,
  cell: number
): GeneratedTrack {
  // Hình chữ nhật đặc trên lưới → biên là một vòng chữ nhật, bo góc rộng
  const rows = prof.rows - 1;
  const cols = prof.cols - 1;
  const region = makeRegion(rows, cols);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) region[r][c] = true;

  const contour = traceContour(region, prof.cols, prof.rows)!;
  const verts = contourToVertices(contour, cell);
  const rng = mulberry32((seed ^ 0xdeadbeef) >>> 0);
  const { points, blocks } = verticesToCenterline(verts, rng, { ...prof, mixHairpin: 0.2, mixMedium: 0.4 }, cell)!;
  const aligned = rotateToLongestStraight(resampleByArcLength(dedupeConsecutive(points, 2), 34));
  const shift = centerOnWorld(aligned);

  const widths = new Array(aligned.length).fill(baseWidth);
  const { leftWall, rightWall, checkpoints } = buildTrackBoundaries(aligned, widths, true);

  let lengthPx = 0;
  for (let i = 0; i < aligned.length; i++) {
    lengthPx += distancePointToPoint(aligned[i], aligned[(i + 1) % aligned.length]);
  }

  return {
    id: 'procedural',
    name,
    centerLine: aligned,
    leftWall,
    rightWall,
    checkpoints,
    startPoint: aligned[0],
    startAngle: Math.atan2(aligned[1].y - aligned[0].y, aligned[1].x - aligned[0].x),
    width: baseWidth,
    seed,
    seedLabel: seedToString(seed),
    difficulty,
    theme,
    grid: {
      cols: prof.cols,
      rows: prof.rows,
      cell: Math.round(cell),
      usedCells: contour.length,
      originX: shift.dx,
      originY: shift.dy,
    },
    blocks,
    widths,
    lengthPx: Math.round(lengthPx),
    minRadius: Math.round(minCurvatureRadius(aligned)),
  };
}

/** Tương thích ngược với API cũ. */
export function generateRandomTrack(width = 65): RacingTrack {
  return generateTrack({ width, difficulty: 3 });
}
