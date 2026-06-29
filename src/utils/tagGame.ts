import { NeuralNetworkType } from '../types/game';
import { NeuralNetwork } from './racingPhysics';

// ============================================================================
// TAG GAME v3 — Đuổi bắt AI (KAI vs ALBERT)
//   • Tiến hoá QUẦN THỂ song song (population neuro-evolution) — học nhanh & thật.
//   • Huấn luyện ở chế độ nền (headless, nhiều ván/giây) để não giỏi dần.
//   • Hiển thị trận trực tiếp "não giỏi nhất vs não giỏi nhất".
//   • Nhảy 3D + hộp cản đẩy được + raycast 8 hướng (giữ nguyên từ v2).
//
// Vì sao v2 không học được: chỉ có 1 chaser + 1 evader, tiến hoá 1 lần/60s bằng
// hill-climbing → gần như không bao giờ học xong việc đuổi. v3 dùng quần thể +
// huấn luyện nền nên chỉ sau vài giây đã thấy KAI biết lao tới ALBERT.
// ============================================================================

export const TAG = {
  LENGTH:  200,
  WIDTH:   130,
  WALL_H:  28,

  PLAYER_R:     3.5,
  PLAYER_H:     8.0,
  MAX_SPEED:    1.0,     // dùng để CHUẨN HOÁ observation
  CHASER_SPEED: 0.60,    // KAI (đuổi) — đã GIẢM TỐC cho dễ quan sát
  EVADER_SPEED: 0.71,    // tốc độ CƠ SỞ của ALBERT — đã GIẢM TỐC (trận hiển thị tự điều chỉnh quanh mức này)
  FRICTION:     0.86,

  JUMP_FORCE:   1.8,
  GRAVITY:      0.055,
  JUMP_COOLDOWN: 120,

  CUBE_SIZE:    18.0,    // hộp cản TO hơn — dùng làm chướng ngại/chiến thuật
  NUM_CUBES:    5,
  CUBE_FRICTION: 0.93,   // trượt lâu hơn → người chạy đẩy/kéo đi dễ hơn
  CUBE_RESTITUTION: 0.35,
  CUBE_MASS:    1.25,    // nhẹ hơn (trước 2.5) → dễ bị đẩy/kéo

  TAG_DIST:     6.0,     // phải đứng RẤT sát mới bắt được (mặt phẳng X,Y)
  TAG_Z:        6.0,     // VÀ chênh lệch độ cao phải nhỏ — đang nhảy cao thì THOÁT
  TAG_COOLDOWN: 80,
  GRAB_DIST:    18.0,    // tầm với để CHỦ ĐỘNG nắm/kéo hộp (theo size hộp lớn hơn)
  GRAB_FIRST_REWARD: 60, // thưởng MỘT LẦN khi ALBERT lần đầu nắm hộp — bootstrap học dùng hộp (giống video)

  NUM_RAYS:     8,
  RAY_LENGTH:   90,

  MATCH_TICKS: 25 * 60,  // 25s / ván hiển thị
  MAX_TAGS:     1,        // BẮT 1 LẦN là kết thúc trận ngay

  MUTATION_RATE_DEFAULT: 0.12,

  // ── Tham số tiến hoá quần thể ──
  POP:            26,    // số cá thể mỗi vai
  ELITE:          4,     // số tinh hoa giữ nguyên
  EVAL_TICKS:     480,   // 8s/ván đánh giá headless (ngắn hơn → nhẹ hơn)
} as const;

// 23 inputs → output [move_x, move_y, jump, grab]
const NET_IN    = 23;
const NET_SHAPE = [NET_IN, 24, 16, 4];

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TagCube {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  colorHex: number;
}

// Tường chắn cố định trong phòng (AABB) — không đẩy được, chặn người & hộp & tia nhìn.
export interface TagWall {
  x: number; y: number;   // tâm
  w: number; h: number;   // bề rộng theo X, bề dày theo Y
}

// Một "phòng" (map) như trong video — bố cục hộp/tường + thời lượng riêng.
export interface TagMap {
  id: string;
  name: string;
  durationSec: number;
  hasGrab: boolean;                                   // có hộp kéo/đẩy không
  cubes: { x: number; y: number; size?: number }[];
  walls: TagWall[];
  desc: string;
}

export interface TagPlayer {
  role: 'chaser' | 'evader';
  brain: NeuralNetworkType;
  bestBrain: NeuralNetworkType;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fitness: number;
  bestFitness: number;
  generation: number;
  tagCount: number;
  tagCooldown: number;
  jumpCooldown: number;
  isGrounded: boolean;
  jumpIntent: boolean;
  grabbedCube: number;   // chỉ số hộp đang giữ (-1 = không giữ)
  grabOffX: number; grabOffY: number; // vị trí hộp so với người khi giữ
  hasGrabbed: boolean;   // đã từng nắm hộp trong ván này chưa (để thưởng 1 lần)
  maxSpeed: number;      // tốc độ tối đa hiệu dụng (cho phép handicap cân bằng động)
  heuristic?: 'chase' | 'flee'; // bot luật-cứng (để bootstrap huấn luyện), bỏ trống = dùng mạng
}

interface Genome { brain: NeuralNetworkType; fit: number; }

// Trạng thái một ván (dùng chung cho trận hiển thị và ván đánh giá headless).
interface Match {
  chaser: TagPlayer;
  evader: TagPlayer;
  cubes: TagCube[];
  walls: TagWall[];
  matchTicks: number;     // thời lượng ván (theo map đang chơi)
  tick: number;
  matchTagCount: number;
  tagFlashTicks: number; tagFlashX: number; tagFlashY: number;
  lastTagTick: number;
  avgDist: number;
  prevDist: number;
  done: boolean;
  winner: 'chaser' | 'evader' | null;
}

