import { NeuralNetworkType } from '../types/game';
import { NeuralNetwork } from './racingPhysics';

// ============================================================================
// SOCCER 2 — Bóng tự do + Va chạm cứng + Skill đá bổng
//   • Bóng HOÀN TOÀN TỰ DO — không ai giữ bóng
//   • Chạm bóng → đẩy bóng đi nhanh hơn cầu thủ 1 chút (flat)
//   • Skill đá (output[2]): bóng bổng lên với vz = KICK_LIFT
//   • Va chạm người cứng: velocity phản chiếu, không xuyên qua nhau
//   • Bóng to: BALL_R = 2.7 (≈ 90% kích thước cầu thủ)
// ============================================================================

export const SOCCER2 = {
  LENGTH: 200,
  WIDTH: 128,
  WALL_H: 22,
  GOAL_W: 52,
  GOAL_H: 24,
  PLAYER_R: 3.0,
  BALL_R: 2.7,
  STEP_DELAY: 16,
  STEP_RADIUS: 8,
  MAX_PLAYER_SPEED: 0.8,
  PUSH_FACTOR: 1.05,
  PUSH_LIFT: 0,
  KICK_POWER: 1.5,
  KICK_LIFT: 1.2,
  KICK_COOLDOWN: 35,
  GRAVITY: 0.045,
  GROUND_FRICTION: 0.975,
  AIR_FRICTION: 0.992,
  RESTITUTION_GROUND: 0.82,
  RESTITUTION_WALL: 0.7,
  JUMP_FORCE: 1.6,
  JUMP_COOLDOWN: 90,     // tick chờ SAU KHI HẠ CÁNH mới nhảy tiếp (~1.5s)
  MATCH_TICKS: 60 * 180,
} as const;

// 17 input → 16 hidden → 12 hidden → 4 output (dx, dy, kick, jump)
const NET2_SHAPE = [17, 16, 12, 4];

export interface Soccer2Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

export interface Soccer2Player {
  brain: NeuralNetworkType;
  x: number; y: number;
  z: number; vz: number;    // chiều cao (0 = sàn) + vận tốc đứng
  vx: number; vy: number;
  tx: number; ty: number;
  cooldown: number;
  kickCooldown: number;
  kickIntent: boolean;
  jumpCooldown: number;     // tick chờ giữa 2 lần nhảy
  jumpIntent: boolean;      // output[3] > 0 của mạng
  fitness: number;
  bestFitness: number;
  bestBrain: NeuralNetworkType;
  generation: number;
  team: 'orange' | 'blue';
}

export interface Soccer2World {
  orange: Soccer2Player;
  blue: Soccer2Player;
  ball: Soccer2Ball;
  scoreOrange: number;
  scoreBlue: number;
  tick: number;
  generation: number;
  lastKickStrength: number;
  ballStuckTicks: number;
  lastTouched: 'orange' | 'blue' | null; // ai chạm bóng cuối cùng
  resetDelayTicks: number;
  loser: 'orange' | 'blue' | null;
  pendingScorer: 'orange' | 'blue' | null;
}

// ── Khởi tạo ─────────────────────────────────────────────────────────────────

function makePlayer2(team: 'orange' | 'blue'): Soccer2Player {
  const brain = NeuralNetwork.create(NET2_SHAPE);
  const startX = team === 'orange' ? -SOCCER2.LENGTH * 0.22 : SOCCER2.LENGTH * 0.22;
  return {
    brain,
    bestBrain: NeuralNetwork.copy(brain),
    x: startX, y: 0, z: 0, vz: 0, vx: 0, vy: 0, tx: startX, ty: 0,
    cooldown: 0, kickCooldown: 0, kickIntent: false,
    jumpCooldown: 0, jumpIntent: false,
    fitness: 0, bestFitness: -Infinity,
    generation: 0, team,
  };
}

function resetBall2(ball: Soccer2Ball, dir: number) {
  ball.x = 0; ball.y = 0; ball.z = SOCCER2.BALL_R;
  ball.vx = dir * 0.25; ball.vy = (Math.random() * 2 - 1) * 0.15; ball.vz = 0;
}

