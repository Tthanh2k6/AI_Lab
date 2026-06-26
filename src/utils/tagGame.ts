import { NeuralNetworkType } from '../types/game';
import { NeuralNetwork } from './racingPhysics';

// ============================================================================
// TAG GAME v2 — Mô phỏng Albert/Kai
//   • Nhảy 3D (Z-axis + trọng lực)
//   • Hộp cản di chuyển được (có thể đẩy, tạo chiến thuật)
//   • Raycast 8 hướng (mắt AI nhìn tường, hộp, đối thủ)
//   • Tiến hoá song song (neuro-evolution thay RL)
// ============================================================================

export const TAG = {
  // Room (2D sàn + chiều cao)
  LENGTH:  200,
  WIDTH:   130,
  WALL_H:  28,

  // Nhân vật
  PLAYER_R:     3.5,
  PLAYER_H:     8.0,     // chiều cao khối
  MAX_SPEED:    0.85,
  FRICTION:     0.87,

  // Nhảy — cooldown dài hơn để AI không chỉ nhảy một chỗ
  JUMP_FORCE:   1.8,
  GRAVITY:      0.055,
  JUMP_COOLDOWN: 120,   // 2s giữa các lần nhảy (trước 48)

  // Hộp cản
  CUBE_SIZE:    8.5,
  NUM_CUBES:    5,
  CUBE_FRICTION: 0.91,
  CUBE_RESTITUTION: 0.35,

  // Bắt
  TAG_DIST:     7.5,     // phải đứng sát mới tính là bắt
  TAG_COOLDOWN: 80,

  // Raycast
  NUM_RAYS:     8,
  RAY_LENGTH:   90,

  // Trận đấu
  MATCH_TICKS: 60 * 60,  // 60s / ván
  MAX_TAGS:     5,        // bắt đủ 5 lần → Chaser thắng

  MUTATION_RATE_DEFAULT: 0.12,
} as const;

// ── Network shape ──────────────────────────────────────────────────────────
// 19 inputs:
//   [0..7] 8 raycast distances (tường/hộp/đối thủ, 0=sát/1=xa)
//   [8]   dist tới đối thủ (norm)
//   [9,10] hướng dx, dy tới đối thủ (unit vector)
//   [11,12,13] vx, vy, vz của mình (norm)
//   [14]  z của mình (chiều cao, 0→1)
//   [15]  tag cooldown (norm)
//   [16]  x position (norm -1..1)
//   [17]  y position (norm -1..1)
//   [18]  opp.vz (dự đoán nhảy)
const NET_IN    = 19;
const NET_SHAPE = [NET_IN, 22, 14, 3]; // output: [move_x, move_y, jump]

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TagCube {
  x: number; y: number;         // vị trí trên sàn
  vx: number; vy: number;       // vận tốc
  size: number;                 // cạnh
  colorHex: number;             // màu Three.js
}

export interface TagPlayer {
  role: 'chaser' | 'evader';
  brain: NeuralNetworkType;
  bestBrain: NeuralNetworkType;
  // Vị trí 3D
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  // Học
  fitness: number;
  bestFitness: number;
  generation: number;
  tagCount: number;             // số lần bắt/bị bắt
  tagCooldown: number;
  jumpCooldown: number;
  // Trạng thái
  isGrounded: boolean;
  jumpIntent: boolean;
}

export interface TagWorld {
  chaser: TagPlayer;
  evader: TagPlayer;
  cubes: TagCube[];
  tick: number;
  generation: number;
  matchTagCount: number;
  chaserWins: number;
  evaderWins: number;
  tagFlashTicks: number;
  tagFlashX: number;
  tagFlashY: number;
  resetDelayTicks: number;
  // Stats
  avgChaserDist: number;    // khoảng cách trung bình ván này
  lastTagTick: number;      // tick lần bắt cuối
}

// ─── Cube positions (5 hộp đặt theo hình chữ X) ──────────────────────────

const CUBE_COLORS = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6];

function makeCubes(): TagCube[] {
  const positions = [
    { x:   0, y:   0 },         // Giữa
    { x: -50, y: -25 },
    { x:  50, y: -25 },
    { x: -50, y:  25 },
    { x:  50, y:  25 },
  ];
  return positions.map((p, i) => ({
    x: p.x, y: p.y,
    vx: 0, vy: 0,
    size: TAG.CUBE_SIZE,
    colorHex: CUBE_COLORS[i],
  }));
}