export interface TagWorld {
  // Trận hiển thị (mirror của disp để TagScreen/renderTag đọc trực tiếp)
  chaser: TagPlayer;
  evader: TagPlayer;
  cubes: TagCube[];
  walls: TagWall[];
  matchTicks: number;
  mapIdx: number;
  tick: number;
  matchTagCount: number;
  tagFlashTicks: number; tagFlashX: number; tagFlashY: number;
  resetDelayTicks: number;
  avgChaserDist: number;
  lastTagTick: number;

  generation: number;
  chaserWins: number;
  evaderWins: number;

  // ── Nội bộ: huấn luyện quần thể ──
  disp: Match;
  chaserPop: Genome[];
  evaderPop: Genome[];
  evalIdx: number;
  bestChaserBrain: NeuralNetworkType;
  bestEvaderBrain: NeuralNetworkType;
  bestChaserFit: number;
  bestEvaderFit: number;
  // Cân bằng động (rubber-banding) cho TRẬN HIỂN THỊ — kéo tỉ lệ thắng về ~50/50.
  balanceAdj: number;    // hệ số nhân tốc độ ALBERT ở trận hiển thị
  chaserWinEMA: number;  // tỉ lệ KAI thắng gần đây (trung bình trượt)
}


// ─── Spawn / khởi tạo ─────────────────────────────────────────────────────────

const CUBE_COLORS = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6];

// ─── Các phòng (maps) ─────────────────────────────────────────────────────────
// 4 phòng theo video AlbertKai + 2 phòng tự thiết kế. Đổi map giữ nguyên não
// (huấn luyện tiếp trên não cũ — giống cách tác giả train chồng lên phòng trước).
export const TAG_MAPS: TagMap[] = [
  {
    id: 'p1', name: 'Phòng 1 · Khởi đầu', durationSec: 12, hasGrab: false,
    desc: 'Phòng trống — chỉ học đuổi & trốn. Không có hộp, không có tường.',
    cubes: [], walls: [],
  },
  {
    id: 'p2', name: 'Phòng 2 · Hộp', durationSec: 15, hasGrab: true,
    desc: 'Thêm 5 hộp. ALBERT được kéo/đẩy hộp để chặn; KAI chỉ đẩy.',
    cubes: [
      { x: 0, y: 0 },
      { x: -50, y: -25 }, { x: 50, y: -25 },
      { x: -50, y: 25 }, { x: 50, y: 25 },
    ],
    walls: [],
  },
  {
    id: 'p3', name: 'Phòng 3 · Tường chắn', durationSec: 20, hasGrab: true,
    desc: 'Tường chắn dọc giữa phòng (có khe hở 2 đầu) + 3 hộp.',
    cubes: [ { x: -45, y: -22 }, { x: 45, y: 22 }, { x: 0, y: -40 } ],
    walls: [ { x: 0, y: 0, w: 8, h: 74 } ],
  },
  {
    id: 'final', name: 'Trận cuối · Song tường', durationSec: 25, hasGrab: true,
    desc: 'Hai tường lệch tạo lối zig-zag + 5 hộp. Phức tạp nhất.',
    cubes: [
      { x: 0, y: 0 },
      { x: -70, y: -28 }, { x: 70, y: -28 },
      { x: -70, y: 28 }, { x: 70, y: 28 },
    ],
    walls: [
      { x: -35, y: 0, w: 8, h: 56 },
      { x: 35, y: 0, w: 8, h: 56 },
    ],
  },
  {
    id: 'pillars', name: 'Cột trụ', durationSec: 18, hasGrab: true,
    desc: '4 cột trụ vuông ở 4 góc trong + 2 hộp — luồn lách quanh trụ.',
    cubes: [ { x: 0, y: -30 }, { x: 0, y: 30 } ],
    walls: [
      { x: -45, y: -26, w: 16, h: 16 }, { x: 45, y: -26, w: 16, h: 16 },
      { x: -45, y: 26, w: 16, h: 16 }, { x: 45, y: 26, w: 16, h: 16 },
    ],
  },
  {
    id: 'corridor', name: 'Hành lang', durationSec: 22, hasGrab: true,
    desc: 'Hai vách dài lệch nhau tạo hành lang chữ S + 2 hộp.',
    cubes: [ { x: -75, y: 0 }, { x: 75, y: 0 } ],
    walls: [
      { x: -22, y: 20, w: 116, h: 8 },
      { x: 22, y: -20, w: 116, h: 8 },
    ],
  },
];

function makeCubes(map: TagMap): TagCube[] {
  return map.cubes.map((p, i) => ({
    x: p.x, y: p.y, vx: 0, vy: 0,
    size: p.size ?? TAG.CUBE_SIZE, colorHex: CUBE_COLORS[i % CUBE_COLORS.length],
  }));
}

function cloneWalls(map: TagMap): TagWall[] {
  return map.walls.map(wl => ({ ...wl }));
}

function spawnPos(role: 'chaser' | 'evader', initial = false): { x: number; y: number } {
  const hl = TAG.LENGTH / 2 - 20;
  const hw = TAG.WIDTH  / 2 - 20;
  if (initial) {
    return role === 'chaser' ? { x: -hl * 0.65, y: 0 } : { x: hl * 0.65, y: 0 };
  }
  return {
    x: (role === 'chaser' ? -1 : 1) * (hl * 0.3 + Math.random() * hl * 0.4),
    y: (Math.random() - 0.5) * hw * 1.2,
  };
}

