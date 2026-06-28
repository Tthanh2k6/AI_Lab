// src/utils/racingPhysics.ts
var NeuralNetwork = class _NeuralNetwork {
  static create(neuronCounts) {
    const layers = [];
    for (let i = 0; i < neuronCounts.length - 1; i++) {
      const inputs = neuronCounts[i];
      const outputs = neuronCounts[i + 1];
      const weights = [];
      const biases = [];
      for (let o = 0; o < outputs; o++) {
        const row = [];
        for (let j = 0; j < inputs; j++) {
          row.push(Math.random() * 2 - 1);
        }
        weights.push(row);
        biases.push(Math.random() * 2 - 1);
      }
      layers.push({ inputs, outputs, weights, biases });
    }
    return { layers };
  }
  static copy(network) {
    return {
      layers: network.layers.map((layer) => ({
        inputs: layer.inputs,
        outputs: layer.outputs,
        weights: layer.weights.map((row) => [...row]),
        biases: [...layer.biases]
      }))
    };
  }
  static feedForward(network, inputs) {
    let currentInputs = [...inputs];
    for (const layer of network.layers) {
      const nextInputs = [];
      for (let o = 0; o < layer.outputs; o++) {
        let sum = layer.biases[o];
        for (let i = 0; i < layer.inputs; i++) {
          sum += currentInputs[i] * layer.weights[o][i];
        }
        nextInputs.push(Math.tanh(sum));
      }
      currentInputs = nextInputs;
    }
    return currentInputs;
  }
  static mutate(network, rate) {
    const mutated = _NeuralNetwork.copy(network);
    for (const layer of mutated.layers) {
      for (let o = 0; o < layer.outputs; o++) {
        for (let i = 0; i < layer.inputs; i++) {
          if (Math.random() < rate) {
            layer.weights[o][i] += (Math.random() * 2 - 1) * 0.3;
            if (layer.weights[o][i] > 1) layer.weights[o][i] = 1;
            if (layer.weights[o][i] < -1) layer.weights[o][i] = -1;
          }
        }
        if (Math.random() < rate) {
          layer.biases[o] += (Math.random() * 2 - 1) * 0.3;
          if (layer.biases[o] > 1) layer.biases[o] = 1;
          if (layer.biases[o] < -1) layer.biases[o] = -1;
        }
      }
    }
    return mutated;
  }
  static crossover(netA, netB) {
    const child = _NeuralNetwork.copy(netA);
    for (let l = 0; l < child.layers.length; l++) {
      const layer = child.layers[l];
      const parentB = netB.layers[l];
      for (let o = 0; o < layer.outputs; o++) {
        for (let i = 0; i < layer.inputs; i++) {
          if (Math.random() < 0.5) {
            layer.weights[o][i] = parentB.weights[o][i];
          }
        }
        if (Math.random() < 0.5) {
          layer.biases[o] = parentB.biases[o];
        }
      }
    }
    return child;
  }
};