function makePlayer(role: 'chaser' | 'evader'): TagPlayer {
  const brain = NeuralNetwork.create(NET_SHAPE);
  const { x, y } = spawnPos(role, true);
  return {
    role, brain,
    bestBrain: NeuralNetwork.copy(brain),
    x, y, z: 0,
    vx: 0, vy: 0, vz: 0,
    fitness: 0, bestFitness: -Infinity,
    generation: 0,
    tagCount: 0, tagCooldown: 0, jumpCooldown: 0,
    isGrounded: true, jumpIntent: false,
  };
}

function spawnPos(role: 'chaser' | 'evader', initial = false): { x: number; y: number } {
  const hl = TAG.LENGTH / 2 - 20;
  const hw = TAG.WIDTH  / 2 - 20;
  if (initial) {
    return role === 'chaser'
      ? { x: -hl * 0.65, y: 0 }
      : { x:  hl * 0.65, y: 0 };
  }
  // Ngẫu nhiên có kiểm tra không quá gần nhau
  return {
    x: (role === 'chaser' ? -1 : 1) * (hl * 0.3 + Math.random() * hl * 0.4),
    y: (Math.random() - 0.5) * hw * 1.2,
  };
}

export function createTagWorld(): TagWorld {
  return {
    chaser: makePlayer('chaser'),
    evader: makePlayer('evader'),
    cubes: makeCubes(),
    tick: 0, generation: 0,
    matchTagCount: 0, chaserWins: 0, evaderWins: 0,
    tagFlashTicks: 0, tagFlashX: 0, tagFlashY: 0,
    resetDelayTicks: 0,
    avgChaserDist: 100, lastTagTick: 0,
  };
}

export function resetTagWorld(w: TagWorld) {
  w.chaser = makePlayer('chaser');
  w.evader = makePlayer('evader');
  w.cubes  = makeCubes();
  w.tick = 0; w.generation = 0;
  w.matchTagCount = 0; w.chaserWins = 0; w.evaderWins = 0;
  w.tagFlashTicks = 0; w.resetDelayTicks = 0;
  w.avgChaserDist = 100; w.lastTagTick = 0;
}

// ─── Raycast ─────────────────────────────────────────────────────────────────

interface RayHit { dist: number; type: 0 | 1 | 2 } // 0=tường, 1=hộp, 2=đối thủ

function castRay(
  ox: number, oy: number,
  angle: number,
  cubes: TagCube[],
  opp: { x: number; y: number },
  oppR: number,
): RayHit {
  const maxD = TAG.RAY_LENGTH as number;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const eps = 1e-5;

  // Khoảng cách tới tường
  const hl = TAG.LENGTH as number / 2;
  const hw = TAG.WIDTH  as number / 2;
  let wallD: number = maxD;
  if (dx >  eps) wallD = Math.min(wallD, ( hl - ox) / dx);
  if (dx < -eps) wallD = Math.min(wallD, (-hl - ox) / dx);
  if (dy >  eps) wallD = Math.min(wallD, ( hw - oy) / dy);
  if (dy < -eps) wallD = Math.min(wallD, (-hw - oy) / dy);

  let hitD = Math.max(0, wallD);
  let hitType: 0 | 1 | 2 = 0;

  // Kiểm tra hộp (AABB slab method)
  for (const cube of cubes) {
    const hs = cube.size / 2;
    const tx1 = (cube.x - hs - ox) / (Math.abs(dx) > eps ? dx : eps);
    const tx2 = (cube.x + hs - ox) / (Math.abs(dx) > eps ? dx : eps);
    const ty1 = (cube.y - hs - oy) / (Math.abs(dy) > eps ? dy : eps);
    const ty2 = (cube.y + hs - oy) / (Math.abs(dy) > eps ? dy : eps);
    const tNear = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const tFar  = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
    if (tFar > 0 && tNear < tFar && tNear < hitD) {
      hitD = Math.max(0, tNear);
      hitType = 1;
    }
  }

  // Kiểm tra đối thủ (circle)
  const ex = opp.x - ox;
  const ey = opp.y - oy;
  const t  = ex * dx + ey * dy;
  if (t > 0 && t < hitD) {
    const perpSq = ex * ex + ey * ey - t * t;
    if (perpSq < oppR * oppR * 2.25) {
      hitD = Math.max(0, t - oppR);
      hitType = 2;
    }
  }

  return { dist: hitD / maxD, type: hitType };
}