function makePlayer(role: 'chaser' | 'evader', brain: NeuralNetworkType, randomize: boolean): TagPlayer {
  const { x, y } = spawnPos(role, !randomize);
  return {
    role, brain, bestBrain: brain,
    x, y, z: 0, vx: 0, vy: 0, vz: 0,
    fitness: 0, bestFitness: 0, generation: 0,
    tagCount: 0, tagCooldown: 0, jumpCooldown: 0,
    isGrounded: true, jumpIntent: false,
    grabbedCube: -1, grabOffX: 0, grabOffY: 0, hasGrabbed: false,
    maxSpeed: role === 'chaser' ? TAG.CHASER_SPEED : TAG.EVADER_SPEED,
  };
}

function newMatch(map: TagMap, chaserBrain: NeuralNetworkType, evaderBrain: NeuralNetworkType, randomize: boolean): Match {
  const chaser = makePlayer('chaser', chaserBrain, randomize);
  const evader = makePlayer('evader', evaderBrain, randomize);
  const dx = chaser.x - evader.x, dy = chaser.y - evader.y;
  return {
    chaser, evader, cubes: makeCubes(map), walls: cloneWalls(map),
    matchTicks: map.durationSec * 60,
    tick: 0, matchTagCount: 0,
    tagFlashTicks: 0, tagFlashX: 0, tagFlashY: 0,
    lastTagTick: 0, avgDist: 100,
    prevDist: Math.sqrt(dx * dx + dy * dy),
    done: false, winner: null,
  };
}

function nextGen(pop: Genome[], mutationRate: number): Genome[] {
  pop.sort((a, b) => b.fit - a.fit);
  const next: Genome[] = [];
  for (let i = 0; i < TAG.ELITE && i < pop.length; i++) {
    next.push({ brain: NeuralNetwork.copy(pop[i].brain), fit: 0 });
  }
  const poolSize = Math.max(2, Math.floor(pop.length * 0.5));
  const pick = () => pop[Math.floor(Math.random() * poolSize)];
  while (next.length < pop.length) {
    const child = NeuralNetwork.mutate(NeuralNetwork.crossover(pick().brain, pick().brain), mutationRate);
    next.push({ brain: child, fit: 0 });
  }
  return next;
}

function makePop(): Genome[] {
  const pop: Genome[] = [];
  for (let i = 0; i < TAG.POP; i++) pop.push({ brain: NeuralNetwork.create(NET_SHAPE), fit: 0 });
  return pop;
}

export function createTagWorld(mapIdx = 0): TagWorld {
  const map = TAG_MAPS[mapIdx] ?? TAG_MAPS[0];
  const chaserPop = makePop();
  const evaderPop = makePop();
  const bestChaserBrain = NeuralNetwork.copy(chaserPop[0].brain);
  const bestEvaderBrain = NeuralNetwork.copy(evaderPop[0].brain);
  const disp = newMatch(map, bestChaserBrain, bestEvaderBrain, false);
  const w: TagWorld = {
    chaser: disp.chaser, evader: disp.evader, cubes: disp.cubes,
    walls: disp.walls, matchTicks: disp.matchTicks, mapIdx,
    tick: 0, matchTagCount: 0,
    tagFlashTicks: 0, tagFlashX: 0, tagFlashY: 0,
    resetDelayTicks: 0, avgChaserDist: 100, lastTagTick: 0,
    generation: 0, chaserWins: 0, evaderWins: 0,
    disp, chaserPop, evaderPop, evalIdx: 0,
    bestChaserBrain, bestEvaderBrain,
    bestChaserFit: 0, bestEvaderFit: 0,
    balanceAdj: 1, chaserWinEMA: 0.5,
  };
  return w;
}

export function resetTagWorld(w: TagWorld) {
  const fresh = createTagWorld(w.mapIdx);
  Object.assign(w, fresh);
}

// Đổi sang phòng khác NHƯNG GIỮ NGUYÊN não đã học (train tiếp trên não cũ).
// Chỉ thay bố cục (hộp/tường), thời lượng và mở ván hiển thị mới.
export function setTagMap(w: TagWorld, mapIdx: number) {
  if (mapIdx === w.mapIdx) return;
  const map = TAG_MAPS[mapIdx] ?? TAG_MAPS[0];
  w.mapIdx = mapIdx;
  w.disp = newMatch(map, w.bestChaserBrain, w.bestEvaderBrain, true);
  w.disp.evader.maxSpeed = TAG.EVADER_SPEED * w.balanceAdj;
  w.resetDelayTicks = 0;
  mirror(w);
}

// ─── Raycast ─────────────────────────────────────────────────────────────────

interface RayHit { dist: number; type: 0 | 1 | 2 }