function resetPositions2(w: Soccer2World) {
  const o = w.orange, b = w.blue;
  o.x = -SOCCER2.LENGTH * 0.22; o.y = 0; o.z = 0; o.vz = 0; o.vx = 0; o.vy = 0;
  o.cooldown = 0; o.kickCooldown = 0; o.jumpCooldown = 0;
  b.x =  SOCCER2.LENGTH * 0.22; b.y = 0; b.z = 0; b.vz = 0; b.vx = 0; b.vy = 0;
  b.cooldown = 0; b.kickCooldown = 0; b.jumpCooldown = 0;
}

export function createWorld2(): Soccer2World {
  const ball: Soccer2Ball = { x: 0, y: 0, z: SOCCER2.BALL_R, vx: 0, vy: 0, vz: 0 };
  return {
    orange: makePlayer2('orange'),
    blue: makePlayer2('blue'),
    ball,
    scoreOrange: 0, scoreBlue: 0,
    tick: 0, generation: 1,
    lastKickStrength: 0, ballStuckTicks: 0,
    lastTouched: null,
    resetDelayTicks: 0,
    loser: null,
    pendingScorer: null,
  };
}

// ── Quyết định mạng nơ-ron ────────────────────────────────────────────────────

function decideStep2(p: Soccer2Player, opp: Soccer2Player, ball: Soccer2Ball) {
  const mirror = p.team === 'blue' ? -1 : 1;
  const halfL  = SOCCER2.LENGTH / 2;
  const halfW  = SOCCER2.WIDTH  / 2;

  // Khung thành đối phương luôn ở +halfL trong frame gương
  const goalX = halfL;  // x mục tiêu trong frame gương
  const goalY = 0;      // y mục tiêu (giữa khung thành)
  const gdx   = goalX - p.x * mirror;
  const gdy   = goalY - p.y;
  const gdist = Math.hypot(gdx, gdy) || 1;

  const inputs = [
    (p.x * mirror) / halfL,          // 0: X cầu thủ
    p.y / halfW,                      // 1: Y cầu thủ
    (ball.x * mirror) / halfL,       // 2: X bóng
    ball.y / halfW,                   // 3: Y bóng
    (ball.vx * mirror) / 4,          // 4: vX bóng
    ball.vy / 4,                      // 5: vY bóng
    ball.z / SOCCER2.GOAL_H,         // 6: độ cao bóng
    (opp.x * mirror) / halfL,        // 7: X đối thủ
    opp.y / halfW,                   // 8: Y đối thủ
    Math.max(-1, Math.min(1, ((ball.x - p.x) * mirror) / SOCCER2.STEP_RADIUS)), // 9: Δx đến bóng
    p.kickCooldown / SOCCER2.KICK_COOLDOWN, // 10: cooldown đá
    gdx / gdist,                     // 11: hướng X đến khung thành (unit)
    gdy / gdist,                     // 12: hướng Y đến khung thành (unit)
    gdist / halfL,                   // 13: khoảng cách đến khung thành (chuẩn hoá)
    p.z / SOCCER2.PLAYER_R,          // 14: chiều cao cầu thủ (0=sàn, 1=nhảy đỉnh)
    p.jumpCooldown / SOCCER2.JUMP_COOLDOWN, // 15: cooldown nhảy (0=sẵn sàng)
    ball.vz / 4,                     // 16: vận tốc đứng bóng (dự đoán bóng bổng)
  ];

  const out = NeuralNetwork.feedForward(p.brain, inputs);
  let dx = out[0] * mirror;
  let dy = out[1];
  p.kickIntent = out[2] > 0;
  p.jumpIntent = out[3] > 0.45;

  const tb = Math.hypot(ball.x - p.x, ball.y - p.y) || 1;
  dx = dx * 0.55 + ((ball.x - p.x) / tb) * 0.85;
  dy = dy * 0.55 + ((ball.y - p.y) / tb) * 0.85;

  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  const bx = halfL - SOCCER2.PLAYER_R;
  const by = halfW - SOCCER2.PLAYER_R;
  if ((p.x >= bx && dx > 0) || (p.x <= -bx && dx < 0)) dx = -dx;
  if ((p.y >= by && dy > 0) || (p.y <= -by && dy < 0)) dy = -dy;

  p.tx = Math.max(-bx, Math.min(bx, p.x + dx * SOCCER2.STEP_RADIUS));
  p.ty = Math.max(-by, Math.min(by, p.y + dy * SOCCER2.STEP_RADIUS));
  p.cooldown = SOCCER2.STEP_DELAY;
}