function buildInputs(self: TagPlayer, opp: TagPlayer, cubes: TagCube[]): number[] {
  const dx = opp.x - self.x;
  const dy = opp.y - self.y;
  const hl = TAG.LENGTH / 2;
  const hw = TAG.WIDTH  / 2;

  // 8 raycast directions (góc tính từ hướng đông)
  const inputs: number[] = [];
  const facing = Math.atan2(dy, dx);
  for (let i = 0; i < TAG.NUM_RAYS; i++) {
    const angle = facing + (i / TAG.NUM_RAYS) * Math.PI * 2;
    const hit = castRay(self.x, self.y, angle, cubes, opp, TAG.PLAYER_R);
    inputs.push(hit.dist);
  }

  const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
  inputs.push(Math.min(dist / 150, 1));                   // dist to opponent
  inputs.push(dx / dist);                                 // dir_x
  inputs.push(dy / dist);                                 // dir_y
  inputs.push(self.vx / TAG.MAX_SPEED);                   // own vx
  inputs.push(self.vy / TAG.MAX_SPEED);                   // own vy
  inputs.push(self.vz / 2.0);                             // own vz
  inputs.push(Math.min(self.z / 15, 1));                  // own height
  inputs.push(self.tagCooldown / TAG.TAG_COOLDOWN);       // cooldown
  inputs.push(self.x / hl);                               // x pos
  inputs.push(self.y / hw);                               // y pos
  inputs.push(opp.vz / 2.0);                              // opp vz

  return inputs; 
}

// ─── Physics ─────────────────────────────────────────────────────────────────

function applyPlayerMove(
  p: TagPlayer,
  mx: number, my: number,
  jump: boolean,
) {
  // Horizontal movement
  const accel = TAG.MAX_SPEED * (1 - TAG.FRICTION) * 1.4;
  p.vx = p.vx * TAG.FRICTION + mx * accel;
  p.vy = p.vy * TAG.FRICTION + my * accel;

  // Giới hạn tốc độ
  const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (spd > TAG.MAX_SPEED) {
    p.vx = (p.vx / spd) * TAG.MAX_SPEED;
    p.vy = (p.vy / spd) * TAG.MAX_SPEED;
  }

  // Nhảy — chỉ nhảy nếu đang di chuyển (không nhảy 1 chỗ)
  const isMoving = Math.abs(mx) > 0.2 || Math.abs(my) > 0.2;
  if (jump && p.isGrounded && p.jumpCooldown === 0 && isMoving) {
    p.vz = TAG.JUMP_FORCE;
    p.isGrounded = false;
    p.jumpCooldown = TAG.JUMP_COOLDOWN;
    p.jumpIntent = true;
  } else {
    p.jumpIntent = false;
  }
  if (p.jumpCooldown > 0) p.jumpCooldown--;

  // Trọng lực
  p.vz -= TAG.GRAVITY;
  p.z  += p.vz;

  // Hạ cánh
  if (p.z <= 0) {
    p.z = 0;
    p.vz = 0;
    p.isGrounded = true;
  }

  // Di chuyển ngang
  p.x += p.vx;
  p.y += p.vy;
}

function clampToRoom(p: TagPlayer) {
  const hl = TAG.LENGTH / 2 - TAG.PLAYER_R;
  const hw = TAG.WIDTH  / 2 - TAG.PLAYER_R;
  if (p.x < -hl) { p.x = -hl; p.vx *= -0.4; }
  if (p.x >  hl) { p.x =  hl; p.vx *= -0.4; }
  if (p.y < -hw) { p.y = -hw; p.vy *= -0.4; }
  if (p.y >  hw) { p.y =  hw; p.vy *= -0.4; }
}

function pushCube(p: TagPlayer, cube: TagCube) {
  const hs = cube.size / 2 + TAG.PLAYER_R;
  const dx = p.x - cube.x;
  const dy = p.y - cube.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > hs * 1.5 || dist < 0.001) return;

  const pen = hs - dist;
  if (pen > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    // Đẩy hộp ra
    const invMass = 1 / (1 + 2.5); // player mass = 1, cube mass = 2.5
    cube.x -= nx * pen * (1 - invMass);
    cube.y -= ny * pen * (1 - invMass);
    p.x    += nx * pen * invMass;
    p.y    += ny * pen * invMass;
    // Truyền động lực
    const impulse = (p.vx * nx + p.vy * ny) * (1 + TAG.CUBE_RESTITUTION) * invMass * 0.8;
    cube.vx += nx * impulse;
    cube.vy += ny * impulse;
    p.vx   -= nx * impulse * 0.5;
    p.vy   -= ny * impulse * 0.5;
  }
}