function castRay(ox: number, oy: number, angle: number, cubes: TagCube[], walls: TagWall[], opp: { x: number; y: number }, oppR: number): RayHit {
  const maxD = TAG.RAY_LENGTH as number;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const eps = 1e-5;
  const hl = (TAG.LENGTH as number) / 2;
  const hw = (TAG.WIDTH  as number) / 2;
  let wallD: number = maxD;
  if (dx >  eps) wallD = Math.min(wallD, ( hl - ox) / dx);
  if (dx < -eps) wallD = Math.min(wallD, (-hl - ox) / dx);
  if (dy >  eps) wallD = Math.min(wallD, ( hw - oy) / dy);
  if (dy < -eps) wallD = Math.min(wallD, (-hw - oy) / dy);
  let hitD = Math.max(0, wallD);
  let hitType: 0 | 1 | 2 = 0;
  const idx = Math.abs(dx) > eps ? dx : eps;
  const idy = Math.abs(dy) > eps ? dy : eps;
  // Hộp (moveableObject) → type 1
  for (const cube of cubes) {
    const hs = cube.size / 2;
    const tx1 = (cube.x - hs - ox) / idx, tx2 = (cube.x + hs - ox) / idx;
    const ty1 = (cube.y - hs - oy) / idy, ty2 = (cube.y + hs - oy) / idy;
    const tNear = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const tFar  = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
    if (tFar > 0 && tNear < tFar && tNear < hitD) { hitD = Math.max(0, tNear); hitType = 1; }
  }
  // Tường cố định (wall) → type 0
  for (const wl of walls) {
    const hwx = wl.w / 2, hwy = wl.h / 2;
    const tx1 = (wl.x - hwx - ox) / idx, tx2 = (wl.x + hwx - ox) / idx;
    const ty1 = (wl.y - hwy - oy) / idy, ty2 = (wl.y + hwy - oy) / idy;
    const tNear = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const tFar  = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
    if (tFar > 0 && tNear < tFar && tNear < hitD) { hitD = Math.max(0, tNear); hitType = 0; }
  }
  const ex = opp.x - ox, ey = opp.y - oy;
  const t  = ex * dx + ey * dy;
  if (t > 0 && t < hitD) {
    const perpSq = ex * ex + ey * ey - t * t;
    if (perpSq < oppR * oppR * 2.25) { hitD = Math.max(0, t - oppR); hitType = 2; }
  }
  return { dist: hitD / maxD, type: hitType };
}

function buildInputs(self: TagPlayer, opp: TagPlayer, cubes: TagCube[], walls: TagWall[]): number[] {
  const dx = opp.x - self.x, dy = opp.y - self.y;
  const hl = TAG.LENGTH / 2, hw = TAG.WIDTH / 2;
  const inputs: number[] = [];
  const facing = Math.atan2(dy, dx);
  for (let i = 0; i < TAG.NUM_RAYS; i++) {
    const angle = facing + (i / TAG.NUM_RAYS) * Math.PI * 2;
    inputs.push(castRay(self.x, self.y, angle, cubes, walls, opp, TAG.PLAYER_R).dist);
  }
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
  inputs.push(Math.min(dist / 150, 1));
  inputs.push(dx / dist);
  inputs.push(dy / dist);
  inputs.push(self.vx / TAG.MAX_SPEED);
  inputs.push(self.vy / TAG.MAX_SPEED);
  inputs.push(self.vz / 2.0);
  inputs.push(Math.min(self.z / 15, 1));
  inputs.push(self.tagCooldown / TAG.TAG_COOLDOWN);
  inputs.push(self.x / hl);
  inputs.push(self.y / hw);
  inputs.push(opp.vz / 2.0);

  // ── Cảm biến HỘP (phục vụ nắm/kéo) ──
  const nc = nearestCubeIdx(self, cubes, -1);
  const ncd = nc.idx >= 0 ? nc.dist + 0.001 : 1;
  inputs.push(nc.idx >= 0 ? nc.dx / ncd : 0);              // hướng tới hộp gần nhất (x)
  inputs.push(nc.idx >= 0 ? nc.dy / ncd : 0);              // hướng tới hộp gần nhất (y)
  inputs.push(Math.min((nc.idx >= 0 ? nc.dist : 200) / 100, 1)); // khoảng cách tới hộp
  inputs.push(self.grabbedCube >= 0 ? 1 : 0);             // đang giữ hộp?
  return inputs;
}

// Hộp gần nhất (bỏ qua `exclude` — ví dụ hộp đối thủ đang giữ)
function nearestCubeIdx(p: TagPlayer, cubes: TagCube[], exclude: number) {
  let idx = -1, bd = Infinity, bdx = 0, bdy = 0;
  for (let i = 0; i < cubes.length; i++) {
    if (i === exclude) continue;
    const dx = cubes[i].x - p.x, dy = cubes[i].y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bd) { bd = d; idx = i; bdx = dx; bdy = dy; }
  }
  return { idx, dist: bd, dx: bdx, dy: bdy };
}

// Cập nhật trạng thái nắm hộp theo lệnh `grab` của mạng.
// LUẬT: chỉ NGƯỜI CHẠY (evader) mới được nắm/kéo hộp. NGƯỜI ĐUỔI (chaser) chỉ ĐẨY.
function updateGrab(p: TagPlayer, opp: TagPlayer, cubes: TagCube[], grab: boolean) {
  if (p.role === 'chaser') { p.grabbedCube = -1; return; } // KAI (đuổi) không được kéo/nắm hộp
  if (!grab) { p.grabbedCube = -1; return; }              // không ra lệnh → thả
  if (p.grabbedCube < 0) {                                // chưa giữ → thử nắm hộp gần nhất trong tầm với
    const n = nearestCubeIdx(p, cubes, opp.grabbedCube);  // không cướp hộp đối thủ đang giữ
    if (n.idx >= 0 && n.dist < TAG.GRAB_DIST) {
      p.grabbedCube = n.idx;
      // Thưởng MỘT LẦN cho lần đầu nắm được hộp — bootstrap để AI bắt đầu dùng hộp (giống video).
      if (!p.hasGrabbed) { p.fitness += TAG.GRAB_FIRST_REWARD; p.hasGrabbed = true; }
      const hold = TAG.PLAYER_R + cubes[n.idx].size / 2 + 1.5;
      const ol = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 1;
      p.grabOffX = (n.dx / ol) * hold;                    // giữ hộp ở cạnh, đúng phía vừa với tới
      p.grabOffY = (n.dy / ol) * hold;
    }
  }
}