// ── Di chuyển cầu thủ ────────────────────────────────────────────────────────

function movePlayer2(p: Soccer2Player) {
  if (p.cooldown <= 0) return;
  const dx = p.tx - p.x, dy = p.ty - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0.5) {
    p.vx = (dx / dist) * SOCCER2.MAX_PLAYER_SPEED;
    p.vy = (dy / dist) * SOCCER2.MAX_PLAYER_SPEED;
    p.x += p.vx; p.y += p.vy;
  } else {
    p.vx = 0; p.vy = 0; p.cooldown = 0;
  }
  if (p.cooldown > 0) p.cooldown--;
}

// ── Nhảy + trọng lực cầu thủ ─────────────────────────────────────────────────

function updatePlayerZ(p: Soccer2Player, ball: Soccer2Ball) {
  if (p.z > 0 || p.vz > 0) {
    p.z  += p.vz;
    p.vz -= SOCCER2.GRAVITY;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
      // Bắt đầu cooldown TỪ KHI HẠ CÁNH (không phải từ khi nhảy)
      p.jumpCooldown = SOCCER2.JUMP_COOLDOWN;
    }
  }
  if (p.jumpCooldown > 0) p.jumpCooldown--;
  // Nhảy: chỉ khi đang đứng trên sàn và cooldown hết
  if (p.jumpIntent && p.z === 0 && p.vz === 0 && p.jumpCooldown === 0) {
    p.vz = SOCCER2.JUMP_FORCE;
    
    // Kiểm tra xem bóng có đang bổng và ở gần không
    const ballIsAerial = ball.z > SOCCER2.PLAYER_R + SOCCER2.BALL_R + 0.5;
    const distToBall = Math.hypot(ball.x - p.x, ball.y - p.y);
    const ballIsNear = distToBall < SOCCER2.PLAYER_R * 5; // phạm vi gần cầu thủ
    
    if (!ballIsAerial || !ballIsNear) {
      p.fitness -= 25.0; // Phạt nặng hơn rất nhiều (từ 1.5 -> 25.0) để AI không nhảy vô ích
    } else {
      p.fitness += 2.0; // Khuyến khích nhảy khi bóng bổng và ở gần
    }
  }
}

// ── Va chạm cứng giữa 2 cầu thủ ─────────────────────────────────────────────

function separatePlayers2(a: Soccer2Player, b: Soccer2Player) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minD = SOCCER2.PLAYER_R * 2;
  if (dist < minD && dist > 0.0001) {
    const push = (minD - dist) / 2;
    const nx = dx / dist, ny = dy / dist;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;

    const relVn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relVn < 0) {
      const imp = relVn * 0.6;
      a.vx += imp * nx; a.vy += imp * ny;
      b.vx -= imp * nx; b.vy -= imp * ny;
    }
  }
}

// ── Skill đá bổng (output[2] > 0, có cooldown) ───────────────────────────────

function kickSkill(p: Soccer2Player, ball: Soccer2Ball, w: Soccer2World) {
  if (!p.kickIntent || p.kickCooldown > 0) return;

  const dx = ball.x - p.x, dy = ball.y - p.y;
  const dist = Math.hypot(dx, dy);
  const minDist = SOCCER2.PLAYER_R + SOCCER2.BALL_R;

  if (dist > minDist + 1.5 || ball.z > SOCCER2.PLAYER_R + 2) return;

  const spd = Math.hypot(p.vx, p.vy);
  const fx = spd > 0.05 ? p.vx / spd : (p.team === 'orange' ? 1 : -1);
  const fy = spd > 0.05 ? p.vy / spd : 0;

  ball.vx = fx * SOCCER2.KICK_POWER + p.vx * 0.3;
  ball.vy = fy * SOCCER2.KICK_POWER + p.vy * 0.3;
  ball.vz = SOCCER2.KICK_LIFT;

  const nx = dist > 0.001 ? dx / dist : fx;
  const ny = dist > 0.001 ? dy / dist : fy;
  ball.x = p.x + nx * (minDist + 0.2);
  ball.y = p.y + ny * (minDist + 0.2);

  p.kickCooldown = SOCCER2.KICK_COOLDOWN;
  p.kickIntent   = false;
  p.fitness     += 1.0;
  w.lastKickStrength = SOCCER2.KICK_POWER;
  w.lastTouched = p.team;  // ghi nhận ai đá cuối
}