function stepCube(cube: TagCube) {
  cube.vx *= TAG.CUBE_FRICTION;
  cube.vy *= TAG.CUBE_FRICTION;
  cube.x  += cube.vx;
  cube.y  += cube.vy;

  // Clamp trong phòng
  const hl = TAG.LENGTH / 2 - cube.size / 2;
  const hw = TAG.WIDTH  / 2 - cube.size / 2;
  if (cube.x < -hl) { cube.x = -hl; cube.vx *= -0.5; }
  if (cube.x >  hl) { cube.x =  hl; cube.vx *= -0.5; }
  if (cube.y < -hw) { cube.y = -hw; cube.vy *= -0.5; }
  if (cube.y >  hw) { cube.y =  hw; cube.vy *= -0.5; }
}

function cubeCubeCollision(a: TagCube, b: TagCube) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
  const minD = (a.size + b.size) / 2;
  if (dist < minD) {
    const pen = minD - dist;
    const nx = dx / dist, ny = dy / dist;
    a.x += nx * pen * 0.5; a.y += ny * pen * 0.5;
    b.x -= nx * pen * 0.5; b.y -= ny * pen * 0.5;
    const relVx = a.vx - b.vx, relVy = a.vy - b.vy;
    const j = (relVx * nx + relVy * ny) * (1 + TAG.CUBE_RESTITUTION) * 0.5;
    if (j > 0) {
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
    }
  }
}

// ─── Evolution ────────────────────────────────────────────────────────────────

function evolve(p: TagPlayer, mutationRate: number) {
  if (p.fitness > p.bestFitness) {
    p.bestFitness = p.fitness;
    p.bestBrain   = NeuralNetwork.copy(p.brain);
  } else {
    p.brain = NeuralNetwork.mutate(NeuralNetwork.copy(p.bestBrain), mutationRate);
  }
  p.fitness = 0;
  p.generation++;
}

function endMatch(w: TagWorld, mutationRate: number, winner: 'chaser' | 'evader') {
  if (winner === 'chaser') {
    w.chaserWins++;
  } else {
    w.evaderWins++;
    w.evader.fitness += 80; // bonus sống sót
  }
  evolve(w.chaser, mutationRate);
  evolve(w.evader, mutationRate);

  w.generation++;
  w.tick = 0;
  w.matchTagCount = 0;
  w.tagFlashTicks = 0;
  w.avgChaserDist = 100;
  w.lastTagTick = 0;

  // Reset vị trí ngẫu nhiên
  const cs = spawnPos('chaser', false);
  const es = spawnPos('evader', false);
  w.chaser.x = cs.x; w.chaser.y = cs.y; w.chaser.z = 0;
  w.evader.x = es.x; w.evader.y = es.y; w.evader.z = 0;
  w.chaser.vx = w.chaser.vy = w.chaser.vz = 0;
  w.evader.vx = w.evader.vy = w.evader.vz = 0;
  w.chaser.tagCount = 0; w.evader.tagCount = 0;
  w.chaser.tagCooldown = 0; w.evader.tagCooldown = 0;
  w.chaser.jumpCooldown = 0; w.evader.jumpCooldown = 0;
  w.cubes = makeCubes();
  w.resetDelayTicks = 55;
}

// ─── Main step ────────────────────────────────────────────────────────────────