// Kéo hộp đang giữ đi theo người.
function carryHeldCube(p: TagPlayer, cubes: TagCube[]) {
  if (p.grabbedCube < 0) return;
  const cube = cubes[p.grabbedCube];
  if (!cube) { p.grabbedCube = -1; return; }
  const tx = p.x + p.grabOffX, ty = p.y + p.grabOffY;
  cube.x += (tx - cube.x) * 0.6;
  cube.y += (ty - cube.y) * 0.6;
  cube.vx = p.vx; cube.vy = p.vy;
  const hl = TAG.LENGTH / 2 - cube.size / 2;
  const hw = TAG.WIDTH  / 2 - cube.size / 2;
  if (cube.x < -hl) cube.x = -hl; else if (cube.x > hl) cube.x = hl;
  if (cube.y < -hw) cube.y = -hw; else if (cube.y > hw) cube.y = hw;
}

// ─── Physics ─────────────────────────────────────────────────────────────────

// Mặt sàn đỡ chân của người: sàn phòng (0) hoặc NÓC HỘP nếu người đang ở
// phía trên một hộp (đứng/đáp lên trên). Nóc hộp cao = cube.size (body tâm ở size/2).
const STAND_TOL = 2.0;   // dung sai để "bắt" được nóc hộp khi rơi xuống
function supportFloor(p: TagPlayer, cubes: TagCube[]): number {
  let floor = 0;
  for (const cube of cubes) {
    const reach = cube.size / 2 + TAG.PLAYER_R;
    if (Math.abs(p.x - cube.x) < reach && Math.abs(p.y - cube.y) < reach) {
      const top = cube.size;
      // Chỉ được đỡ bởi NÓC hộp khi đang ở trên/ngang nóc (đáp xuống) —
      // không phải khi đâm NGANG vào thân hộp (lúc đó để pushCube xử lý).
      if (p.z >= top - STAND_TOL && top > floor) floor = top;
    }
  }
  return floor;
}

function applyPlayerMove(p: TagPlayer, mx: number, my: number, jump: boolean, cubes: TagCube[]) {
  const maxSpd = p.maxSpeed;
  const accel = maxSpd * (1 - TAG.FRICTION) * 1.6;
  p.vx = p.vx * TAG.FRICTION + mx * accel;
  p.vy = p.vy * TAG.FRICTION + my * accel;
  const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (spd > maxSpd) { p.vx = (p.vx / spd) * maxSpd; p.vy = (p.vy / spd) * maxSpd; }

  const isMoving = Math.abs(mx) > 0.2 || Math.abs(my) > 0.2;
  if (jump && p.isGrounded && p.jumpCooldown === 0 && isMoving) {
    p.vz = TAG.JUMP_FORCE; p.isGrounded = false; p.jumpCooldown = TAG.JUMP_COOLDOWN; p.jumpIntent = true;
  } else { p.jumpIntent = false; }
  if (p.jumpCooldown > 0) p.jumpCooldown--;

  p.vz -= TAG.GRAVITY; p.z += p.vz;
  const floor = supportFloor(p, cubes);   // có thể đứng/đáp lên NÓC hộp
  if (p.z <= floor) { p.z = floor; p.vz = 0; p.isGrounded = true; }
  else { p.isGrounded = false; }
  p.x += p.vx; p.y += p.vy;
}

function clampToRoom(p: TagPlayer) {
  const hl = TAG.LENGTH / 2 - TAG.PLAYER_R;
  const hw = TAG.WIDTH  / 2 - TAG.PLAYER_R;
  if (p.x < -hl) { p.x = -hl; p.vx *= -0.4; }
  if (p.x >  hl) { p.x =  hl; p.vx *= -0.4; }
  if (p.y < -hw) { p.y = -hw; p.vy *= -0.4; }
  if (p.y >  hw) { p.y =  hw; p.vy *= -0.4; }
}

// Người va tường cố định (AABB) → đẩy ra theo trục cạn hơn.
function collidePlayerWall(p: TagPlayer, wl: TagWall) {
  const hx = wl.w / 2 + TAG.PLAYER_R, hy = wl.h / 2 + TAG.PLAYER_R;
  const dx = p.x - wl.x, dy = p.y - wl.y;
  if (Math.abs(dx) >= hx || Math.abs(dy) >= hy) return;
  const px = hx - Math.abs(dx), py = hy - Math.abs(dy);
  if (px < py) { p.x = wl.x + (dx >= 0 ? hx : -hx); p.vx *= -0.3; }
  else         { p.y = wl.y + (dy >= 0 ? hy : -hy); p.vy *= -0.3; }
}

// Hộp va tường cố định (AABB).
function collideCubeWall(cube: TagCube, wl: TagWall) {
  const hx = wl.w / 2 + cube.size / 2, hy = wl.h / 2 + cube.size / 2;
  const dx = cube.x - wl.x, dy = cube.y - wl.y;
  if (Math.abs(dx) >= hx || Math.abs(dy) >= hy) return;
  const px = hx - Math.abs(dx), py = hy - Math.abs(dy);
  if (px < py) { cube.x = wl.x + (dx >= 0 ? hx : -hx); cube.vx *= -0.5; }
  else         { cube.y = wl.y + (dy >= 0 ? hy : -hy); cube.vy *= -0.5; }
}