// ── Đẩy bóng khi chạm (bóng tự do, không ai giữ) ────────────────────────────

function pushBall(p: Soccer2Player, ball: Soccer2Ball, w: Soccer2World) {
  const dx = ball.x - p.x, dy = ball.y - p.y;
  const dist = Math.hypot(dx, dy);
  // Kiểm tra tiếp xúc 3D: khoảng cách ngang + độ cao
  const horizDist = Math.hypot(dx, dy);
  const pCenterZ  = p.z + SOCCER2.PLAYER_R; // tâm thật của cube theo chiều đứng
  const dz        = ball.z - pCenterZ;
  const dist3D    = Math.hypot(horizDist, dz);
  const minDist   = SOCCER2.PLAYER_R + SOCCER2.BALL_R;

  if (dist3D > minDist) return;

  const nx = horizDist > 0.0001 ? dx / horizDist : 1;
  const ny = horizDist > 0.0001 ? dy / horizDist : 0;

  const footSpeed = Math.hypot(p.vx, p.vy);
  const pushSpeed = footSpeed * SOCCER2.PUSH_FACTOR + 0.1;

  ball.vx = nx * pushSpeed + p.vx * 0.35;
  ball.vy = ny * pushSpeed + p.vy * 0.35;
  ball.vz = SOCCER2.PUSH_LIFT + p.vz * 0.5; // truyền cả vận tốc đứng khi đang nhảy

  // Đẩy bóng ra khỏi overlap (theo hướng ngang)
  ball.x = p.x + nx * (minDist + 0.1);
  ball.y = p.y + ny * (minDist + 0.1);

  p.fitness += 0.15;
  w.lastKickStrength = pushSpeed;
  w.lastTouched = p.team;  // ghi nhận ai đẩy cuối
}

// ── Vật lý bóng ──────────────────────────────────────────────────────────────

interface Segment {
  p1: { x: number; y: number; z: number };
  p2: { x: number; y: number; z: number };
}

function closestPointOnSegment(
  p: { x: number; y: number; z: number },
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 === 0) return { ...a };
  let t = (apx * abx + apy * aby + apz * abz) / ab2;
  t = Math.max(0, Math.min(1, t));
  return {
    x: a.x + t * abx,
    y: a.y + t * aby,
    z: a.z + t * abz,
  };
}

function getGoalSegments(sign: number): Segment[] {
  const halfL = SOCCER2.LENGTH / 2;
  const gw = SOCCER2.GOAL_W;
  const gh = SOCCER2.GOAL_H;
  const depth = 16;
  const x = sign * halfL;
  const backX = x + sign * depth;
  return [
    // 2 Front vertical posts
    { p1: { x, y: -gw / 2, z: 0 }, p2: { x, y: -gw / 2, z: gh } },
    { p1: { x, y:  gw / 2, z: 0 }, p2: { x, y:  gw / 2, z: gh } },
    // Top crossbar
    { p1: { x, y: -gw / 2, z: gh }, p2: { x, y:  gw / 2, z: gh } },
    // Bottom back bar
    { p1: { x: backX, y: -gw / 2, z: 0 }, p2: { x: backX, y:  gw / 2, z: 0 } },
    // 2 Bottom side bars
    { p1: { x, y: -gw / 2, z: 0 }, p2: { x: backX, y: -gw / 2, z: 0 } },
    { p1: { x, y:  gw / 2, z: 0 }, p2: { x: backX, y:  gw / 2, z: 0 } },
    // 2 Diagonal side bars
    { p1: { x, y: -gw / 2, z: gh }, p2: { x: backX, y: -gw / 2, z: 0 } },
    { p1: { x, y:  gw / 2, z: gh }, p2: { x: backX, y:  gw / 2, z: 0 } },
  ];
}