export function stepTagWorld(w: TagWorld, mutationRate: number) {
  if (w.resetDelayTicks > 0) {
    w.resetDelayTicks--;
    if (w.tagFlashTicks > 0) w.tagFlashTicks--;
    return;
  }

  const { chaser, evader, cubes } = w;

  // ── Chaser AI step ──
  if (chaser.tagCooldown > 0) chaser.tagCooldown--;
  const ci  = buildInputs(chaser, evader, cubes);
  const coRaw = NeuralNetwork.feedForward(chaser.brain, ci);
  const cmx = Math.tanh(isNaN(coRaw[0]) ? 0 : coRaw[0]);
  const cmy = Math.tanh(isNaN(coRaw[1]) ? 0 : coRaw[1]);
  const cjump = (isNaN(coRaw[2]) ? 0 : coRaw[2]) > 0.75; // ngưỡng nhảy cao hơn
  applyPlayerMove(chaser, cmx, cmy, cjump);

  // ── Evader AI step ──
  if (evader.tagCooldown > 0) evader.tagCooldown--;
  const ei  = buildInputs(evader, chaser, cubes);
  const eoRaw = NeuralNetwork.feedForward(evader.brain, ei);
  const emx = Math.tanh(isNaN(eoRaw[0]) ? 0 : eoRaw[0]);
  const emy = Math.tanh(isNaN(eoRaw[1]) ? 0 : eoRaw[1]);
  const ejump = (isNaN(eoRaw[2]) ? 0 : eoRaw[2]) > 0.75; // ngưỡng nhảy cao hơn
  applyPlayerMove(evader, emx, emy, ejump);

  // ── NaN guard: reset positions if broken ──
  if (isNaN(chaser.x) || isNaN(chaser.y)) {
    const p = spawnPos('chaser', false);
    chaser.x = p.x; chaser.y = p.y; chaser.z = 0;
    chaser.vx = chaser.vy = chaser.vz = 0;
  }
  if (isNaN(evader.x) || isNaN(evader.y)) {
    const p = spawnPos('evader', false);
    evader.x = p.x; evader.y = p.y; evader.z = 0;
    evader.vx = evader.vy = evader.vz = 0;
  }

  // ── Clamp ──
  clampToRoom(chaser);
  clampToRoom(evader);

  // ── Cube physics ──
  for (const cube of cubes) stepCube(cube);
  for (let i = 0; i < cubes.length; i++) {
    for (let j = i + 1; j < cubes.length; j++) cubeCubeCollision(cubes[i], cubes[j]);
  }
  for (const cube of cubes) {
    pushCube(chaser, cube);
    pushCube(evader, cube);
  }

  // ── Distance & Fitness ──
  const dx   = chaser.x - evader.x;
  const dy   = chaser.y - evader.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Running average
  w.avgChaserDist = w.avgChaserDist * 0.998 + dist * 0.002;

  // Chaser fitness: tiếp cận Evader + thưởng di chuyển
  const chaserSpeed = Math.sqrt(chaser.vx * chaser.vx + chaser.vy * chaser.vy);
  chaser.fitness += Math.max(0, 1 - dist / 100) * 3.0;     // tiếp cận
  chaser.fitness += Math.min(chaserSpeed / TAG.MAX_SPEED, 1) * 0.3; // thưởng chạy nhanh

  // Evader fitness: xa Chaser + thưởng di chuyển
  const evaderSpeed = Math.sqrt(evader.vx * evader.vx + evader.vy * evader.vy);
  evader.fitness += Math.min(dist / 60, 2.0) + 0.001;      // xa chaser
  evader.fitness += Math.min(evaderSpeed / TAG.MAX_SPEED, 1) * 0.2; // thưởng di chuyển

  // ── TAG check ──
  if (dist < TAG.TAG_DIST && chaser.tagCooldown === 0 && evader.tagCooldown === 0) {
    chaser.fitness  += 250;
    evader.fitness  -= 60;
    w.matchTagCount++;
    w.lastTagTick = w.tick;
    w.tagFlashTicks = 48;
    w.tagFlashX = (chaser.x + evader.x) / 2;
    w.tagFlashY = (chaser.y + evader.y) / 2;
    chaser.tagCooldown = TAG.TAG_COOLDOWN;
    evader.tagCooldown = TAG.TAG_COOLDOWN;
    // Bắn Evader ra xa
    const pushN = 1 / Math.max(dist, 0.1);
    evader.vx += (-dx * pushN) * 2.5;
    evader.vy += (-dy * pushN) * 2.5;

    if (w.matchTagCount >= TAG.MAX_TAGS) {
      endMatch(w, mutationRate, 'chaser');
      return;
    }
  }

  if (w.tagFlashTicks > 0) w.tagFlashTicks--;
  w.tick++;

  if (w.tick >= TAG.MATCH_TICKS) {
    endMatch(w, mutationRate, 'evader');
  }
}

export function secondsLeftTag(w: TagWorld): number {
  return Math.max(0, Math.ceil((TAG.MATCH_TICKS - w.tick) / 60));
}