function pushCube(p: TagPlayer, cube: TagCube) {
  // Đang đứng TRÊN nóc hộp này → chỉ tựa lên trên, không đẩy ngang.
  if (p.z >= cube.size - STAND_TOL) return;
  const hs = cube.size / 2 + TAG.PLAYER_R;
  const dx = p.x - cube.x, dy = p.y - cube.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > hs * 1.5 || dist < 0.001) return;
  const pen = hs - dist;
  if (pen > 0) {
    const nx = dx / dist, ny = dy / dist;
    // Người = khối lượng 1, hộp = CUBE_MASS. invMass nhỏ hơn → hộp bị đẩy nhiều hơn.
    const invMass = 1 / (1 + TAG.CUBE_MASS);
    cube.x -= nx * pen * (1 - invMass); cube.y -= ny * pen * (1 - invMass);
    p.x += nx * pen * invMass; p.y += ny * pen * invMass;
    // Truyền vận tốc người → hộp (cảm giác "đẩy/kéo" hộp chạy theo).
    const impulse = (p.vx * nx + p.vy * ny) * (1 + TAG.CUBE_RESTITUTION) * (1 - invMass);
    cube.vx += nx * impulse; cube.vy += ny * impulse;
    p.vx -= nx * impulse * 0.35; p.vy -= ny * impulse * 0.35;
  }
}

function stepCube(cube: TagCube) {
  cube.vx *= TAG.CUBE_FRICTION; cube.vy *= TAG.CUBE_FRICTION;
  cube.x += cube.vx; cube.y += cube.vy;
  const hl = TAG.LENGTH / 2 - cube.size / 2;
  const hw = TAG.WIDTH  / 2 - cube.size / 2;
  if (cube.x < -hl) { cube.x = -hl; cube.vx *= -0.5; }
  if (cube.x >  hl) { cube.x =  hl; cube.vx *= -0.5; }
  if (cube.y < -hw) { cube.y = -hw; cube.vy *= -0.5; }
  if (cube.y >  hw) { cube.y =  hw; cube.vy *= -0.5; }
}

function cubeCubeCollision(a: TagCube, b: TagCube) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
  const minD = (a.size + b.size) / 2;
  if (dist < minD) {
    const pen = minD - dist, nx = dx / dist, ny = dy / dist;
    a.x += nx * pen * 0.5; a.y += ny * pen * 0.5;
    b.x -= nx * pen * 0.5; b.y -= ny * pen * 0.5;
    const relVx = a.vx - b.vx, relVy = a.vy - b.vy;
    const j = (relVx * nx + relVy * ny) * (1 + TAG.CUBE_RESTITUTION) * 0.5;
    if (j > 0) { a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny; }
  }
}

// ─── 1 tick của một ván (dùng chung hiển thị + đánh giá) ──────────────────────

function aiStep(self: TagPlayer, opp: TagPlayer, cubes: TagCube[], walls: TagWall[]) {
  if (self.tagCooldown > 0) self.tagCooldown--;
  let mx: number, my: number, jump = false, grab = false;

  if (self.heuristic) {
    // Bot luật-cứng: 'chase' lao thẳng tới đối thủ, 'flee' chạy ngược ra xa (né tường).
    const sgn = self.heuristic === 'chase' ? 1 : -1;
    let ddx = (opp.x - self.x) * sgn, ddy = (opp.y - self.y) * sgn;
    const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1; ddx /= d; ddy /= d;
    if (self.heuristic === 'flee') {
      const hl = TAG.LENGTH / 2, hw = TAG.WIDTH / 2;
      if (Math.abs(self.x) > hl - 15) ddx += -Math.sign(self.x) * 1.0;  // lái về tâm khi sát tường
      if (Math.abs(self.y) > hw - 15) ddy += -Math.sign(self.y) * 1.0;
      const l = Math.sqrt(ddx * ddx + ddy * ddy) || 1; ddx /= l; ddy /= l;
    }
    mx = ddx; my = ddy;
  } else {
    const raw = NeuralNetwork.feedForward(self.brain, buildInputs(self, opp, cubes, walls));
    mx = Math.tanh(isNaN(raw[0]) ? 0 : raw[0]);
    my = Math.tanh(isNaN(raw[1]) ? 0 : raw[1]);
    jump = (isNaN(raw[2]) ? 0 : raw[2]) > 0.75;
    grab = (isNaN(raw[3]) ? 0 : raw[3]) > 0.5;
  }

  applyPlayerMove(self, mx, my, jump, cubes);
  updateGrab(self, opp, cubes, grab);
}