function collideBallWithSegments(ball: Soccer2Ball) {
  const R = 0.4; // post radius
  const minDist = SOCCER2.BALL_R + R;
  const segments = [...getGoalSegments(1), ...getGoalSegments(-1)];
  for (const seg of segments) {
    const cp = closestPointOnSegment(ball, seg.p1, seg.p2);
    const dx = ball.x - cp.x;
    const dy = ball.y - cp.y;
    const dz = ball.z - cp.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      // Đẩy bóng ra
      ball.x = cp.x + nx * minDist;
      ball.y = cp.y + ny * minDist;
      ball.z = cp.z + nz * minDist;
      // Phản xạ vận tốc
      const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz;
      if (vn < 0) {
        ball.vx -= 1.65 * vn * nx;
        ball.vy -= 1.65 * vn * ny;
        ball.vz -= 1.65 * vn * nz;
      }
    }
  }
}

function stepBall2(ball: Soccer2Ball): { goal: 'orange' | 'blue' | null } {
  const halfL = SOCCER2.LENGTH / 2, halfW = SOCCER2.WIDTH / 2;
  const depth = 16; // Chiều sâu gôn (khớp với Three.js)

  ball.x += ball.vx; ball.y += ball.vy; ball.z += ball.vz;
  ball.vz -= SOCCER2.GRAVITY;

  // Va chạm vật lý với khung sắt ống thành gôn
  collideBallWithSegments(ball);

  if (ball.z <= SOCCER2.BALL_R) {
    ball.z = SOCCER2.BALL_R;
    if (ball.vz < 0) {
      ball.vz = -ball.vz * SOCCER2.RESTITUTION_GROUND;
      if (ball.vz < 0.12) ball.vz = 0;
    }
    ball.vx *= SOCCER2.GROUND_FRICTION;
    ball.vy *= SOCCER2.GROUND_FRICTION;
  } else {
    ball.vx *= SOCCER2.AIR_FRICTION;
    ball.vy *= SOCCER2.AIR_FRICTION;
  }

  // Biên dọc sân
  if (ball.y >  halfW - SOCCER2.BALL_R) { ball.y =  halfW - SOCCER2.BALL_R; ball.vy = -Math.abs(ball.vy) * SOCCER2.RESTITUTION_WALL; }
  if (ball.y < -halfW + SOCCER2.BALL_R) { ball.y = -halfW + SOCCER2.BALL_R; ball.vy =  Math.abs(ball.vy) * SOCCER2.RESTITUTION_WALL; }

  // Kiểm tra gôn
  const inGoalY = Math.abs(ball.y) < SOCCER2.GOAL_W / 2;
  const inGoalZ = ball.z < SOCCER2.GOAL_H;

  if (ball.x > halfL) {
    // Bóng đã qua vạch gôn phải (Orange Goal)
    if (inGoalY && inGoalZ) {
      // Va chạm với lưới vát chéo của gôn phải (sau, trái, phải, trên)
      const z_ratio = Math.max(0, Math.min(1, ball.z / SOCCER2.GOAL_H));
      const limitX = halfL + depth * (1 - z_ratio) - SOCCER2.BALL_R;
      if (ball.x > limitX) {
        ball.x = limitX;
        ball.vx = -Math.abs(ball.vx) * 0.45; // Đập lưới dội lại nhẹ
      }
      if (ball.y > SOCCER2.GOAL_W / 2 - SOCCER2.BALL_R) {
        ball.y = SOCCER2.GOAL_W / 2 - SOCCER2.BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.45;
      }
      if (ball.y < -SOCCER2.GOAL_W / 2 + SOCCER2.BALL_R) {
        ball.y = -SOCCER2.GOAL_W / 2 + SOCCER2.BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.45;
      }
      if (ball.z > SOCCER2.GOAL_H - SOCCER2.BALL_R) {
        ball.z = SOCCER2.GOAL_H - SOCCER2.BALL_R;
        ball.vz = -Math.abs(ball.vz) * 0.45;
      }
      return { goal: 'orange' };
    } else {
      // Ngoài gôn, đập tường biên
      ball.x = halfL - SOCCER2.BALL_R;
      ball.vx = -Math.abs(ball.vx) * SOCCER2.RESTITUTION_WALL;
    }
  } else if (ball.x < -halfL) {
    // Bóng đã qua vạch gôn trái (Blue Goal)
    if (inGoalY && inGoalZ) {
      // Va chạm với lưới vát chéo của gôn trái (sau, trái, phải, trên)
      const z_ratio = Math.max(0, Math.min(1, ball.z / SOCCER2.GOAL_H));
      const limitX = -halfL - depth * (1 - z_ratio) + SOCCER2.BALL_R;
      if (ball.x < limitX) {
        ball.x = limitX;
        ball.vx = Math.abs(ball.vx) * 0.45;
      }
      if (ball.y > SOCCER2.GOAL_W / 2 - SOCCER2.BALL_R) {
        ball.y = SOCCER2.GOAL_W / 2 - SOCCER2.BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.45;
      }
      if (ball.y < -SOCCER2.GOAL_W / 2 + SOCCER2.BALL_R) {
        ball.y = -SOCCER2.GOAL_W / 2 + SOCCER2.BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.45;
      }
      if (ball.z > SOCCER2.GOAL_H - SOCCER2.BALL_R) {
        ball.z = SOCCER2.GOAL_H - SOCCER2.BALL_R;
        ball.vz = -Math.abs(ball.vz) * 0.45;
      }
      return { goal: 'blue' };
    } else {
      // Ngoài gôn
      ball.x = -halfL + SOCCER2.BALL_R;
      ball.vx = Math.abs(ball.vx) * SOCCER2.RESTITUTION_WALL;
    }
  } else {
    // Bóng trong sân, kiểm tra va chạm với tường biên ngang ngoài gôn
    if (ball.x > halfL - SOCCER2.BALL_R && (!inGoalY || !inGoalZ)) {
      ball.x = halfL - SOCCER2.BALL_R;
      ball.vx = -Math.abs(ball.vx) * SOCCER2.RESTITUTION_WALL;
    } else if (ball.x < -halfL + SOCCER2.BALL_R && (!inGoalY || !inGoalZ)) {
      ball.x = -halfL + SOCCER2.BALL_R;
      ball.vx = Math.abs(ball.vx) * SOCCER2.RESTITUTION_WALL;
    }
  }

  return { goal: null };
}