// src/utils/tagGame.ts
var TAG = {
  LENGTH: 200,
  WIDTH: 130,
  WALL_H: 28,
  PLAYER_R: 3.5,
  PLAYER_H: 8,
  MAX_SPEED: 1,
  // dùng để CHUẨN HOÁ observation
  CHASER_SPEED: 0.84,
  // KAI (đuổi) chậm hơn một chút
  EVADER_SPEED: 0.99,
  // tốc độ CƠ SỞ của ALBERT (trận hiển thị tự điều chỉnh quanh mức này)
  FRICTION: 0.86,
  JUMP_FORCE: 1.8,
  GRAVITY: 0.055,
  JUMP_COOLDOWN: 120,
  CUBE_SIZE: 14,
  // hộp cản TO — dùng làm chướng ngại/chiến thuật
  NUM_CUBES: 5,
  CUBE_FRICTION: 0.93,
  // trượt lâu hơn → người chạy đẩy/kéo đi dễ hơn
  CUBE_RESTITUTION: 0.35,
  CUBE_MASS: 1.25,
  // nhẹ hơn (trước 2.5) → dễ bị đẩy/kéo
  TAG_DIST: 6,
  // phải đứng RẤT sát mới bắt được (mặt phẳng X,Y)
  TAG_Z: 6,
  // VÀ chênh lệch độ cao phải nhỏ — đang nhảy cao thì THOÁT
  TAG_COOLDOWN: 80,
  GRAB_DIST: 16,
  // tầm với để CHỦ ĐỘNG nắm/kéo hộp
  NUM_RAYS: 8,
  RAY_LENGTH: 90,
  MATCH_TICKS: 25 * 60,
  // 25s / ván hiển thị
  MAX_TAGS: 1,
  // BẮT 1 LẦN là kết thúc trận ngay
  MUTATION_RATE_DEFAULT: 0.12,
  // ── Tham số tiến hoá quần thể ──
  POP: 26,
  // số cá thể mỗi vai
  ELITE: 4,
  // số tinh hoa giữ nguyên
  EVAL_TICKS: 480
  // 8s/ván đánh giá headless (ngắn hơn → nhẹ hơn)
};
var NET_IN = 23;
var NET_SHAPE = [NET_IN, 24, 16, 4];
var CUBE_COLORS = [15158332, 3447003, 15965202, 3066993, 10181046];
function makeCubes() {
  const positions = [
    { x: 0, y: 0 },
    { x: -50, y: -25 },
    { x: 50, y: -25 },
    { x: -50, y: 25 },
    { x: 50, y: 25 }
  ];
  return positions.map((p, i) => ({
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    size: TAG.CUBE_SIZE,
    colorHex: CUBE_COLORS[i]
  }));
}
function spawnPos(role, initial = false) {
  const hl = TAG.LENGTH / 2 - 20;
  const hw = TAG.WIDTH / 2 - 20;
  if (initial) {
    return role === "chaser" ? { x: -hl * 0.65, y: 0 } : { x: hl * 0.65, y: 0 };
  }
  return {
    x: (role === "chaser" ? -1 : 1) * (hl * 0.3 + Math.random() * hl * 0.4),
    y: (Math.random() - 0.5) * hw * 1.2
  };
}
function makePlayer(role, brain, randomize) {
  const { x, y } = spawnPos(role, !randomize);
  return {
    role,
    brain,
    bestBrain: brain,
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    fitness: 0,
    bestFitness: 0,
    generation: 0,
    tagCount: 0,
    tagCooldown: 0,
    jumpCooldown: 0,
    isGrounded: true,
    jumpIntent: false,
    grabbedCube: -1,
    grabOffX: 0,
    grabOffY: 0,
    maxSpeed: role === "chaser" ? TAG.CHASER_SPEED : TAG.EVADER_SPEED
  };
}
function newMatch(chaserBrain, evaderBrain, randomize) {
  const chaser = makePlayer("chaser", chaserBrain, randomize);
  const evader = makePlayer("evader", evaderBrain, randomize);
  const dx = chaser.x - evader.x, dy = chaser.y - evader.y;
  return {
    chaser,
    evader,
    cubes: makeCubes(),
    tick: 0,
    matchTagCount: 0,
    tagFlashTicks: 0,
    tagFlashX: 0,
    tagFlashY: 0,
    lastTagTick: 0,
    avgDist: 100,
    prevDist: Math.sqrt(dx * dx + dy * dy),
    done: false,
    winner: null
  };
}
function nextGen(pop, mutationRate) {
  pop.sort((a, b) => b.fit - a.fit);
  const next = [];
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
function makePop() {
  const pop = [];
  for (let i = 0; i < TAG.POP; i++) pop.push({ brain: NeuralNetwork.create(NET_SHAPE), fit: 0 });
  return pop;
}
function createTagWorld() {
  const chaserPop = makePop();
  const evaderPop = makePop();
  const bestChaserBrain = NeuralNetwork.copy(chaserPop[0].brain);
  const bestEvaderBrain = NeuralNetwork.copy(evaderPop[0].brain);
  const disp = newMatch(bestChaserBrain, bestEvaderBrain, false);
  const w2 = {
    chaser: disp.chaser,
    evader: disp.evader,
    cubes: disp.cubes,
    tick: 0,
    matchTagCount: 0,
    tagFlashTicks: 0,
    tagFlashX: 0,
    tagFlashY: 0,
    resetDelayTicks: 0,
    avgChaserDist: 100,
    lastTagTick: 0,
    generation: 0,
    chaserWins: 0,
    evaderWins: 0,
    disp,
    chaserPop,
    evaderPop,
    evalIdx: 0,
    bestChaserBrain,
    bestEvaderBrain,
    bestChaserFit: 0,
    bestEvaderFit: 0,
    balanceAdj: 1,
    chaserWinEMA: 0.5
  };
  return w2;
}
function castRay(ox, oy, angle, cubes, opp, oppR) {
  const maxD = TAG.RAY_LENGTH;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const eps = 1e-5;
  const hl = TAG.LENGTH / 2;
  const hw = TAG.WIDTH / 2;
  let wallD = maxD;
  if (dx > eps) wallD = Math.min(wallD, (hl - ox) / dx);
  if (dx < -eps) wallD = Math.min(wallD, (-hl - ox) / dx);
  if (dy > eps) wallD = Math.min(wallD, (hw - oy) / dy);
  if (dy < -eps) wallD = Math.min(wallD, (-hw - oy) / dy);
  let hitD = Math.max(0, wallD);
  let hitType = 0;
  for (const cube of cubes) {
    const hs = cube.size / 2;
    const tx1 = (cube.x - hs - ox) / (Math.abs(dx) > eps ? dx : eps);
    const tx2 = (cube.x + hs - ox) / (Math.abs(dx) > eps ? dx : eps);
    const ty1 = (cube.y - hs - oy) / (Math.abs(dy) > eps ? dy : eps);
    const ty2 = (cube.y + hs - oy) / (Math.abs(dy) > eps ? dy : eps);
    const tNear = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const tFar = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
    if (tFar > 0 && tNear < tFar && tNear < hitD) {
      hitD = Math.max(0, tNear);
      hitType = 1;
    }
  }
  const ex = opp.x - ox, ey = opp.y - oy;
  const t = ex * dx + ey * dy;
  if (t > 0 && t < hitD) {
    const perpSq = ex * ex + ey * ey - t * t;
    if (perpSq < oppR * oppR * 2.25) {
      hitD = Math.max(0, t - oppR);
      hitType = 2;
    }
  }
  return { dist: hitD / maxD, type: hitType };
}
function buildInputs(self, opp, cubes) {
  const dx = opp.x - self.x, dy = opp.y - self.y;
  const hl = TAG.LENGTH / 2, hw = TAG.WIDTH / 2;
  const inputs = [];
  const facing = Math.atan2(dy, dx);
  for (let i = 0; i < TAG.NUM_RAYS; i++) {
    const angle = facing + i / TAG.NUM_RAYS * Math.PI * 2;
    inputs.push(castRay(self.x, self.y, angle, cubes, opp, TAG.PLAYER_R).dist);
  }
  const dist = Math.sqrt(dx * dx + dy * dy) + 1e-3;
  inputs.push(Math.min(dist / 150, 1));
  inputs.push(dx / dist);
  inputs.push(dy / dist);
  inputs.push(self.vx / TAG.MAX_SPEED);
  inputs.push(self.vy / TAG.MAX_SPEED);
  inputs.push(self.vz / 2);
  inputs.push(Math.min(self.z / 15, 1));
  inputs.push(self.tagCooldown / TAG.TAG_COOLDOWN);
  inputs.push(self.x / hl);
  inputs.push(self.y / hw);
  inputs.push(opp.vz / 2);
  const nc = nearestCubeIdx(self, cubes, -1);
  const ncd = nc.idx >= 0 ? nc.dist + 1e-3 : 1;
  inputs.push(nc.idx >= 0 ? nc.dx / ncd : 0);
  inputs.push(nc.idx >= 0 ? nc.dy / ncd : 0);
  inputs.push(Math.min((nc.idx >= 0 ? nc.dist : 200) / 100, 1));
  inputs.push(self.grabbedCube >= 0 ? 1 : 0);
  return inputs;
}
function nearestCubeIdx(p, cubes, exclude) {
  let idx = -1, bd = Infinity, bdx = 0, bdy = 0;
  for (let i = 0; i < cubes.length; i++) {
    if (i === exclude) continue;
    const dx = cubes[i].x - p.x, dy = cubes[i].y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bd) {
      bd = d;
      idx = i;
      bdx = dx;
      bdy = dy;
    }
  }
  return { idx, dist: bd, dx: bdx, dy: bdy };
}
function updateGrab(p, opp, cubes, grab) {
  if (!grab) {
    p.grabbedCube = -1;
    return;
  }
  if (p.grabbedCube < 0) {
    const n = nearestCubeIdx(p, cubes, opp.grabbedCube);
    if (n.idx >= 0 && n.dist < TAG.GRAB_DIST) {
      p.grabbedCube = n.idx;
      const hold = TAG.PLAYER_R + cubes[n.idx].size / 2 + 1.5;
      const ol = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 1;
      p.grabOffX = n.dx / ol * hold;
      p.grabOffY = n.dy / ol * hold;
    }
  }
}
function carryHeldCube(p, cubes) {
  if (p.grabbedCube < 0) return;
  const cube = cubes[p.grabbedCube];
  if (!cube) {
    p.grabbedCube = -1;
    return;
  }
  const tx = p.x + p.grabOffX, ty = p.y + p.grabOffY;
  cube.x += (tx - cube.x) * 0.6;
  cube.y += (ty - cube.y) * 0.6;
  cube.vx = p.vx;
  cube.vy = p.vy;
  const hl = TAG.LENGTH / 2 - cube.size / 2;
  const hw = TAG.WIDTH / 2 - cube.size / 2;
  if (cube.x < -hl) cube.x = -hl;
  else if (cube.x > hl) cube.x = hl;
  if (cube.y < -hw) cube.y = -hw;
  else if (cube.y > hw) cube.y = hw;
}
function applyPlayerMove(p, mx, my, jump) {
  const maxSpd = p.maxSpeed;
  const accel = maxSpd * (1 - TAG.FRICTION) * 1.6;
  p.vx = p.vx * TAG.FRICTION + mx * accel;
  p.vy = p.vy * TAG.FRICTION + my * accel;
  const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (spd > maxSpd) {
    p.vx = p.vx / spd * maxSpd;
    p.vy = p.vy / spd * maxSpd;
  }
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
  p.vz -= TAG.GRAVITY;
  p.z += p.vz;
  if (p.z <= 0) {
    p.z = 0;
    p.vz = 0;
    p.isGrounded = true;
  }
  p.x += p.vx;
  p.y += p.vy;
}
function clampToRoom(p) {
  const hl = TAG.LENGTH / 2 - TAG.PLAYER_R;
  const hw = TAG.WIDTH / 2 - TAG.PLAYER_R;
  if (p.x < -hl) {
    p.x = -hl;
    p.vx *= -0.4;
  }
  if (p.x > hl) {
    p.x = hl;
    p.vx *= -0.4;
  }
  if (p.y < -hw) {
    p.y = -hw;
    p.vy *= -0.4;
  }
  if (p.y > hw) {
    p.y = hw;
    p.vy *= -0.4;
  }
}
function pushCube(p, cube) {
  const hs = cube.size / 2 + TAG.PLAYER_R;
  const dx = p.x - cube.x, dy = p.y - cube.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > hs * 1.5 || dist < 1e-3) return;
  const pen = hs - dist;
  if (pen > 0) {
    const nx = dx / dist, ny = dy / dist;
    const invMass = 1 / (1 + TAG.CUBE_MASS);
    cube.x -= nx * pen * (1 - invMass);
    cube.y -= ny * pen * (1 - invMass);
    p.x += nx * pen * invMass;
    p.y += ny * pen * invMass;
    const impulse = (p.vx * nx + p.vy * ny) * (1 + TAG.CUBE_RESTITUTION) * (1 - invMass);
    cube.vx += nx * impulse;
    cube.vy += ny * impulse;
    p.vx -= nx * impulse * 0.35;
    p.vy -= ny * impulse * 0.35;
  }
}
function stepCube(cube) {
  cube.vx *= TAG.CUBE_FRICTION;
  cube.vy *= TAG.CUBE_FRICTION;
  cube.x += cube.vx;
  cube.y += cube.vy;
  const hl = TAG.LENGTH / 2 - cube.size / 2;
  const hw = TAG.WIDTH / 2 - cube.size / 2;
  if (cube.x < -hl) {
    cube.x = -hl;
    cube.vx *= -0.5;
  }
  if (cube.x > hl) {
    cube.x = hl;
    cube.vx *= -0.5;
  }
  if (cube.y < -hw) {
    cube.y = -hw;
    cube.vy *= -0.5;
  }
  if (cube.y > hw) {
    cube.y = hw;
    cube.vy *= -0.5;
  }
}
function cubeCubeCollision(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy) + 1e-3;
  const minD = (a.size + b.size) / 2;
  if (dist < minD) {
    const pen = minD - dist, nx = dx / dist, ny = dy / dist;
    a.x += nx * pen * 0.5;
    a.y += ny * pen * 0.5;
    b.x -= nx * pen * 0.5;
    b.y -= ny * pen * 0.5;
    const relVx = a.vx - b.vx, relVy = a.vy - b.vy;
    const j = (relVx * nx + relVy * ny) * (1 + TAG.CUBE_RESTITUTION) * 0.5;
    if (j > 0) {
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
    }
  }
}
function aiStep(self, opp, cubes) {
  if (self.tagCooldown > 0) self.tagCooldown--;
  let mx, my, jump = false, grab = false;
  if (self.heuristic) {
    const sgn = self.heuristic === "chase" ? 1 : -1;
    let ddx = (opp.x - self.x) * sgn, ddy = (opp.y - self.y) * sgn;
    const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    ddx /= d;
    ddy /= d;
    if (self.heuristic === "flee") {
      const hl = TAG.LENGTH / 2, hw = TAG.WIDTH / 2;
      if (Math.abs(self.x) > hl - 15) ddx += -Math.sign(self.x) * 1;
      if (Math.abs(self.y) > hw - 15) ddy += -Math.sign(self.y) * 1;
      const l = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      ddx /= l;
      ddy /= l;
    }
    mx = ddx;
    my = ddy;
  } else {
    const raw = NeuralNetwork.feedForward(self.brain, buildInputs(self, opp, cubes));
    mx = Math.tanh(isNaN(raw[0]) ? 0 : raw[0]);
    my = Math.tanh(isNaN(raw[1]) ? 0 : raw[1]);
    jump = (isNaN(raw[2]) ? 0 : raw[2]) > 0.75;
    grab = (isNaN(raw[3]) ? 0 : raw[3]) > 0.5;
  }
  applyPlayerMove(self, mx, my, jump);
  updateGrab(self, opp, cubes, grab);
}
function tickMatch(m) {
  const { chaser, evader, cubes } = m;
  aiStep(chaser, evader, cubes);
  aiStep(evader, chaser, cubes);
  if (isNaN(chaser.x) || isNaN(chaser.y)) {
    const p = spawnPos("chaser", false);
    chaser.x = p.x;
    chaser.y = p.y;
    chaser.z = 0;
    chaser.vx = chaser.vy = chaser.vz = 0;
  }
  if (isNaN(evader.x) || isNaN(evader.y)) {
    const p = spawnPos("evader", false);
    evader.x = p.x;
    evader.y = p.y;
    evader.z = 0;
    evader.vx = evader.vy = evader.vz = 0;
  }
  clampToRoom(chaser);
  clampToRoom(evader);
  const isHeld = (i) => i === chaser.grabbedCube || i === evader.grabbedCube;
  for (let i = 0; i < cubes.length; i++) if (!isHeld(i)) stepCube(cubes[i]);
  for (let i = 0; i < cubes.length; i++) for (let j = i + 1; j < cubes.length; j++) cubeCubeCollision(cubes[i], cubes[j]);
  for (let i = 0; i < cubes.length; i++) {
    if (isHeld(i)) continue;
    pushCube(chaser, cubes[i]);
    pushCube(evader, cubes[i]);
  }
  carryHeldCube(chaser, cubes);
  carryHeldCube(evader, cubes);
  const dx = chaser.x - evader.x, dy = chaser.y - evader.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  m.avgDist = m.avgDist * 0.998 + dist * 2e-3;
  const delta = m.prevDist - dist;
  m.prevDist = dist;
  const chaserSpeed = Math.sqrt(chaser.vx * chaser.vx + chaser.vy * chaser.vy);
  const evaderSpeed = Math.sqrt(evader.vx * evader.vx + evader.vy * evader.vy);
  chaser.fitness += delta * 6;
  chaser.fitness += Math.max(0, 1 - dist / 90) * 1.5;
  chaser.fitness += Math.min(chaserSpeed / TAG.MAX_SPEED, 1) * 0.15;
  evader.fitness += -delta * 4;
  evader.fitness += Math.min(dist / 60, 2) * 0.5 + 0.05;
  evader.fitness += Math.min(evaderSpeed / TAG.MAX_SPEED, 1) * 0.15;
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
    evader.vx += -dx * pushN * 2.5;
    evader.vy += -dy * pushN * 2.5;
    if (m.matchTagCount >= TAG.MAX_TAGS) {
      m.done = true;
      m.winner = "chaser";
      return;
    }
  }
  if (m.tagFlashTicks > 0) m.tagFlashTicks--;
  m.tick++;
  if (m.tick >= TAG.MATCH_TICKS) {
    m.done = true;
    m.winner = "evader";
    evader.fitness += 120;
  }
}
function runEval(chaserBrain, evaderBrain, chaserHeur, evaderHeur) {
  const m = newMatch(chaserBrain, evaderBrain, true);
  if (chaserHeur) m.chaser.heuristic = chaserHeur;
  if (evaderHeur) m.evader.heuristic = evaderHeur;
  for (let t = 0; t < TAG.EVAL_TICKS && !m.done; t++) tickMatch(m);
  return m;
}
function trainOneIndividual(w2, mutationRate) {
  const i = w2.evalIdx;
  const cBrain = w2.chaserPop[i].brain;
  const eBrain = w2.evaderPop[i].brain;
  const cVsBest = runEval(cBrain, w2.bestEvaderBrain, null, null).chaser.fitness;
  const cVsBot = runEval(cBrain, w2.bestEvaderBrain, null, "flee").chaser.fitness;
  w2.chaserPop[i].fit = (cVsBest + cVsBot) / 2;
  const eVsBest = runEval(w2.bestChaserBrain, eBrain, null, null).evader.fitness;
  const eVsBot = runEval(w2.bestChaserBrain, eBrain, "chase", null).evader.fitness;
  w2.evaderPop[i].fit = (eVsBest + eVsBot) / 2;
  w2.evalIdx++;
  if (w2.evalIdx >= TAG.POP) {
    w2.chaserPop.sort((a, b) => b.fit - a.fit);
    w2.evaderPop.sort((a, b) => b.fit - a.fit);
    w2.bestChaserBrain = NeuralNetwork.copy(w2.chaserPop[0].brain);
    w2.bestEvaderBrain = NeuralNetwork.copy(w2.evaderPop[0].brain);
    w2.bestChaserFit = Math.round(w2.chaserPop[0].fit);
    w2.bestEvaderFit = Math.round(w2.evaderPop[0].fit);
    w2.chaserPop = nextGen(w2.chaserPop, mutationRate);
    w2.evaderPop = nextGen(w2.evaderPop, mutationRate);
    w2.evalIdx = 0;
    w2.generation++;
    w2.disp.chaser.brain = w2.bestChaserBrain;
    w2.disp.evader.brain = w2.bestEvaderBrain;
  }
}
function mirror(w2) {
  const d = w2.disp;
  w2.chaser = d.chaser;
  w2.evader = d.evader;
  w2.cubes = d.cubes;
  w2.tick = d.tick;
  w2.matchTagCount = d.matchTagCount;
  w2.tagFlashTicks = d.tagFlashTicks;
  w2.tagFlashX = d.tagFlashX;
  w2.tagFlashY = d.tagFlashY;
  w2.avgChaserDist = d.avgDist;
  w2.lastTagTick = d.lastTagTick;
  w2.chaser.bestFitness = w2.bestChaserFit;
  w2.evader.bestFitness = w2.bestEvaderFit;
  w2.chaser.generation = w2.generation;
  w2.evader.generation = w2.generation;
}
function stepTagWorld(w2, mutationRate, speed = 1) {
  const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  const budgetMs = Math.min(6, Math.max(1.5, 1 + speed * 0.12));
  const t0 = now();
  let did = 0;
  do {
    trainOneIndividual(w2, mutationRate);
    did++;
  } while (did < 40 && now() - t0 < budgetMs);
  if (w2.resetDelayTicks > 0) {
    w2.resetDelayTicks--;
    if (w2.disp.tagFlashTicks > 0) w2.disp.tagFlashTicks--;
    if (w2.resetDelayTicks === 0) {
      w2.disp = newMatch(w2.bestChaserBrain, w2.bestEvaderBrain, true);
      w2.disp.evader.maxSpeed = TAG.EVADER_SPEED * w2.balanceAdj;
    }
    mirror(w2);
    return;
  }
  for (let s = 0; s < speed; s++) {
    tickMatch(w2.disp);
    if (w2.disp.done) {
      const chaserWon = w2.disp.winner === "chaser";
      if (chaserWon) w2.chaserWins++;
      else w2.evaderWins++;
      w2.chaserWinEMA = w2.chaserWinEMA * 0.9 + (chaserWon ? 1 : 0) * 0.1;
      w2.balanceAdj += (w2.chaserWinEMA - 0.5) * 0.045;
      if (w2.balanceAdj < 0.78) w2.balanceAdj = 0.78;
      if (w2.balanceAdj > 1.7) w2.balanceAdj = 1.7;
      w2.resetDelayTicks = chaserWon ? 80 : 50;
      break;
    }
  }
  mirror(w2);
}

// _g.ts
var w = createTagWorld();
var g = 0;
while (w.generation < 50 && g < 50 * TAG.POP * 10) {
  stepTagWorld(w, 0.12, 4);
  g++;
}
var base = w.chaserWins + w.evaderWins;
var frames = 0;
var warm = false;
var c0 = 0;
var e0 = 0;
while (w.chaserWins + w.evaderWins - base < 70 && frames < 5e4) {
  stepTagWorld(w, 0.12, 50);
  frames++;
  if (!warm && w.chaserWins + w.evaderWins - base >= 30) {
    warm = true;
    c0 = w.chaserWins;
    e0 = w.evaderWins;
  }
}
var c = w.chaserWins - c0;
var e = w.evaderWins - e0;
console.log(`balanceAdj=${w.balanceAdj.toFixed(3)} EMA=${w.chaserWinEMA.toFixed(2)} | 40 v\xE1n sau warmup: KAI ${c}-${e} ALBERT = ${Math.round(c / (c + e || 1) * 100)}%`);