function tickMatch(m: Match) {
  const { chaser, evader, cubes, walls } = m;

  aiStep(chaser, evader, cubes, walls);
  aiStep(evader, chaser, cubes, walls);

  if (isNaN(chaser.x) || isNaN(chaser.y)) { const p = spawnPos('chaser', false); chaser.x = p.x; chaser.y = p.y; chaser.z = 0; chaser.vx = chaser.vy = chaser.vz = 0; }
  if (isNaN(evader.x) || isNaN(evader.y)) { const p = spawnPos('evader', false); evader.x = p.x; evader.y = p.y; evader.z = 0; evader.vx = evader.vy = evader.vz = 0; }

  clampToRoom(chaser);
  clampToRoom(evader);
  for (const wl of walls) { collidePlayerWall(chaser, wl); collidePlayerWall(evader, wl); }

  const isHeld = (i: number) => i === chaser.grabbedCube || i === evader.grabbedCube;
  for (let i = 0; i < cubes.length; i++) if (!isHeld(i)) stepCube(cubes[i]);
  for (let i = 0; i < cubes.length; i++) for (let j = i + 1; j < cubes.length; j++) cubeCubeCollision(cubes[i], cubes[j]);
  for (let i = 0; i < cubes.length; i++) {
    if (isHeld(i)) continue;                 // hộp đang bị giữ thì không bị "đẩy" — nó dính theo người
    pushCube(chaser, cubes[i]); pushCube(evader, cubes[i]);
    for (const wl of walls) collideCubeWall(cubes[i], wl);
  }
  // Kéo hộp đang giữ theo người (chạy sau cùng → vị trí hộp giữ là chuẩn)
  carryHeldCube(chaser, cubes);
  carryHeldCube(evader, cubes);

  const dx = chaser.x - evader.x, dy = chaser.y - evader.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  m.avgDist = m.avgDist * 0.998 + dist * 0.002;

  // ── Fitness ──
  // Tín hiệu mạnh nhất: thay đổi khoảng cách theo từng tick (delta).
  const delta = m.prevDist - dist;     // >0 nghĩa là chaser lại gần hơn
  m.prevDist = dist;

  const chaserSpeed = Math.sqrt(chaser.vx * chaser.vx + chaser.vy * chaser.vy);
  const evaderSpeed = Math.sqrt(evader.vx * evader.vx + evader.vy * evader.vy);

  // Chaser: thưởng lại gần (delta), thưởng ở gần, thưởng di chuyển.
  chaser.fitness += delta * 6.0;
  chaser.fitness += Math.max(0, 1 - dist / 90) * 1.5;
  chaser.fitness += Math.min(chaserSpeed / TAG.MAX_SPEED, 1) * 0.15;
  // Evader: thưởng ra xa (-delta), thưởng giữ khoảng cách, thưởng di chuyển.
  evader.fitness += (-delta) * 4.0;
  evader.fitness += Math.min(dist / 60, 2.0) * 0.5 + 0.05;
  evader.fitness += Math.min(evaderSpeed / TAG.MAX_SPEED, 1) * 0.15;

  // ── Bắt ── (phải sát theo X,Y VÀ gần nhau theo độ cao Z — nhảy qua thì không tính)
  const dz = Math.abs(chaser.z - evader.z);
  if (dist < TAG.TAG_DIST && dz < TAG.TAG_Z && chaser.tagCooldown === 0 && evader.tagCooldown === 0) {
    chaser.fitness += 300;
    evader.fitness -= 120;
    chaser.tagCount++;
    m.matchTagCount++;
    m.lastTagTick = m.tick;
    m.tagFlashTicks = 48;
    m.tagFlashX = (chaser.x + evader.x) / 2;
    m.tagFlashY = (chaser.y + evader.y) / 2;
    chaser.tagCooldown = TAG.TAG_COOLDOWN;
    evader.tagCooldown = TAG.TAG_COOLDOWN;
    const pushN = 1 / Math.max(dist, 0.1);
    evader.vx += (-dx * pushN) * 2.5;
    evader.vy += (-dy * pushN) * 2.5;
    if (m.matchTagCount >= TAG.MAX_TAGS) { m.done = true; m.winner = 'chaser'; return; }
  }

  if (m.tagFlashTicks > 0) m.tagFlashTicks--;
  m.tick++;
  if (m.tick >= m.matchTicks) { m.done = true; m.winner = 'evader'; evader.fitness += 120; }
}

// ─── Đánh giá headless 1 cá thể ───────────────────────────────────────────────

// Chạy 1 ván đánh giá headless. `*Heur` != null → bên đó là bot luật-cứng.
function runEval(
  map: TagMap,
  chaserBrain: NeuralNetworkType, evaderBrain: NeuralNetworkType,
  chaserHeur: 'chase' | null, evaderHeur: 'flee' | null,
): Match {
  const m = newMatch(map, chaserBrain, evaderBrain, true);
  if (chaserHeur) m.chaser.heuristic = chaserHeur;
  if (evaderHeur) m.evader.heuristic = evaderHeur;
  for (let t = 0; t < TAG.EVAL_TICKS && !m.done; t++) tickMatch(m);
  return m;
}

function trainOneIndividual(w: TagWorld, mutationRate: number) {
  const i = w.evalIdx;
  const map = TAG_MAPS[w.mapIdx] ?? TAG_MAPS[0];
  const cBrain = w.chaserPop[i].brain;
  const eBrain = w.evaderPop[i].brain;

  // Mỗi cá thể đấu 2 đối thủ: (a) nhà vô địch đối phương, (b) BOT luật-cứng.
  // Bot là mục tiêu học ổn định → chống "disengagement" (một bên áp đảo khiến
  // bên kia mất tín hiệu học). Nhờ vậy ALBERT luôn học được cách trốn.
  const cVsBest = runEval(map, cBrain, w.bestEvaderBrain, null, null).chaser.fitness;
  const cVsBot  = runEval(map, cBrain, w.bestEvaderBrain, null, 'flee').chaser.fitness;
  w.chaserPop[i].fit = (cVsBest + cVsBot) / 2;

  const eVsBest = runEval(map, w.bestChaserBrain, eBrain, null, null).evader.fitness;
  const eVsBot  = runEval(map, w.bestChaserBrain, eBrain, 'chase', null).evader.fitness;
  w.evaderPop[i].fit = (eVsBest + eVsBot) / 2;
  w.evalIdx++;

  if (w.evalIdx >= TAG.POP) {
    w.chaserPop.sort((a, b) => b.fit - a.fit);
    w.evaderPop.sort((a, b) => b.fit - a.fit);
    w.bestChaserBrain = NeuralNetwork.copy(w.chaserPop[0].brain);
    w.bestEvaderBrain = NeuralNetwork.copy(w.evaderPop[0].brain);
    w.bestChaserFit = Math.round(w.chaserPop[0].fit);
    w.bestEvaderFit = Math.round(w.evaderPop[0].fit);
    w.chaserPop = nextGen(w.chaserPop, mutationRate);
    w.evaderPop = nextGen(w.evaderPop, mutationRate);
    w.evalIdx = 0;
    w.generation++;
    // Cập nhật não cho trận đang hiển thị → khán giả thấy AI giỏi dần ngay.
    w.disp.chaser.brain = w.bestChaserBrain;
    w.disp.evader.brain = w.bestEvaderBrain;
  }
}