// ── Tiến hoá ──────────────────────────────────────────────────────────────────

function evolvePlayer2(p: Soccer2Player, mutationRate: number) {
  if (p.fitness >= p.bestFitness) {
    p.bestFitness = p.fitness;
    p.bestBrain = NeuralNetwork.copy(p.brain);
  }
  p.brain = NeuralNetwork.mutate(NeuralNetwork.copy(p.bestBrain), mutationRate);
  p.fitness = 0;
  p.generation++;
}

function performReset2(w: Soccer2World, mutationRate: number) {
  const o = w.orange, b = w.blue;
  const scorer = w.pendingScorer;
  
  if (scorer === 'orange') {
    const spBonus = (SOCCER2.MATCH_TICKS - w.tick) / SOCCER2.MATCH_TICKS * 80;
    const ownGoal = w.lastTouched === 'blue';
    o.fitness += 200 + spBonus;
    b.fitness -= 80;
    if (ownGoal) b.fitness -= 120;
    resetBall2(w.ball, 1);
  } else if (scorer === 'blue') {
    const spBonus = (SOCCER2.MATCH_TICKS - w.tick) / SOCCER2.MATCH_TICKS * 80;
    const ownGoal = w.lastTouched === 'orange';
    b.fitness += 200 + spBonus;
    o.fitness -= 80;
    if (ownGoal) o.fitness -= 120;
    resetBall2(w.ball, -1);
  }
  
  evolvePlayer2(o, mutationRate);
  evolvePlayer2(b, mutationRate);
  
  w.tick = 0;
  w.generation++;
  w.lastTouched = null;
  w.loser = null;
  w.pendingScorer = null;
  w.resetDelayTicks = 0;
  resetPositions2(w);
}

// ── Vòng cập nhật chính ───────────────────────────────────────────────────────

export interface Soccer2StepResult {
  goal: 'orange' | 'blue' | null;
  matchEnded: boolean;
}