// ─── Đồng bộ trận hiển thị ra các field mà UI đọc ────────────────────────────

function mirror(w: TagWorld) {
  const d = w.disp;
  w.chaser = d.chaser; w.evader = d.evader; w.cubes = d.cubes;
  w.walls = d.walls; w.matchTicks = d.matchTicks;
  w.tick = d.tick; w.matchTagCount = d.matchTagCount;
  w.tagFlashTicks = d.tagFlashTicks; w.tagFlashX = d.tagFlashX; w.tagFlashY = d.tagFlashY;
  w.avgChaserDist = d.avgDist; w.lastTagTick = d.lastTagTick;
  // Stats: kỷ lục lấy từ huấn luyện, fitness ván hiện tại từ trận hiển thị.
  w.chaser.bestFitness = w.bestChaserFit;
  w.evader.bestFitness = w.bestEvaderFit;
  w.chaser.generation = w.generation;
  w.evader.generation = w.generation;
}

// ─── Main step ────────────────────────────────────────────────────────────────

export function stepTagWorld(w: TagWorld, mutationRate: number, speed = 1) {
  // 1) Huấn luyện nền theo NGÂN SÁCH THỜI GIAN: mỗi khung hình chỉ huấn luyện
  //    trong tối đa `budgetMs` mili-giây → giữ mượt (không giật) ở mọi tốc độ.
  //    Tua càng cao → ngân sách lớn hơn (học nhanh hơn) nhưng vẫn có trần.
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const budgetMs = Math.min(6, Math.max(1.5, 1 + speed * 0.12));
  const t0 = now();
  let did = 0;
  do {
    trainOneIndividual(w, mutationRate);
    did++;
  } while (did < 40 && now() - t0 < budgetMs);

  // 2) Trận hiển thị.
  // Pha "ăn mừng kết thúc": giữ trận đóng băng để hiệu ứng bắt (flash + hạt nổ)
  // chạy trọn, rồi mới mở trận mới — giống màn ghi bàn trò đá bóng.
  if (w.resetDelayTicks > 0) {
    w.resetDelayTicks--;
    if (w.disp.tagFlashTicks > 0) w.disp.tagFlashTicks--;
    if (w.resetDelayTicks === 0) {
      w.disp = newMatch(TAG_MAPS[w.mapIdx] ?? TAG_MAPS[0], w.bestChaserBrain, w.bestEvaderBrain, true);
      w.disp.evader.maxSpeed = TAG.EVADER_SPEED * w.balanceAdj; // áp handicap cân bằng
    }
    mirror(w);
    return;
  }

  for (let s = 0; s < speed; s++) {
    tickMatch(w.disp);
    if (w.disp.done) {
      const chaserWon = w.disp.winner === 'chaser';
      if (chaserWon) w.chaserWins++; else w.evaderWins++;
      // Cân bằng động: KAI thắng nhiều → ALBERT nhanh hơn; ALBERT thắng nhiều → chậm lại.
      w.chaserWinEMA = w.chaserWinEMA * 0.9 + (chaserWon ? 1 : 0) * 0.1; // nhớ lâu hơn → ít dao động
      w.balanceAdj += (w.chaserWinEMA - 0.5) * 0.045;                    // điều chỉnh nhẹ hơn
      if (w.balanceAdj < 0.78) w.balanceAdj = 0.78;
      if (w.balanceAdj > 1.70) w.balanceAdj = 1.70;
      // Bắt được → ăn mừng lâu (80 tick). Hết giờ (ALBERT thoát) → nghỉ ngắn.
      w.resetDelayTicks = chaserWon ? 80 : 50;
      break; // KHÔNG mở trận mới ngay — để pha ăn mừng chạy trước
    }
  }
  mirror(w);
}

export function secondsLeftTag(w: TagWorld): number {
  return Math.max(0, Math.ceil((w.matchTicks - w.tick) / 60));
}

// Tia nhìn (raycast) của một người — dùng cho hiển thị "tầm nhìn AI".
// Trả về đoạn thẳng từ mắt người tới điểm trúng + loại vật trúng (0 tường, 1 hộp, 2 đối thủ).
export interface VisionRay { x1: number; y1: number; x2: number; y2: number; type: 0 | 1 | 2 }
export function computeVision(self: TagPlayer, opp: TagPlayer, cubes: TagCube[], walls: TagWall[]): VisionRay[] {
  const dx = opp.x - self.x, dy = opp.y - self.y;
  const facing = Math.atan2(dy, dx);
  const out: VisionRay[] = [];
  for (let i = 0; i < TAG.NUM_RAYS; i++) {
    const angle = facing + (i / TAG.NUM_RAYS) * Math.PI * 2;
    const hit = castRay(self.x, self.y, angle, cubes, walls, opp, TAG.PLAYER_R);
    const d = hit.dist * TAG.RAY_LENGTH;
    out.push({ x1: self.x, y1: self.y, x2: self.x + Math.cos(angle) * d, y2: self.y + Math.sin(angle) * d, type: hit.type });
  }
  return out;
}

// Chỉ dùng cho kiểm thử cân bằng: chạy 1 ván best-vs-best (không huấn luyện).
export function simulateBestMatch(w: TagWorld, evaderSpeedMul = 1): 'chaser' | 'evader' {
  const m = newMatch(TAG_MAPS[w.mapIdx] ?? TAG_MAPS[0], w.bestChaserBrain, w.bestEvaderBrain, true);
  m.evader.maxSpeed = TAG.EVADER_SPEED * evaderSpeedMul;
  while (!m.done) tickMatch(m);
  return m.winner ?? 'evader';
}