export function stepWorld2(w: Soccer2World, mutationRate: number, speed: number = 1): Soccer2StepResult {
  if (w.resetDelayTicks && w.resetDelayTicks > 0) {
    w.resetDelayTicks--;
    if (w.resetDelayTicks === 0) {
      performReset2(w, mutationRate);
    }
    stepBall2(w.ball);
    return { goal: null, matchEnded: false };
  }

  const { orange, blue, ball } = w;

  // 1) Quyết định
  if (orange.cooldown <= 0) decideStep2(orange, blue, ball);
  if (blue.cooldown   <= 0) decideStep2(blue, orange, ball);

  // 2) Di chuyển + nhảy
  movePlayer2(orange);
  movePlayer2(blue);
  updatePlayerZ(orange, ball);
  updatePlayerZ(blue,   ball);

  separatePlayers2(orange, blue);

  // 3) Cooldown đá
  if (orange.kickCooldown > 0) orange.kickCooldown--;
  if (blue.kickCooldown   > 0) blue.kickCooldown--;

  // 4) Skill đá (ưu tiên trước push thường)
  kickSkill(orange, ball, w);
  kickSkill(blue,   ball, w);

  // 5) Đẩy bóng khi chạm (bóng tự do)
  pushBall(orange, ball, w);
  pushBall(blue,   ball, w);

  // 6) Vật lý bóng
  const before = ball.x;
  const { goal } = stepBall2(ball);

  // 6b) Chống kẹt bóng
  const ballSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const kickRange = SOCCER2.PLAYER_R + SOCCER2.BALL_R + 1;
  const nearBall  = Math.hypot(ball.x - orange.x, ball.y - orange.y) < kickRange
                 || Math.hypot(ball.x - blue.x,   ball.y - blue.y)   < kickRange;
  if (ballSpeed < 0.08 && nearBall) {
    w.ballStuckTicks++;
    if (w.ballStuckTicks > 20) {
      ball.vx += (Math.random() - 0.5) * 1.0;
      ball.vy += (Math.random() - 0.5) * 1.0;
      ball.vz  = 0.3;
      w.ballStuckTicks = 0;
    }
  } else { w.ballStuckTicks = 0; }

  // 7) Reward shaping — per-tick nhỏ để ghi bàn chiếm ưu thế
  const ballProgress = ball.x - before;
  orange.fitness += ballProgress * 0.06;   // giảm từ 0.5 → 0.06
  blue.fitness   -= ballProgress * 0.06;
  const dO = Math.hypot(ball.x - orange.x, ball.y - orange.y);
  const dB = Math.hypot(ball.x - blue.x,   ball.y - blue.y);
  orange.fitness += Math.max(0, 1 - dO / (SOCCER2.LENGTH / 2)) * 0.01; // giảm từ 0.2 → 0.01
  blue.fitness   += Math.max(0, 1 - dB / (SOCCER2.LENGTH / 2)) * 0.01;

  // 8) Bàn thắng + tiến hoá
  let scored: 'orange' | 'blue' | null = null;
  let matchEnded = false;

  if (goal === 'orange') {
    w.scoreOrange++;
    w.loser = 'blue';
    w.pendingScorer = 'orange';
    w.resetDelayTicks = speed >= 50 ? 1 : 60 * speed; // 1s delay đồng bộ theo frame hình thực tế
    scored = 'orange'; matchEnded = true;
  } else if (goal === 'blue') {
    w.scoreBlue++;
    w.loser = 'orange';
    w.pendingScorer = 'blue';
    w.resetDelayTicks = speed >= 50 ? 1 : 60 * speed; // 1s delay đồng bộ theo frame hình thực tế
    scored = 'blue'; matchEnded = true;
  }

  if (!matchEnded) {
    w.tick++;
    if (w.tick >= SOCCER2.MATCH_TICKS) {
      orange.fitness -= 30; blue.fitness -= 30;
      evolvePlayer2(orange, mutationRate); evolvePlayer2(blue, mutationRate);
      w.tick = 0; w.generation++;
      resetBall2(ball, 1); resetPositions2(w);
      matchEnded = true;
    }
  }

  return { goal: scored, matchEnded };
}

export function resetWorld2(w: Soccer2World) {
  w.orange = makePlayer2('orange');
  w.blue   = makePlayer2('blue');
  resetBall2(w.ball, 1);
  w.scoreOrange = 0; w.scoreBlue = 0;
  w.tick = 0; w.generation = 1; w.lastKickStrength = 0; w.ballStuckTicks = 0; w.lastTouched = null;
  w.resetDelayTicks = 0; w.loser = null; w.pendingScorer = null;
}

export function secondsLeft2(w: Soccer2World): number {
  return Math.ceil((SOCCER2.MATCH_TICKS - w.tick) / 60);
}
