import { FootballConfig, SimulationState, FootballPlayer, Ball, CurriculumStep, Obstacle, SlipperyZone, PersonalityGene } from '../types/football';
import { createNeuralNetwork, feedForward, crossover, mutate, STEP1_INPUTS, STEP1_HIDDEN, STEP1_OUTPUTS, S2_ATK_INPUTS, S2_ATK_HIDDEN, S2_ATK_OUTPUTS, S2_DEF_INPUTS, S2_DEF_HIDDEN, S2_DEF_OUTPUTS, S3_ATK_INPUTS, S3_ATK_HIDDEN, S3_ATK_OUTPUTS, S3_DEF_INPUTS, S3_DEF_HIDDEN, S3_DEF_OUTPUTS, ATK_INPUTS, ATK_HIDDEN, ATK_OUTPUTS, DEF_INPUTS, DEF_HIDDEN, DEF_OUTPUTS, NeuralNetwork } from '../utils/neuralNetwork';

let config: FootballConfig | null = null;
let state: SimulationState | null = null;
let intervalId: number | null = null;
let population: FootballPlayer[] = [];
let simulationSpeed = 1;
let isBackgroundMode = false;

// Brain pools (separate for attacker and defender roles)
let attackerSavedBrains: Array<{ brain: NeuralNetwork; personality: PersonalityGene }> = [];
let defenderSavedBrains: Array<{ brain: NeuralNetwork; personality: PersonalityGene }> = [];

// Hall of Fame: top performers across all generations
let hallOfFame: Array<{ brain: NeuralNetwork; personality: PersonalityGene; fitness: number; role: 'attacker' | 'defender' }> = [];
const HOF_MAX_SIZE = 5;
const HOF_MATCH_INTERVAL = 5; // Every 5 gens, play against a HoF champion

// Environment state
let currentObstacleCount = 2;  // Adaptive: increases if match < 1500 ticks
let lastGenerationDuration = 4000;
let ballRespawnTimer = 0;
let ballCornerCampingTimer = 0;
let stepGenerationOffset = 0;
let roleSwapCounter = 0; // Increments each gen

// ─── Step 2 Curriculum Difficulty Scaling ────────────────────────────────────
let step2AtkGoalsAvg = 0.0;
let step2DefStunAvg  = 0.0;
const CURRICULUM_EMA_ALPHA = 0.25;
const STEP2_DEF_SHARED_DUMMY_THRESHOLD = 7;

// ─── Step 3 Curriculum (1v1) ─────────────────────────────────────────────────
// Phase 1 (avg < 3):  DEF patrols at 30% speed, no stun skill
// Phase 2 (avg 3-8):  DEF rushes carrier at 65% speed, auto-stun on contact
// Phase 3 (avg >= 8): DEF uses full evolved neural network
let step3AtkGoalsAvg = 0.0;

// ─── Step 2 Group Training Globals ───────────────────────────────────────────
const S2_ATK_PAIR = 0;   // pairIdx for ATK group (canvas 1)
const S2_DEF_PAIR = 1;   // pairIdx for DEF group (canvas 2)
const S2_DUMMY_ID = 'dummy_s2';
const S2_GOAL_ZONE_WIDTH = 40;
const S2_GOAL_ZONE_HEIGHT = 70;
let step2GoalZone = { x: 560, y: 350, width: S2_GOAL_ZONE_WIDTH, height: S2_GOAL_ZONE_HEIGHT };

function respawnStep2GoalZone() {
  step2GoalZone = {
    x: 200 + Math.random() * (PITCH_WIDTH - 400),
    y: 120 + Math.random() * (PITCH_HEIGHT - 240),
    width: S2_GOAL_ZONE_WIDTH,
    height: S2_GOAL_ZONE_HEIGHT
  };
}

// Returns a brain compatible with the current step's expected input size,
// falling back to a fresh random brain if saved pool has wrong dimensions.
// Adaptive mutation rate for Step 2 ATK:
// - When ATK is stuck (low goals avg) → mutate hard to escape local minima
// - When ATK is thriving (high goals avg) → mutate gently to preserve good behaviour
function getStep2AtkMutationRate(): number {
  const avg = step2AtkGoalsAvg;
  if (avg < 1)       return 0.45; // Stuck at start — explore aggressively
  if (avg < 3)       return 0.35;
  if (avg < 7)       return 0.25; // Making progress — standard exploration
  if (avg < 12)      return 0.18;
  return 0.12;                    // Highly competent — refine, don't destroy
}

function makeStep2Brain(role: 'attacker' | 'defender', useSaved: boolean): { brain: NeuralNetwork; personality: PersonalityGene } {
  let pool = role === 'attacker' ? attackerSavedBrains : defenderSavedBrains;
  if (role === 'defender' && pool.length === 0) {
    pool = attackerSavedBrains; // fallback to Step 1 trained attacker brains
  }
  const expectedInputs = role === 'attacker' ? S2_ATK_INPUTS : S2_DEF_INPUTS;
  // ATK uses adaptive rate; DEF keeps the global config rate
  const mutRate = role === 'attacker' ? getStep2AtkMutationRate() : config!.mutationRate;
  if (useSaved && pool.length > 0) {
    const compatible = pool.filter(p => p.brain.layers[0]?.inputs === expectedInputs);
    if (compatible.length > 0) {
      const topCount = Math.max(1, Math.floor(compatible.length * 0.3));
      const parent = compatible[Math.floor(Math.random() * topCount)];
      const brain = JSON.parse(JSON.stringify(parent.brain)) as NeuralNetwork;
      mutate(brain, mutRate);
      return { brain, personality: mutatePersonality(parent.personality, mutRate) };
    }
  }
  const brain = role === 'attacker'
    ? createNeuralNetwork(S2_ATK_INPUTS, [S2_ATK_HIDDEN], S2_ATK_OUTPUTS)
    : createNeuralNetwork(S2_DEF_INPUTS, [S2_DEF_HIDDEN], S2_DEF_OUTPUTS);
  return { brain, personality: randomPersonality() };
}

// Physics constants
const PITCH_WIDTH = 1120;
const PITCH_HEIGHT = 700;
const PLAYER_RADIUS = 15;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 3;
const BALL_FRICTION = 0.98;
const BALL_MAX_SPEED = 8;
const MAX_TICKS = 2000;
const STEP2_TRAINERS_PER_SIDE = 15;
const PLAYER_COLORS = ['#c084fc', '#38bdf8', '#34d399', '#fb7185'];

// Skill cooldowns (in ticks, 60 ticks ≈ 1 second at 16ms/tick)
const SPRINT_DURATION = 120;   // 2s active
const SPRINT_COOLDOWN = 360;   // 6s cooldown
const DASH_DURATION = 20;      // short burst
const DASH_COOLDOWN = 420;     // 7s cooldown
const STUN_DURATION = 90;      // 1.5s stun effect
const STUN_RANGE = 40;         // px — must be this close to stun
const STUN_COOLDOWN = 150;     // Reduced to 2.5s for fast exploration/training
const KICKAWAY_COOLDOWN = 90;  // Reduced to 1.5s for fast exploration/training
const KICKAWAY_LOCKOUT = 40;   // ball untouchable for 40 ticks after kick

// ─── Personality Gene Helpers ────────────────────────────────────────────────

function randomPersonality(): PersonalityGene {
  return {
    aggression: Math.random(),
    riskTolerance: Math.random(),
    pressureThreshold: 40 + Math.random() * 160
  };
}

function mutatePersonality(p: PersonalityGene, rate: number): PersonalityGene {
  const r = rate * 0.6;
  return {
    aggression: Math.max(0, Math.min(1, p.aggression + (Math.random() - 0.5) * r)),
    riskTolerance: Math.max(0, Math.min(1, p.riskTolerance + (Math.random() - 0.5) * r)),
    pressureThreshold: Math.max(40, Math.min(200, p.pressureThreshold + (Math.random() - 0.5) * r * 120))
  };
}

function crossoverPersonality(p1: PersonalityGene, p2: PersonalityGene): PersonalityGene {
  return {
    aggression: Math.random() < 0.5 ? p1.aggression : p2.aggression,
    riskTolerance: Math.random() < 0.5 ? p1.riskTolerance : p2.riskTolerance,
    pressureThreshold: (p1.pressureThreshold + p2.pressureThreshold) / 2
  };
}

function isStep2DefSharedDummyMode(): boolean {
  return !!config && config.step === 2 && step2DefStunAvg < STEP2_DEF_SHARED_DUMMY_THRESHOLD;
}

// ─── Environment Generation ──────────────────────────────────────────────────

function generateEnvironment(): { obstacles: Obstacle[]; wind: { x: number; y: number }; slipperyZones: SlipperyZone[] } {
  // Wind: permanently disabled
  const wind = { x: 0, y: 0 };

  // Slippery zones: 2–3 random circles (not in goal or spawn areas)
  const slipperyZones: SlipperyZone[] = [];
  const numZones = 2 + Math.floor(Math.random() * 2);
  for (let z = 0; z < numZones; z++) {
    slipperyZones.push({
      x: 160 + Math.random() * (PITCH_WIDTH - 320),
      y: 80 + Math.random() * (PITCH_HEIGHT - 160),
      radius: 50 + Math.random() * 40
    });
  }

  // Forbidden zones where obstacles cannot spawn
  const forbidden = [
    { x: 0, y: 0, w: 130, h: PITCH_HEIGHT },                            // left goal corridor
    { x: PITCH_WIDTH - 130, y: 0, w: 130, h: PITCH_HEIGHT },            // right goal corridor
    { x: PITCH_WIDTH / 2 - 80, y: PITCH_HEIGHT / 2 - 80, w: 160, h: 160 }, // center circle
    { x: 80, y: PITCH_HEIGHT / 2 - 110, w: 220, h: 220 },               // attacker spawn
    { x: PITCH_WIDTH - 300, y: PITCH_HEIGHT / 2 - 110, w: 220, h: 220 } // defender spawn
  ];

  const obstacles: Obstacle[] = [];
  let attempts = 0;
  while (obstacles.length < currentObstacleCount && attempts < 200) {
    attempts++;
    const w = 40 + Math.random() * 70;
    const h = 35 + Math.random() * 55;
    const x = 100 + Math.random() * (PITCH_WIDTH - 200 - w);
    const y = 50 + Math.random() * (PITCH_HEIGHT - 100 - h);

    let valid = true;
    for (const fz of forbidden) {
      if (x < fz.x + fz.w && x + w > fz.x && y < fz.y + fz.h && y + h > fz.y) { valid = false; break; }
    }
    for (const obs of obstacles) {
      if (x < obs.x + obs.width + 25 && x + w > obs.x - 25 && y < obs.y + obs.height + 25 && y + h > obs.y - 25) { valid = false; break; }
    }
    if (valid) obstacles.push({ id: `obs_${obstacles.length}`, x, y, width: w, height: h });
  }

  return { obstacles, wind, slipperyZones };
}

// ─── Obstacle Collision ──────────────────────────────────────────────────────

function resolveCircleRect(cx: number, cy: number, radius: number, obs: Obstacle) {
  const closestX = Math.max(obs.x, Math.min(cx, obs.x + obs.width));
  const closestY = Math.max(obs.y, Math.min(cy, obs.y + obs.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < radius && dist > 0.001) {
    const overlap = radius - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return { overlap, nx, ny };
  }
  return null;
}

function resolvePlayerObstacle(player: FootballPlayer, obs: Obstacle) {
  const hit = resolveCircleRect(player.x, player.y, player.radius, obs);
  if (hit) {
    player.x += hit.nx * hit.overlap;
    player.y += hit.ny * hit.overlap;
    const dot = player.vx * hit.nx + player.vy * hit.ny;
    if (dot < 0) {
      player.vx -= dot * hit.nx * 0.6;
      player.vy -= dot * hit.ny * 0.6;
    }
  }
}

function resolveBallObstacle(ball: Ball, obs: Obstacle) {
  const hit = resolveCircleRect(ball.x, ball.y, ball.radius, obs);
  if (hit) {
    ball.x += hit.nx * hit.overlap;
    ball.y += hit.ny * hit.overlap;
    const dot = ball.vx * hit.nx + ball.vy * hit.ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * hit.nx;
      ball.vy -= 2 * dot * hit.ny;
      ball.vx *= 0.65;
      ball.vy *= 0.65;
    }
  }
}

function resolvePlayerPlayerCollision(p1: FootballPlayer, p2: FootballPlayer) {
  if (p1.team === p2.team) return; // Cho phép đi xuyên nếu cùng phe khi huấn luyện

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = p1.radius + p2.radius;

  if (dist >= minDist || dist <= 0.001) return;

  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  // ── 1. Micro positional nudge only — prevents sinking, no teleport ──
  p1.x -= nx * overlap * 0.25;
  p1.y -= ny * overlap * 0.25;
  p2.x += nx * overlap * 0.25;
  p2.y += ny * overlap * 0.25;

  // ── 2. Cancel inward velocity only — NO momentum transfer ──
  const v1n = p1.vx * nx + p1.vy * ny;
  if (v1n < 0) {
    p1.vx -= v1n * nx;
    p1.vy -= v1n * ny;
  }
  const v2n = -(p2.vx * nx + p2.vy * ny);
  if (v2n < 0) {
    p2.vx += v2n * nx;
    p2.vy += v2n * ny;
  }

  // ── 3. Contact drag — kills jitter naturally ──
  p1.vx *= 0.78;
  p1.vy *= 0.78;
  p2.vx *= 0.78;
  p2.vy *= 0.78;
}

// ─── Hall of Fame ────────────────────────────────────────────────────────────

function tryAddToHallOfFame(player: FootballPlayer) {
  if (!player.personality) return;
  const entry = {
    brain: JSON.parse(JSON.stringify(player.brain)),
    personality: { ...player.personality },
    fitness: player.fitness,
    role: (player.role || (player.team === 'A' ? 'attacker' : 'defender')) as 'attacker' | 'defender'
  };
  hallOfFame.push(entry);
  hallOfFame.sort((a, b) => b.fitness - a.fitness);
  if (hallOfFame.length > HOF_MAX_SIZE) hallOfFame.pop();
}

// ─── Distance Helper ─────────────────────────────────────────────────────────

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// Half-height of the goal opening
const GOAL_HALF_HEIGHT = 50;

function isPlayerInBorderZone(px: number, py: number): boolean {
  if (py < 15 || py > PITCH_HEIGHT - 15) return true;
  const isNearGoalY = py > PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT && py < PITCH_HEIGHT / 2 + GOAL_HALF_HEIGHT;
  if ((px < 15 || px > PITCH_WIDTH - 15) && !isNearGoalY) return true;
  return false;
}

// ─── Make Player ─────────────────────────────────────────────────────────────

function makePlayer(
  id: string, x: number, y: number, team: 'A' | 'B', color: string,
  brain: NeuralNetwork, personality: PersonalityGene,
  role: 'attacker' | 'defender', isHofChampion = false, isElite = false
): FootballPlayer {
  return {
    id, x, y, vx: 0, vy: 0,
    radius: PLAYER_RADIUS,
    team, brain, personality, role, isHofChampion, isElite,
    fitness: 0, color,
    hasBall: false,
    angle: team === 'A' ? 0 : Math.PI,
    sprintTimer: 0, sprintCooldown: 0,
    dashTimer: 0, dashCooldown: 0,
    isSprinting: false, isDashing: false,
    stealSpeedBoostTimer: 0, lostBallLockoutTimer: 0,
    stamina: 100, dashStunTimer: 0,
    targetVx: 0, targetVy: 0,
    ballPossessionDrought: 0
  };
}

// ─── Brain factory per role ───────────────────────────────────────────────────
function makeBrain(step: number, role: 'attacker' | 'defender'): NeuralNetwork {
  if (step === 1) return createNeuralNetwork(STEP1_INPUTS, [STEP1_HIDDEN], STEP1_OUTPUTS);
  if (step === 2) {
    return role === 'attacker'
      ? createNeuralNetwork(S2_ATK_INPUTS, [S2_ATK_HIDDEN], S2_ATK_OUTPUTS)
      : createNeuralNetwork(S2_DEF_INPUTS, [S2_DEF_HIDDEN], S2_DEF_OUTPUTS);
  }
  if (step === 3) {
    return role === 'attacker'
      ? createNeuralNetwork(S3_ATK_INPUTS, [S3_ATK_HIDDEN], S3_ATK_OUTPUTS)
      : createNeuralNetwork(S3_DEF_INPUTS, [S3_DEF_HIDDEN], S3_DEF_OUTPUTS);
  }
  if (role === 'attacker') return createNeuralNetwork(ATK_INPUTS, [ATK_HIDDEN], ATK_OUTPUTS);
  return createNeuralNetwork(DEF_INPUTS, [DEF_HIDDEN], DEF_OUTPUTS);
}

// ─── Step 2: Group-based init (mirrors Step 1 mechanism) ─────────────────────
function initStep2Generation(useSaved: boolean) {
  population = [];
  const popSize = config!.populationSize || 15;
  const balls: Ball[] = [];

  // DEF team alternates each generation; ATK is always split 50-50 between both goals
  const halfSize = Math.floor(popSize / 2);
  const defTeam: 'A' | 'B' = roleSwapCounter % 2 === 0 ? 'B' : 'A';
  const atkTeamForDummy: 'A' | 'B' = defTeam === 'A' ? 'B' : 'A';

  // ATK group (Canvas 1) - even pair indices
  // First half attacks right goal (team A), second half attacks left goal (team B)
  for (let i = 0; i < popSize; i++) {
    const pairIdx = i * 2;
    const b = makeStep2Brain('attacker', useSaved);

    const thisAtkTeam: 'A' | 'B' = i < halfSize ? 'A' : 'B';

    // Spawn range based on curriculum
    const range = getStep2AtkSpawnRange(thisAtkTeam);
    const x = range.minX + Math.random() * (range.maxX - range.minX);
    const y = range.minY + Math.random() * (range.maxY - range.minY);

    const p = makePlayer(`s2atk_${i}`, x, y, thisAtkTeam, '#c084fc', b.brain, b.personality, 'attacker');
    p.angle = thisAtkTeam === 'A' ? 0 : Math.PI;
    (p as any).pairIdx = pairIdx;
    population.push(p);

    // Ball glued to this attacker on spawn
    balls.push({
      id: `b_${pairIdx}`,
      x: p.x + Math.cos(p.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
      y: p.y + Math.sin(p.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
      vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: p.id, isActive: true
    });
    
    // Push dummy ball at `i * 2 + 1` so index matches pairIdx
    balls.push({
      id: `b_${i * 2 + 1}`,
      x: 0, y: 0, vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: null, isActive: false
    });
  }

  // DEF group (Canvas 2) - odd pair indices
  const isShared = isStep2DefSharedDummyMode();
  
  if (isShared) {
    // Phase 1: Shared Dummy Mode
    // 15 defenders all with pairIdx = 1, sharing 1 dummy at S2_DUMMY_ID and 1 ball at balls[1]
    for (let i = 0; i < popSize; i++) {
      const b = makeStep2Brain('defender', useSaved);
      let x: number;
      if (defTeam === 'B') {
        x = PITCH_WIDTH * 0.55 + Math.random() * PITCH_WIDTH * 0.38;
      } else {
        x = PITCH_WIDTH * 0.07 + Math.random() * PITCH_WIDTH * 0.38;
      }
      const y = 60 + Math.random() * (PITCH_HEIGHT - 120);
      const p = makePlayer(`s2def_${i}`, x, y, defTeam, '#22d3ee', b.brain, b.personality, 'defender');
      p.angle = defTeam === 'A' ? 0 : Math.PI;
      (p as any).pairIdx = S2_DEF_PAIR; // S2_DEF_PAIR is 1
      population.push(p);
    }

    // Shared Dummy Attacker
    let dummyX: number;
    if (defTeam === 'B') {
      dummyX = PITCH_WIDTH * 0.52 + Math.random() * PITCH_WIDTH * 0.40;
    } else {
      dummyX = PITCH_WIDTH * 0.08 + Math.random() * PITCH_WIDTH * 0.40;
    }
    const dummyY = 60 + Math.random() * (PITCH_HEIGHT - 120);
    const dummyBrain = createNeuralNetwork(S2_ATK_INPUTS, [S2_ATK_HIDDEN], S2_ATK_OUTPUTS);
    const dummy = makePlayer(S2_DUMMY_ID, dummyX, dummyY, atkTeamForDummy, '#fb7185', dummyBrain, randomPersonality(), 'attacker');
    (dummy as any).pairIdx = S2_DEF_PAIR;
    (dummy as any).controlMode = 'step2-dummy';
    dummy.angle = atkTeamForDummy === 'A' ? 0 : Math.PI;
    population.push(dummy);

    // Glue balls[1] to shared dummy
    balls[1] = {
      id: `b_${S2_DEF_PAIR}`,
      x: dummy.x + Math.cos(dummy.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
      y: dummy.y + Math.sin(dummy.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
      vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: dummy.id, isActive: true
    };
  } else {
    // Phase 2: Individual Dummies Mode
    // 15 defenders, each defender i has dummy i and ball i * 2 + 1
    for (let i = 0; i < popSize; i++) {
      const pairIdx = i * 2 + 1;
      
      // Defender i
      const b = makeStep2Brain('defender', useSaved);
      let x: number;
      if (defTeam === 'B') {
        x = PITCH_WIDTH * 0.55 + Math.random() * PITCH_WIDTH * 0.38;
      } else {
        x = PITCH_WIDTH * 0.07 + Math.random() * PITCH_WIDTH * 0.38;
      }
      const y = 60 + Math.random() * (PITCH_HEIGHT - 120);
      const p = makePlayer(`s2def_${i}`, x, y, defTeam, '#22d3ee', b.brain, b.personality, 'defender');
      p.angle = defTeam === 'A' ? 0 : Math.PI;
      (p as any).pairIdx = pairIdx;
      population.push(p);

      // Dummy Attacker i
      let dummyX: number;
      if (defTeam === 'B') {
        dummyX = PITCH_WIDTH * 0.52 + Math.random() * PITCH_WIDTH * 0.40;
      } else {
        dummyX = PITCH_WIDTH * 0.08 + Math.random() * PITCH_WIDTH * 0.40;
      }
      const dummyY = 60 + Math.random() * (PITCH_HEIGHT - 120);
      const dummyBrain = createNeuralNetwork(S2_ATK_INPUTS, [S2_ATK_HIDDEN], S2_ATK_OUTPUTS);
      const dummy = makePlayer(`s2dummy_${i}`, dummyX, dummyY, atkTeamForDummy, '#fb7185', dummyBrain, randomPersonality(), 'attacker');
      (dummy as any).pairIdx = pairIdx;
      (dummy as any).controlMode = 'step2-dummy';
      dummy.angle = atkTeamForDummy === 'A' ? 0 : Math.PI;
      population.push(dummy);

      // Glue ball at odd index to dummy i
      balls[pairIdx] = {
        id: `b_${pairIdx}`,
        x: dummy.x + Math.cos(dummy.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
        y: dummy.y + Math.sin(dummy.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
        vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: dummy.id, isActive: true
      };
    }
  }

  // Setup main goals
  const goals = [
    { team: 'A' as const, x: 10, y: PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT, width: 25, height: GOAL_HALF_HEIGHT * 2 },
    { team: 'B' as const, x: PITCH_WIDTH - 35, y: PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT, width: 25, height: GOAL_HALF_HEIGHT * 2 }
  ];

  state = {
    players: population,
    balls: balls,
    goals: goals,
    pitch: { width: PITCH_WIDTH, height: PITCH_HEIGHT },
    generation: (state?.generation || 0) + 1,
    scores: { A: 0, B: 0, even: { A: 0, B: 0 }, odd: { A: 0, B: 0 } },
    ticks: 0,
    bestFitness: 0,
    isHofMatchGen: false,
    obstacles: [],
    wind: { x: 0, y: 0 },
    slipperyZones: []
  };
}

// ─── Step 3: 1v1 Curriculum Helpers ─────────────────────────────────────────

function getStep3DefPhase(): 1 | 2 | 3 | 4 {
  if (step3AtkGoalsAvg < 3)  return 1; // Tuần tra chậm
  if (step3AtkGoalsAvg < 8)  return 2; // Đối đầu + tự động choáng + đá bóng
  if (step3AtkGoalsAvg < 15) return 3; // Hybrid: scripted rush + neural turn + kỹ năng
  return 4;                             // Mạng thần kinh toàn phần
}

function getStep3AtkMutationRate(): number {
  const avg = step3AtkGoalsAvg;
  if (avg < 1)  return 0.45;
  if (avg < 3)  return 0.35;
  if (avg < 7)  return 0.25;
  if (avg < 12) return 0.18;
  return 0.12;
}

function getStep3AtkSpawnRange(team: 'A' | 'B'): { minX: number; maxX: number; minY: number; maxY: number } {
  const avg = step3AtkGoalsAvg;
  let maxRangeFromGoal: number;
  if (avg < 2)       maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.25);
  else if (avg < 5)  maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.38);
  else if (avg < 10) maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.52);
  else if (avg < 15) maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.65);
  else               maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.82);

  const goalCenter = PITCH_HEIGHT / 2;
  let yMargin: number;
  if (avg < 2)       yMargin = GOAL_HALF_HEIGHT * 1.5;
  else if (avg < 5)  yMargin = GOAL_HALF_HEIGHT * 2.5;
  else if (avg < 10) yMargin = GOAL_HALF_HEIGHT * 4.5;
  else if (avg < 15) yMargin = GOAL_HALF_HEIGHT * 7.0;
  else               yMargin = GOAL_HALF_HEIGHT * 11.0;

  const minY = Math.max(60, goalCenter - yMargin);
  const maxY = Math.min(PITCH_HEIGHT - 60, goalCenter + yMargin);

  if (team === 'A') {
    return { minX: Math.max(60, PITCH_WIDTH - maxRangeFromGoal), maxX: PITCH_WIDTH - 55, minY, maxY };
  } else {
    return { minX: 55, maxX: Math.min(PITCH_WIDTH - 60, maxRangeFromGoal), minY, maxY };
  }
}

function makeStep3Brain(role: 'attacker' | 'defender', useSaved: boolean): { brain: NeuralNetwork; personality: PersonalityGene } {
  const pool = role === 'attacker' ? attackerSavedBrains : defenderSavedBrains;
  const expectedInputs = role === 'attacker' ? S3_ATK_INPUTS : S3_DEF_INPUTS;
  const mutRate = role === 'attacker' ? getStep3AtkMutationRate() : config!.mutationRate;
  if (useSaved && pool.length > 0) {
    const compatible = pool.filter(p => p.brain.layers[0]?.inputs === expectedInputs);
    if (compatible.length > 0) {
      const topCount = Math.max(1, Math.floor(compatible.length * 0.3));
      const parent = compatible[Math.floor(Math.random() * topCount)];
      const brain = JSON.parse(JSON.stringify(parent.brain)) as NeuralNetwork;
      mutate(brain, mutRate);
      return { brain, personality: mutatePersonality(parent.personality, mutRate) };
    }
  }
  const brain = role === 'attacker'
    ? createNeuralNetwork(S3_ATK_INPUTS, [S3_ATK_HIDDEN], S3_ATK_OUTPUTS)
    : createNeuralNetwork(S3_DEF_INPUTS, [S3_DEF_HIDDEN], S3_DEF_OUTPUTS);
  return { brain, personality: randomPersonality() };
}

// ─── Step 3: Init Generation ─────────────────────────────────────────────────

function initStep3Generation(useSaved: boolean) {
  population = [];
  const popSize = config!.populationSize || 15;
  const balls: Ball[] = [];
  const halfSize = Math.floor(popSize / 2);

  for (let i = 0; i < popSize; i++) {
    const atkTeam: 'A' | 'B' = i < halfSize ? 'A' : 'B';
    const defTeam: 'A' | 'B' = atkTeam === 'A' ? 'B' : 'A';

    // ATK
    const atkData = makeStep3Brain('attacker', useSaved);
    const atkRange = getStep3AtkSpawnRange(atkTeam);
    const atkX = atkRange.minX + Math.random() * (atkRange.maxX - atkRange.minX);
    const atkY = atkRange.minY + Math.random() * (atkRange.maxY - atkRange.minY);
    const atk = makePlayer(`s3atk_${i}`, atkX, atkY, atkTeam, '#c084fc', atkData.brain, atkData.personality, 'attacker');
    atk.angle = atkTeam === 'A' ? 0 : Math.PI;
    (atk as any).pairIdx = i;
    population.push(atk);

    // DEF — spawns in front of own goal
    const defData = makeStep3Brain('defender', useSaved);
    const defGoalX = defTeam === 'A' ? 35 : PITCH_WIDTH - 35;
    const defOffsetDir = defTeam === 'A' ? 1 : -1;
    const defX = defGoalX + defOffsetDir * (80 + Math.random() * 170);
    const defY = PITCH_HEIGHT / 2 + (Math.random() * 200 - 100);
    const def = makePlayer(`s3def_${i}`, defX, defY, defTeam, '#22d3ee', defData.brain, defData.personality, 'defender');
    def.angle = defTeam === 'A' ? 0 : Math.PI;
    (def as any).pairIdx = i;
    population.push(def);

    // Ball glued to ATK
    balls.push({
      id: `b_${i}`,
      x: atk.x + Math.cos(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
      y: atk.y + Math.sin(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
      vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: atk.id, isActive: true
    });
  }

  const goals = [
    { team: 'A' as const, x: 10, y: PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT, width: 25, height: GOAL_HALF_HEIGHT * 2 },
    { team: 'B' as const, x: PITCH_WIDTH - 35, y: PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT, width: 25, height: GOAL_HALF_HEIGHT * 2 }
  ];

  state = {
    players: population,
    balls,
    goals,
    pitch: { width: PITCH_WIDTH, height: PITCH_HEIGHT },
    generation: (state?.generation || 0) + 1,
    scores: { A: 0, B: 0, even: { A: 0, B: 0 }, odd: { A: 0, B: 0 } } as any,
    ticks: 0,
    bestFitness: 0,
    isHofMatchGen: false,
    obstacles: [],
    wind: { x: 0, y: 0 },
    slipperyZones: []
  };
}

// ─── Step 3: Reset One Pair ───────────────────────────────────────────────────

function resetStep3Pair(pairIdx: number) {
  if (!state) return;
  const ball = state.balls[pairIdx];
  if (!ball) return;

  const atk = population.find(p => (p as any).pairIdx === pairIdx && p.role === 'attacker');
  const def = population.find(p => (p as any).pairIdx === pairIdx && p.role === 'defender');

  if (atk) {
    const range = getStep3AtkSpawnRange(atk.team);
    atk.x = range.minX + Math.random() * (range.maxX - range.minX);
    atk.y = range.minY + Math.random() * (range.maxY - range.minY);
    atk.vx = 0; atk.vy = 0;
    atk.angle = atk.team === 'A' ? 0 : Math.PI;
    atk.lostBallLockoutTimer = 0;
    atk.dashStunTimer = 0;
    atk.isSprinting = false; atk.isDashing = false;
    const atkAny = atk as any;
    atkAny.sprintCooldown = 0; atkAny.sprintActive = 0;
    atk.dashCooldown = 0;
    atkAny.prevDist = undefined; atkAny.prevGoalDist = undefined;
    atkAny.prevVx = 0; atkAny.prevVy = 0;
    atkAny.cumulAngle = 0; atkAny.prevAngle = undefined;
    atkAny.s3delay = 0;
  }

  if (def) {
    const defGoalX = def.team === 'A' ? 35 : PITCH_WIDTH - 35;
    const defOffsetDir = def.team === 'A' ? 1 : -1;
    def.x = defGoalX + defOffsetDir * (80 + Math.random() * 170);
    def.y = PITCH_HEIGHT / 2 + (Math.random() * 200 - 100);
    def.vx = 0; def.vy = 0;
    def.angle = def.team === 'A' ? 0 : Math.PI;
    def.dashStunTimer = 0; def.lostBallLockoutTimer = 0;
    const defAny = def as any;
    defAny.stunCooldown = 0; defAny.kickCooldown = 0;
    defAny.wantsStun = false; defAny.wantsKick = false;
    defAny.prevDistToCarrier = undefined;
    defAny.prevVx = 0; defAny.prevVy = 0;
    defAny.cumulAngle = 0; defAny.prevAngle = undefined;
    defAny.patrolDir = undefined;
    defAny.s3defResetDelay = 0;
  }

  if (atk) {
    ball.x = atk.x + Math.cos(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.y = atk.y + Math.sin(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.vx = 0; ball.vy = 0;
    ball.ownerId = atk.id;
    ball.isActive = true;
    (ball as any).goalScored = false;
    (ball as any).kickedLockoutTimer = 0;
  }
}

// ─── Step 3: ATK Neural Process ───────────────────────────────────────────────

function processStep3Atk(player: FootballPlayer, ball: Ball, def: FootballPlayer | null, maxDist: number) {
  const pAny = player as any;

  if (pAny.s3delay && pAny.s3delay > 0) {
    pAny.s3delay--;
    player.vx = 0; player.vy = 0;
    if (pAny.s3delay === 0) resetStep3Pair(pAny.pairIdx as number);
    return;
  }

  const scoringGoal = player.team === 'A' ? state!.goals[1] : state!.goals[0];
  const goalX = scoringGoal.x + scoringGoal.width / 2;
  const goalY = scoringGoal.y + scoringGoal.height / 2;
  const hasBall = ball.ownerId === player.id;
  const distToBall = distance(player.x, player.y, ball.x, ball.y);
  const distToGoal = distance(player.x, player.y, goalX, goalY);
  const defX = def ? def.x : (player.team === 'A' ? PITCH_WIDTH * 0.85 : PITCH_WIDTH * 0.15);
  const defY = def ? def.y : PITCH_HEIGHT / 2;

  const inputs: number[] = [
    Math.min(1, distToBall / maxDist),
    relAngleFrom(player, ball.x, ball.y),
    hasBall ? 1.0 : 0.0,
    Math.min(1, distToGoal / maxDist),
    relAngleFrom(player, goalX, goalY),
    Math.min(1, distance(player.x, player.y, defX, defY) / maxDist),
    relAngleFrom(player, defX, defY),
    (pAny.sprintCooldown ?? 0) > 0 ? 1.0 : 0.0,
    (player.dashCooldown ?? 0) > 0 ? 1.0 : 0.0
  ];

  const outputs = feedForward(inputs, player.brain);

  // Turn & angle
  const speedNorm = Math.max(0, Math.min(1, (outputs[0] + 1) / 2));
  const turn = Math.max(-1, Math.min(1, outputs[1]));
  const isStunned = (player.dashStunTimer ?? 0) > 0;
  player.angle += turn * 0.28 * (isStunned ? 0.1 : 1.0);
  while (player.angle > Math.PI) player.angle -= Math.PI * 2;
  while (player.angle < -Math.PI) player.angle += Math.PI * 2;

  let speed = speedNorm * PLAYER_SPEED * (isStunned ? 0.1 : 1.0);

  // Sprint (output[2])
  if (!pAny.sprintCooldown) pAny.sprintCooldown = 0;
  if (!pAny.sprintActive) pAny.sprintActive = 0;
  if (outputs[2] > 0.5 && pAny.sprintCooldown <= 0 && pAny.sprintActive <= 0 && !isStunned) {
    pAny.sprintActive = SPRINT_DURATION;
    pAny.sprintCooldown = SPRINT_COOLDOWN;
  }
  if (pAny.sprintActive > 0) { pAny.sprintActive--; speed *= 1.8; }
  if (pAny.sprintCooldown > 0) pAny.sprintCooldown--;

  // Dash (output[3])
  if (!player.dashCooldown) player.dashCooldown = 0;
  if (!player.dashTimer) player.dashTimer = 0;
  if (outputs[3] > 0.5 && player.dashCooldown <= 0 && !player.isDashing && !isStunned) {
    player.isDashing = true;
    player.dashTimer = DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
  }
  if (player.isDashing) {
    speed *= 2.5;
    player.dashTimer = (player.dashTimer ?? 1) - 1;
    if ((player.dashTimer ?? 0) <= 0) player.isDashing = false;
  }
  if ((player.dashCooldown ?? 0) > 0) player.dashCooldown--;

  // Velocity with inertia
  const desiredVx = Math.cos(player.angle) * speed;
  const desiredVy = Math.sin(player.angle) * speed;
  player.vx = (pAny.prevVx ?? desiredVx) + (desiredVx - (pAny.prevVx ?? desiredVx)) * 0.25;
  player.vy = (pAny.prevVy ?? desiredVy) + (desiredVy - (pAny.prevVy ?? desiredVy)) * 0.25;
  pAny.prevVx = player.vx;
  pAny.prevVy = player.vy;

  player.x = Math.max(player.radius, Math.min(PITCH_WIDTH - player.radius, player.x + player.vx));
  player.y = Math.max(player.radius, Math.min(PITCH_HEIGHT - player.radius, player.y + player.vy));
  resolveGoalCageCollisions(player, false);

  // Ball glue
  if (hasBall) {
    ball.x = player.x + Math.cos(player.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.y = player.y + Math.sin(player.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.vx = player.vx; ball.vy = player.vy;
  }

  // Loose ball pickup
  const locked = ((ball as any).kickedLockoutTimer ?? 0) > 0;
  if (!hasBall && !locked && ball.ownerId === null && distToBall < PLAYER_RADIUS + BALL_RADIUS + 6) {
    ball.ownerId = player.id;
    player.fitness += 20;
    pAny.prevGoalDist = undefined;
  }

  // Goal check
  let isInGoal = player.team === 'A'
    ? (ball.x > 1085 && ball.y > 300 && ball.y < 400)
    : (ball.x < 35 && ball.y > 300 && ball.y < 400);

  if (hasBall && isInGoal && !(ball as any).goalScored) {
    (ball as any).goalScored = true;
    player.fitness += 500;
    if (player.team === 'A') {
      state!.scores.A++;
      if (state!.scores.even) state!.scores.even.A++;
    } else {
      state!.scores.B++;
      if (state!.scores.even) state!.scores.even.B++;
    }
    (state! as any).s3AtkGoals = ((state! as any).s3AtkGoals ?? 0) + 1;
    pAny.s3delay = 45;
    return;
  }

  // Fitness shaping
  if (hasBall) {
    const prevGoalDist = pAny.prevGoalDist ?? distToGoal;
    const prog = prevGoalDist - distToGoal;
    player.fitness += prog > 0 ? prog * 5.0 : prog * 0.5;
    player.fitness += Math.pow(1 - Math.min(1, distToGoal / maxDist), 2) * 3.0;
    let relA = Math.atan2(goalY - player.y, goalX - player.x) - player.angle;
    while (relA > Math.PI) relA -= Math.PI * 2;
    while (relA < -Math.PI) relA += Math.PI * 2;
    player.fitness += Math.max(0, Math.cos(relA)) * 1.5;
    // Y-alignment near goal
    const xDistToGoal = Math.abs(player.x - goalX);
    if (xDistToGoal < 400) {
      const yOff = Math.abs(player.y - goalY);
      player.fitness += Math.max(0, 1 - yOff / (GOAL_HALF_HEIGHT * 3)) * 4.0 * (1 - xDistToGoal / 400);
    }
    pAny.prevGoalDist = distToGoal;
  } else {
    // Không có bóng: phải chạy đến bóng
    const prevBallDist = pAny.prevDist ?? distToBall;
    const prog = prevBallDist - distToBall;
    // Reward mạnh khi tiến gần bóng, phạt khi lùi ra xa
    if (prog > 0) {
      player.fitness += prog * 3.0;
    } else {
      player.fitness += prog * 1.5; // phạt khi đi xa bóng
    }
    // Reward liên tục dựa vào độ gần bóng (khuyến khích ở gần)
    player.fitness += Math.max(0, 1 - Math.min(1, distToBall / 300)) * 1.5;
    // Phạt mỗi tick không có bóng để tạo cảm giác khẩn cấp
    player.fitness -= 0.05;
    pAny.prevDist = distToBall;
  }

  // Anti-spin
  const prevAngle = pAny.prevAngle ?? player.angle;
  let aDelta = player.angle - prevAngle;
  while (aDelta > Math.PI) aDelta -= Math.PI * 2;
  while (aDelta < -Math.PI) aDelta += Math.PI * 2;
  pAny.cumulAngle = (pAny.cumulAngle ?? 0) + Math.abs(aDelta);
  const spinThresh = hasBall ? Math.PI * 0.8 : Math.PI * 1.5;
  if (pAny.cumulAngle > spinThresh) {
    player.fitness -= hasBall ? 50 : 20;
    pAny.cumulAngle = 0;
  }
  pAny.prevAngle = player.angle;
  player.fitness -= hasBall ? 0.02 : 0.0;
}

// ─── Step 3: Scripted DEF (Phase 1 & 2) ──────────────────────────────────────

function processStep3ScriptedDef(player: FootballPlayer, ball: Ball, atk: FootballPlayer, phase: 1 | 2 | 3) {
  const pAny = player as any;
  const ownGoal = player.team === 'A' ? state!.goals[0] : state!.goals[1];
  const ogx = ownGoal.x + ownGoal.width / 2;
  const ogy = ownGoal.y + ownGoal.height / 2;

  if (phase === 1) {
    // Tuần tra chậm ±160px quanh khung thành, không kỹ năng
    if (pAny.patrolDir === undefined) pAny.patrolDir = Math.random() < 0.5 ? 1 : -1;
    const patrolX = ogx < PITCH_WIDTH / 2 ? ogx + 120 : ogx - 120;
    let targetY = player.y + pAny.patrolDir * 1.8;
    if (targetY < ogy - 160) { targetY = ogy - 160; pAny.patrolDir = 1; }
    if (targetY > ogy + 160) { targetY = ogy + 160; pAny.patrolDir = -1; }
    player.angle = Math.atan2(targetY - player.y, patrolX - player.x);
    player.vx = Math.cos(player.angle) * PLAYER_SPEED * 0.30;
    player.vy = Math.sin(player.angle) * PLAYER_SPEED * 0.30;
    pAny.wantsStun = false; pAny.wantsKick = false;
  } else if (phase === 2) {
    // Đối đầu: chỉ đuổi bóng/carrier, tự động choáng khi chạm, đá bóng ra khi cầm
    if (!pAny.stunCooldown) pAny.stunCooldown = 0;
    if (!pAny.kickCooldown) pAny.kickCooldown = 0;

    if (ball.ownerId === player.id) {
      // DEF cầm bóng → đá ra ngay
      if (pAny.kickCooldown <= 0) { pAny.wantsKick = true; pAny.kickCooldown = KICKAWAY_COOLDOWN; }
      else pAny.wantsKick = false;
      pAny.wantsStun = false;
    } else {
      pAny.wantsKick = false;
      // Đuổi BÓNG nếu bóng không có chủ, đuổi ATK chỉ khi ATK đang cầm bóng
      const targetX = ball.ownerId === atk.id ? atk.x : ball.x;
      const targetY = ball.ownerId === atk.id ? atk.y : ball.y;
      player.angle = Math.atan2(targetY - player.y, targetX - player.x);
      player.vx = Math.cos(player.angle) * PLAYER_SPEED * 0.65;
      player.vy = Math.sin(player.angle) * PLAYER_SPEED * 0.65;

      // Chỉ choáng khi ATK đang cầm bóng
      const distToAtk = distance(player.x, player.y, atk.x, atk.y);
      pAny.wantsStun = (ball.ownerId === atk.id && distToAtk < STUN_RANGE && pAny.stunCooldown <= 0);
      if (pAny.wantsStun) pAny.stunCooldown = STUN_COOLDOWN;

      const distToTarget = distance(player.x, player.y, targetX, targetY);
      const prevDist = pAny.prevDistToCarrier ?? distToTarget;
      player.fitness += (prevDist - distToTarget) > 0 ? (prevDist - distToTarget) * 2.0 : -0.05;
      player.fitness += distToAtk < STUN_RANGE * 2 && ball.ownerId === atk.id ? 1.0 : 0;
      pAny.prevDistToCarrier = distToTarget;
    }
    if (pAny.stunCooldown > 0) pAny.stunCooldown--;
    if (pAny.kickCooldown > 0) pAny.kickCooldown--;
  } else {
    // Phase 3 Hybrid: đuổi bóng/carrier 70% + choáng + đá ra
    if (!pAny.stunCooldown) pAny.stunCooldown = 0;
    if (!pAny.kickCooldown) pAny.kickCooldown = 0;

    if (ball.ownerId === player.id) {
      // Cầm bóng → đá ra ngay về phía an toàn
      player.angle = Math.atan2(ogy - player.y, ogx - player.x) + (Math.random() - 0.5) * 0.8;
      player.vx = Math.cos(player.angle) * PLAYER_SPEED * 0.5;
      player.vy = Math.sin(player.angle) * PLAYER_SPEED * 0.5;
      if (pAny.kickCooldown <= 0) { pAny.wantsKick = true; pAny.kickCooldown = KICKAWAY_COOLDOWN; }
      else pAny.wantsKick = false;
      pAny.wantsStun = false;
    } else {
      pAny.wantsKick = false;
      // Đuổi BÓNG nếu bóng không có chủ, đuổi ATK chỉ khi ATK cầm bóng
      const targetX = ball.ownerId === atk.id ? atk.x : ball.x;
      const targetY = ball.ownerId === atk.id ? atk.y : ball.y;
      const targetAngle = Math.atan2(targetY - player.y, targetX - player.x);
      let dA = targetAngle - player.angle;
      while (dA > Math.PI) dA -= Math.PI * 2;
      while (dA < -Math.PI) dA += Math.PI * 2;
      player.angle += dA * 0.35;
      player.vx = Math.cos(player.angle) * PLAYER_SPEED * 0.70;
      player.vy = Math.sin(player.angle) * PLAYER_SPEED * 0.70;

      const distToAtk = distance(player.x, player.y, atk.x, atk.y);
      pAny.wantsStun = (ball.ownerId === atk.id && distToAtk < STUN_RANGE && pAny.stunCooldown <= 0);
      if (pAny.wantsStun) pAny.stunCooldown = STUN_COOLDOWN;

      const distToTarget = distance(player.x, player.y, targetX, targetY);
      const prevDist = pAny.prevDistToCarrier ?? distToTarget;
      player.fitness += (prevDist - distToTarget) > 0 ? (prevDist - distToTarget) * 2.5 : -0.05;
      player.fitness += distToAtk < STUN_RANGE * 1.5 && ball.ownerId === atk.id ? 1.5 : 0;
      pAny.prevDistToCarrier = distToTarget;
    }
    if (pAny.stunCooldown > 0) pAny.stunCooldown--;
    if (pAny.kickCooldown > 0) pAny.kickCooldown--;
  }

  player.x = Math.max(player.radius, Math.min(PITCH_WIDTH - player.radius, player.x + player.vx));
  player.y = Math.max(player.radius, Math.min(PITCH_HEIGHT - player.radius, player.y + player.vy));
  resolveGoalCageCollisions(player, false);
}

// ─── Step 3: Neural DEF (Phase 3) ────────────────────────────────────────────

function processStep3NeuralDef(player: FootballPlayer, ball: Ball, atk: FootballPlayer | null, maxDist: number) {
  const pAny = player as any;
  const ownGoal = player.team === 'A' ? state!.goals[0] : state!.goals[1];
  const ogx = ownGoal.x + ownGoal.width / 2;
  const ogy = ownGoal.y + ownGoal.height / 2;

  const carrierX = atk ? atk.x : ball.x;
  const carrierY = atk ? atk.y : ball.y;
  const distToCarrier = distance(player.x, player.y, carrierX, carrierY);
  const distToOwnGoal = distance(player.x, player.y, ogx, ogy);
  const carrierHasBall = (atk && ball.ownerId === atk.id) ? 1.0 : 0.0;

  const inputs: number[] = [
    Math.min(1, distToCarrier / maxDist),
    relAngleFrom(player, carrierX, carrierY),
    carrierHasBall,
    Math.min(1, distToOwnGoal / maxDist),
    relAngleFrom(player, ogx, ogy),
    (pAny.stunCooldown ?? 0) > 0 ? 1.0 : 0.0,
    (pAny.kickCooldown ?? 0) > 0 ? 1.0 : 0.0
  ];

  const outputs = feedForward(inputs, player.brain);

  const speedNorm = Math.max(0, Math.min(1, (outputs[0] + 1) / 2));
  const turn = Math.max(-1, Math.min(1, outputs[1]));
  const isStunned = (player.dashStunTimer ?? 0) > 0;
  player.angle += turn * 0.28 * (isStunned ? 0.1 : 1.0);
  while (player.angle > Math.PI) player.angle -= Math.PI * 2;
  while (player.angle < -Math.PI) player.angle += Math.PI * 2;
  let speed = speedNorm * PLAYER_SPEED * (isStunned ? 0.1 : 1.0);

  // Stun (output[2])
  if (!pAny.stunCooldown) pAny.stunCooldown = 0;
  if (outputs[2] > 0.5 && pAny.stunCooldown <= 0) {
    pAny.wantsStun = true;
    pAny.stunCooldown = STUN_COOLDOWN;
  } else {
    pAny.wantsStun = false;
  }
  if (pAny.stunCooldown > 0) pAny.stunCooldown--;

  // Kick (output[3])
  if (!pAny.kickCooldown) pAny.kickCooldown = 0;
  if (outputs[3] > 0.5 && pAny.kickCooldown <= 0) {
    pAny.wantsKick = true;
    pAny.kickCooldown = KICKAWAY_COOLDOWN;
  } else {
    pAny.wantsKick = false;
  }
  if (pAny.kickCooldown > 0) pAny.kickCooldown--;

  const desiredVx = Math.cos(player.angle) * speed;
  const desiredVy = Math.sin(player.angle) * speed;
  player.vx = (pAny.prevVx ?? desiredVx) + (desiredVx - (pAny.prevVx ?? desiredVx)) * 0.25;
  player.vy = (pAny.prevVy ?? desiredVy) + (desiredVy - (pAny.prevVy ?? desiredVy)) * 0.25;
  pAny.prevVx = player.vx;
  pAny.prevVy = player.vy;

  player.x = Math.max(player.radius, Math.min(PITCH_WIDTH - player.radius, player.x + player.vx));
  player.y = Math.max(player.radius, Math.min(PITCH_HEIGHT - player.radius, player.y + player.vy));
  resolveGoalCageCollisions(player, false);

  // Fitness shaping
  const halfFieldX = PITCH_WIDTH / 2;
  const ownHalf = ogx < halfFieldX;
  const atkInOwnHalf = atk && (ownHalf ? atk.x < halfFieldX : atk.x > halfFieldX);

  if (atk && ball.ownerId === atk.id && atkInOwnHalf) {
    const prevDist = pAny.prevDistToCarrier ?? distToCarrier;
    const prog = prevDist - distToCarrier;
    player.fitness += prog > 0 ? prog * 3.0 : -0.2;
    if (distToCarrier < STUN_RANGE * 2) player.fitness += 1.5;
    if (distToCarrier < STUN_RANGE)     player.fitness += 3.0;
    pAny.prevDistToCarrier = distToCarrier;
  } else {
    if (distToOwnGoal > 200) player.fitness -= 0.005;
    pAny.prevDistToCarrier = undefined;
  }

  // Penalty for crossing half-field
  const crossedHalf = ownHalf ? (player.x > halfFieldX) : (player.x < halfFieldX);
  if (crossedHalf) {
    const overBy = ownHalf ? (player.x - halfFieldX) : (halfFieldX - player.x);
    player.fitness -= 1.5 * (overBy / 100);
  }

  // Anti-spin
  const prevAngle = pAny.prevAngle ?? player.angle;
  let aDelta = player.angle - prevAngle;
  while (aDelta > Math.PI) aDelta -= Math.PI * 2;
  while (aDelta < -Math.PI) aDelta += Math.PI * 2;
  pAny.cumulAngle = (pAny.cumulAngle ?? 0) + Math.abs(aDelta);
  if (pAny.cumulAngle > Math.PI * 1.5 && distToCarrier > 100) {
    player.fitness -= 25;
    pAny.cumulAngle = 0;
  }
  pAny.prevAngle = player.angle;
  player.fitness -= 0.005;
}

// ─── Step 3: Main Physics Loop ────────────────────────────────────────────────

function updateStep3Physics() {
  if (!state || !config) return;
  const maxDist = Math.sqrt(PITCH_WIDTH ** 2 + PITCH_HEIGHT ** 2);
  const popSize = config.populationSize || 15;
  const defPhase = getStep3DefPhase();

  // Ball physics (unowned)
  for (let b = 0; b < state.balls.length; b++) {
    const ball = state.balls[b];
    if (!ball || ball.isActive === false) continue;
    if ((ball as any).kickedLockoutTimer > 0) (ball as any).kickedLockoutTimer--;

    if (ball.ownerId === null) {
      ball.x += ball.vx; ball.y += ball.vy;
      ball.vx *= BALL_FRICTION; ball.vy *= BALL_FRICTION;

      const bSpeed = Math.sqrt(ball.vx**2 + ball.vy**2);
      if (bSpeed > BALL_MAX_SPEED * 2) {
        ball.vx = (ball.vx / bSpeed) * BALL_MAX_SPEED * 2;
        ball.vy = (ball.vy / bSpeed) * BALL_MAX_SPEED * 2;
      }

      if (ball.y - ball.radius < 15) { ball.y = 15 + ball.radius; ball.vy = Math.abs(ball.vy) * 1.1 + 1.5; }
      else if (ball.y + ball.radius > PITCH_HEIGHT - 15) { ball.y = PITCH_HEIGHT - 15 - ball.radius; ball.vy = -Math.abs(ball.vy) * 1.1 - 1.5; }

      const goalTop = PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT;
      const goalBottom = PITCH_HEIGHT / 2 + GOAL_HALF_HEIGHT;
      if (ball.y < goalTop || ball.y > goalBottom) {
        if (ball.x - ball.radius < 15) { ball.x = 15 + ball.radius; ball.vx = Math.abs(ball.vx) * 1.1 + 1.5; }
        else if (ball.x + ball.radius > PITCH_WIDTH - 15) { ball.x = PITCH_WIDTH - 15 - ball.radius; ball.vx = -Math.abs(ball.vx) * 1.1 - 1.5; }
      }
      resolveGoalCageCollisions(ball, true);
    }
  }

  // Per-pair update
  for (let i = 0; i < popSize; i++) {
    const atk = population.find(p => (p as any).pairIdx === i && p.role === 'attacker');
    const def = population.find(p => (p as any).pairIdx === i && p.role === 'defender');
    const ball = state.balls[i];
    if (!atk || !def || !ball) continue;

    if (atk.dashStunTimer && atk.dashStunTimer > 0) atk.dashStunTimer--;
    if (def.dashStunTimer && def.dashStunTimer > 0) def.dashStunTimer--;
    const defAny = def as any;
    if (defAny.showKickEffect && defAny.showKickEffect > 0) defAny.showKickEffect--;

    // DEF reset delay
    if (defAny.s3defResetDelay && defAny.s3defResetDelay > 0) {
      defAny.s3defResetDelay--;
      def.vx = 0; def.vy = 0;
      if (defAny.s3defResetDelay === 0) resetStep3Pair(i);
      continue;
    }

    // ATK neural logic
    processStep3Atk(atk, ball, def, maxDist);

    // DEF logic (scripted phases 1-3, neural phase 4)
    if (defPhase === 1) {
      processStep3ScriptedDef(def, ball, atk, 1);
    } else if (defPhase === 2) {
      processStep3ScriptedDef(def, ball, atk, 2);
    } else if (defPhase === 3) {
      processStep3ScriptedDef(def, ball, atk, 3);
    } else {
      processStep3NeuralDef(def, ball, atk, maxDist);
    }

    // Apply DEF stun skill
    if (defAny.wantsStun) {
      defAny.wantsStun = false;
      const distToAtk = distance(def.x, def.y, atk.x, atk.y);
      if (distToAtk < STUN_RANGE) {
        atk.dashStunTimer = STUN_DURATION;
        atk.isSprinting = false; atk.isDashing = false;
        atk.vx = 0; atk.vy = 0;
        atk.fitness -= 5;
        def.fitness += 80;
        defAny.showKickEffect = 20;
        // BUG FIX: release ball so DEF can pick it up and kick away
        if (ball.ownerId === atk.id) {
          ball.ownerId = null;
          ball.vx = 0; ball.vy = 0;
        }
      }
    }

    // Apply DEF kick-away skill (when DEF has ball)
    if (defAny.wantsKick && ball.ownerId === def.id) {
      defAny.wantsKick = false;
      ball.ownerId = null;
      const ownGoal = def.team === 'A' ? state!.goals[0] : state!.goals[1];
      const ownGoalCenterX = ownGoal.x + ownGoal.width / 2;
      const kickBase = ownGoalCenterX < PITCH_WIDTH / 2 ? 0 : Math.PI;
      const kickAngle = kickBase + (Math.random() - 0.5) * 0.8;
      ball.vx = Math.cos(kickAngle) * 14;
      ball.vy = Math.sin(kickAngle) * 14;
      (ball as any).kickedLockoutTimer = KICKAWAY_LOCKOUT;
      def.fitness += 150;
      defAny.showKickEffect = 20;
      (state! as any).s3DefClearances = ((state! as any).s3DefClearances ?? 0) + 1;
    }

    // DEF loose ball pickup
    const ballLocked = ((ball as any).kickedLockoutTimer ?? 0) > 0;
    if (!ballLocked && ball.ownerId === null) {
      const defDistBall = distance(def.x, def.y, ball.x, ball.y);
      if (defDistBall < PLAYER_RADIUS + BALL_RADIUS + 6) {
        ball.ownerId = def.id;
        def.fitness += 100;
      }
    }

    // DEF carrying ball — reward progress toward safety (own half)
    if (ball.ownerId === def.id) {
      const ownGoal = def.team === 'A' ? state!.goals[0] : state!.goals[1];
      const ownGoalCenterX = ownGoal.x + ownGoal.width / 2;
      const carriedTowardSafety = ownGoalCenterX < PITCH_WIDTH / 2 ? (def.vx > 0) : (def.vx < 0);
      if (carriedTowardSafety) def.fitness += 0.5;

      // DEF own-goal check (penalty if def scores in own goal)
      let defOwnGoal = false;
      if (def.team === 'A') defOwnGoal = ball.x < 35 && ball.y > 300 && ball.y < 400;
      else defOwnGoal = ball.x > 1085 && ball.y > 300 && ball.y < 400;
      if (defOwnGoal && !(ball as any).goalScored) {
        (ball as any).goalScored = true;
        def.fitness -= 200;
        atk.fitness += 500;
        (state! as any).s3AtkGoals = ((state! as any).s3AtkGoals ?? 0) + 1;
        defAny.s3defResetDelay = 45;
      }
    }

    // Player vs Player collision
    resolvePlayerPlayerCollision(atk, def);

    // ATK border penalty
    const inBorderAtk = isPlayerInBorderZone(atk.x, atk.y);
    if (inBorderAtk) {
      atk.fitness -= 0.02;
      atk.vx *= 0.6; atk.vy *= 0.6;
      if (ball.ownerId === atk.id) {
        atk.fitness -= 30;
        atk.lostBallLockoutTimer = 80;
        atk.dashStunTimer = 35;
        atk.isSprinting = false; atk.isDashing = false;
        ball.ownerId = null;
        (ball as any).kickedLockoutTimer = 85;
        let vx = 0, vy = 0;
        if (ball.y < 80) { vy = 4.5 + Math.random() * 4.5; vx = (Math.random() - 0.5) * 8; }
        else if (ball.y > PITCH_HEIGHT - 80) { vy = -(4.5 + Math.random() * 4.5); vx = (Math.random() - 0.5) * 8; }
        else if (ball.x < 80) { vx = 4.5 + Math.random() * 4.5; vy = (Math.random() < 0.5 ? 1 : -1) * (3 + Math.random() * 5); }
        else { vx = -(4.5 + Math.random() * 4.5); vy = (Math.random() < 0.5 ? 1 : -1) * (3 + Math.random() * 5); }
        const spd = Math.sqrt(vx*vx + vy*vy);
        ball.vx = (vx/(spd||1)) * 8.5; ball.vy = (vy/(spd||1)) * 8.5;
      }
    }

    // Wall bounds (ATK)
    if (atk.x < atk.radius) { atk.x = atk.radius; atk.vx = Math.abs(atk.vx)*0.4+0.5; }
    else if (atk.x > PITCH_WIDTH - atk.radius) { atk.x = PITCH_WIDTH - atk.radius; atk.vx = -Math.abs(atk.vx)*0.4-0.5; }
    if (atk.y < atk.radius) { atk.y = atk.radius; atk.vy = Math.abs(atk.vy)*0.4+0.5; }
    else if (atk.y > PITCH_HEIGHT - atk.radius) { atk.y = PITCH_HEIGHT - atk.radius; atk.vy = -Math.abs(atk.vy)*0.4-0.5; }

    // Wall bounds (DEF)
    if (isPlayerInBorderZone(def.x, def.y)) { def.fitness -= 0.02; def.vx *= 0.6; def.vy *= 0.6; }
    if (def.x < def.radius) { def.x = def.radius; def.vx = Math.abs(def.vx)*0.4+0.5; }
    else if (def.x > PITCH_WIDTH - def.radius) { def.x = PITCH_WIDTH - def.radius; def.vx = -Math.abs(def.vx)*0.4-0.5; }
    if (def.y < def.radius) { def.y = def.radius; def.vy = Math.abs(def.vy)*0.4+0.5; }
    else if (def.y > PITCH_HEIGHT - def.radius) { def.y = PITCH_HEIGHT - def.radius; def.vy = -Math.abs(def.vy)*0.4-0.5; }
  }

  // Corner camping law
  let anyNearWall = false;
  for (let b = 0; b < state.balls.length; b++) {
    const ball = state.balls[b];
    if (!ball || ball.ownerId === null) continue;
    if (ball.x < 55 || ball.x > PITCH_WIDTH - 55 || ball.y < 55 || ball.y > PITCH_HEIGHT - 55) {
      anyNearWall = true;
      ballCornerCampingTimer++;
      if (ballCornerCampingTimer >= 150) {
        const camper = population.find(p => p.id === ball.ownerId);
        if (camper) {
          camper.fitness -= 600;
          camper.lostBallLockoutTimer = 90;
          camper.vx = 0; camper.vy = 0;
          camper.dashStunTimer = 45;
          camper.isSprinting = false; camper.isDashing = false;
        }
        ball.ownerId = null;
        const ang = Math.atan2(PITCH_HEIGHT/2 - ball.y, PITCH_WIDTH/2 - ball.x);
        ball.vx = Math.cos(ang) * 8.5; ball.vy = Math.sin(ang) * 8.5;
        ballCornerCampingTimer = 0;
      }
      break;
    }
  }
  if (!anyNearWall) ballCornerCampingTimer = 0;
}

// ─── Input computation ────────────────────────────────────────────────────────
function computeInputs(
  player: FootballPlayer,
  ball: Ball,
  opponent: FootballPlayer | null,
  scoringGoal: { x: number; y: number; width: number; height: number },
  ownGoal: { x: number; y: number; width: number; height: number },
  step: number
): number[] {
  const pAny = player as any;
  const maxDist = Math.sqrt(PITCH_WIDTH ** 2 + PITCH_HEIGHT ** 2);

  function relAngle(targetX: number, targetY: number): number {
    let a = Math.atan2(targetY - player.y, targetX - player.x) - player.angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a / Math.PI; // [-1, 1]
  }

  const distToBall = distance(player.x, player.y, ball.x, ball.y);

  if (step === 1) {
    const inputs = new Array(STEP1_INPUTS).fill(0);
    inputs[0] = Math.min(1, distToBall / maxDist);
    inputs[1] = relAngle(ball.x, ball.y);
    return inputs;
  }

  if (player.role === 'attacker') {
    const inputs = new Array(ATK_INPUTS).fill(0);
    // [0] dist to ball (normalised)
    inputs[0] = Math.min(1, distToBall / maxDist);
    // [1] relative angle to ball
    inputs[1] = relAngle(ball.x, ball.y);
    // [2] hasBall — KEY two-phase signal (0 = fetch ball, 1 = drive to goal)
    inputs[2] = ball.ownerId === player.id ? 1.0 : 0.0;
    // [3-4] scoring goal
    const gx = scoringGoal.x + scoringGoal.width / 2;
    const gy = scoringGoal.y + scoringGoal.height / 2;
    inputs[3] = Math.min(1, distance(player.x, player.y, gx, gy) / maxDist);
    inputs[4] = relAngle(gx, gy);
    // [5-8] nearest opponent position + velocity
    const oppX = opponent ? opponent.x : (player.team === 'A' ? PITCH_WIDTH * 0.75 : PITCH_WIDTH * 0.25);
    const oppY = opponent ? opponent.y : PITCH_HEIGHT / 2;
    const oppVx = opponent ? opponent.vx : 0;
    const oppVy = opponent ? opponent.vy : 0;
    inputs[5] = Math.min(1, distance(player.x, player.y, oppX, oppY) / maxDist);
    inputs[6] = relAngle(oppX, oppY);
    inputs[7] = Math.max(-1, Math.min(1, oppVx / (PLAYER_SPEED * 2.5)));
    inputs[8] = Math.max(-1, Math.min(1, oppVy / (PLAYER_SPEED * 2.5)));
    // [9-10] skill cooldowns
    inputs[9]  = (pAny.sprintCooldown ?? 0) > 0 ? 1.0 : 0.0;
    inputs[10] = (player.dashCooldown ?? 0)  > 0 ? 1.0 : 0.0;
    // [11] own speed magnitude (helps net judge when to sprint)
    inputs[11] = Math.min(1, Math.sqrt(player.vx ** 2 + player.vy ** 2) / (PLAYER_SPEED * 2.5));
    return inputs;
  } else {
    // Defender — 10 inputs focused on approach + stun
    const inputs = new Array(DEF_INPUTS).fill(0);
    // [0] distance to opponent (ball carrier or dummy ATK)
    const carrier = ball.ownerId ? population.find(p => p.id === ball.ownerId) ?? null : null;
    const oppTarget = opponent ?? carrier;
    const tX = oppTarget ? oppTarget.x : ball.x;
    const tY = oppTarget ? oppTarget.y : ball.y;
    inputs[0] = Math.min(1, distance(player.x, player.y, tX, tY) / maxDist);
    // [1] relative angle to opponent
    inputs[1] = relAngle(tX, tY);
    // [2] opponent is carrying ball (1 = yes, 0 = no)
    inputs[2] = (oppTarget && ball.ownerId === oppTarget.id) ? 1.0 : 0.0;
    // [3] opponent is in DEF's own half (1 = danger zone, should engage)
    const ownGoalX = ownGoal.x + ownGoal.width / 2;
    const halfFieldX = PITCH_WIDTH / 2;
    const oppInOwnHalf = ownGoalX < halfFieldX ? (tX < halfFieldX) : (tX > halfFieldX);
    inputs[3] = oppInOwnHalf ? 1.0 : 0.0;
    // [4-5] direction + distance to own goal (avoid leaving it unguarded)
    const ogx = ownGoal.x + ownGoal.width / 2;
    const ogy = ownGoal.y + ownGoal.height / 2;
    inputs[4] = Math.min(1, distance(player.x, player.y, ogx, ogy) / maxDist);
    inputs[5] = relAngle(ogx, ogy);
    // [6] stun cooldown (0 = ready, 1 = on CD)
    inputs[6] = (pAny.stunCooldown ?? 0) > 0 ? 1.0 : 0.0;
    // [7-8] distance + angle to ball (loose ball awareness)
    inputs[7] = Math.min(1, distToBall / maxDist);
    inputs[8] = relAngle(ball.x, ball.y);
    // [9] own speed magnitude
    inputs[9] = Math.min(1, Math.sqrt(player.vx ** 2 + player.vy ** 2) / (PLAYER_SPEED * 2.5));
    return inputs;
  }
}

// ─── Output application ───────────────────────────────────────────────────────
function applyOutputs(player: FootballPlayer, outputs: number[], opponent: FootballPlayer | null, step: number): void {
  const pAny = player as any;

  // Output[0] = speed (tanh [-1,1] → rescale to [0,1])
  // Output[1] = turn  (tanh [-1,1])
  const speedNorm = Math.max(0, Math.min(1, (outputs[0] + 1) / 2));
  const turn = Math.max(-1, Math.min(1, outputs[1]));
  const MAX_TURN = 0.28; // Increased from 0.1 to 0.28 for high agility and instant turnarounds

  // Skip movement if stunned
  const isStunned = (player.dashStunTimer ?? 0) > 0;
  const stunFactor = isStunned ? 0.1 : 1.0;

  player.angle += turn * MAX_TURN * stunFactor;
  while (player.angle > Math.PI) player.angle -= Math.PI * 2;
  while (player.angle < -Math.PI) player.angle += Math.PI * 2;

  let speed = speedNorm * PLAYER_SPEED * stunFactor;

  if (step === 1) {
    player.vx = Math.cos(player.angle) * speed;
    player.vy = Math.sin(player.angle) * speed;
    return;
  }

  if (player.role === 'attacker') {
    // 3 meters range check for skills (3 meters ≈ 150px)
    let isOpponentClose = false;
    if (opponent) {
      const distToOpp = distance(player.x, player.y, opponent.x, opponent.y);
      isOpponentClose = distToOpp < 150;
    }

    // outputs[2] = sprint activate
    // outputs[3] = dash activate
    const wantsSprint = outputs.length > 2 && outputs[2] > 0.5;
    const wantsDash = outputs.length > 3 && outputs[3] > 0.5;

    // Sprint
    if (!pAny.sprintCooldown) pAny.sprintCooldown = 0;
    if (!pAny.sprintActive) pAny.sprintActive = 0;
    if (wantsSprint && pAny.sprintCooldown <= 0 && pAny.sprintActive <= 0) {
      pAny.sprintActive = SPRINT_DURATION;
      pAny.sprintCooldown = SPRINT_COOLDOWN;
    }
    if (pAny.sprintActive > 0) { pAny.sprintActive--; speed *= 1.8; }
    if (pAny.sprintCooldown > 0) pAny.sprintCooldown--;

    // Dash
    if (!player.dashCooldown) player.dashCooldown = 0;
    if (!player.dashTimer) player.dashTimer = 0;
    if (wantsDash && player.dashCooldown <= 0 && !player.isDashing) {
      player.isDashing = true;
      player.dashTimer = DASH_DURATION;
      player.dashCooldown = DASH_COOLDOWN;
    }
    if (player.isDashing) {
      speed *= 2.5;
      player.dashTimer = (player.dashTimer ?? 1) - 1;
      if ((player.dashTimer ?? 0) <= 0) player.isDashing = false;
    }
    if ((player.dashCooldown ?? 0) > 0) player.dashCooldown = (player.dashCooldown ?? 0) - 1;

  } else {
    // Defender
    // outputs[2] = stun activate
    // outputs[3] = kick activate
    // outputs[4] = kick direction
    const wantsStun = outputs.length > 2 && outputs[2] > 0.5;
    const wantsKick = outputs.length > 3 && outputs[3] > 0.5;
    const kickDir = outputs.length > 4 ? outputs[4] : 0;

    if (!pAny.stunCooldown) pAny.stunCooldown = 0;
    if (!pAny.kickCooldown) pAny.kickCooldown = 0;

    if (wantsStun && pAny.stunCooldown <= 0) {
      pAny.wantsStun = true;
      pAny.stunCooldown = STUN_COOLDOWN;
    } else {
      pAny.wantsStun = false;
    }
    if (pAny.stunCooldown > 0) pAny.stunCooldown--;

    if (wantsKick && pAny.kickCooldown <= 0) {
      pAny.wantsKick = true;
      pAny.wantsKickDir = kickDir;
      pAny.kickCooldown = KICKAWAY_COOLDOWN;
    } else {
      pAny.wantsKick = false;
    }
    if (pAny.kickCooldown > 0) pAny.kickCooldown--;
  }

    player.vx = Math.cos(player.angle) * speed;
    player.vy = Math.sin(player.angle) * speed;
}

function applyScriptedDefender(
  player: FootballPlayer,
  ball: Ball,
  opponent: FootballPlayer | null,
  scoringGoal: { x: number; y: number; width: number; height: number },
  ownGoal: { x: number; y: number; width: number; height: number }
): void {
  const pAny = player as any;
  const ogx = ownGoal.x + ownGoal.width / 2;
  const ogy = ownGoal.y + ownGoal.height / 2;
  const sgx = scoringGoal.x + scoringGoal.width / 2;
  const sgy = scoringGoal.y + scoringGoal.height / 2;

  if (pAny.patrolDir === undefined) pAny.patrolDir = Math.random() < 0.5 ? -1 : 1;

  const patrolX = ogx < PITCH_WIDTH / 2 ? ogx + 120 : ogx - 120;
  const patrolYMin = ogy - 160;
  const patrolYMax = ogy + 160;
  let targetY = player.y + pAny.patrolDir * 2.2;
  if (targetY < patrolYMin) { targetY = patrolYMin; pAny.patrolDir = 1; }
  if (targetY > patrolYMax) { targetY = patrolYMax; pAny.patrolDir = -1; }

  const dx = patrolX - player.x;
  const dy = targetY - player.y;
  player.angle = Math.atan2(dy, dx);
  const speed = PLAYER_SPEED * 0.4; // Nerfed from 0.6x to 0.4x to help ATK learn to dribble and score!
  player.vx = Math.cos(player.angle) * speed;
  player.vy = Math.sin(player.angle) * speed;

  if (!pAny.stunCooldown) pAny.stunCooldown = 0;
  if (!pAny.kickCooldown) pAny.kickCooldown = 0;
  pAny.wantsStun = false;
  pAny.wantsKick = false;

  const scriptedStunRange = STUN_RANGE * 0.7;
  if (opponent && ball.ownerId === opponent.id && pAny.stunCooldown <= 0 && distance(player.x, player.y, opponent.x, opponent.y) < scriptedStunRange) {
    pAny.wantsStun = true;
    pAny.stunCooldown = STUN_COOLDOWN;
  }
  if (pAny.stunCooldown > 0) pAny.stunCooldown--;

  if (ball.ownerId === player.id && pAny.kickCooldown <= 0) {
    const kickAngle = Math.atan2(sgy - player.y, sgx - player.x);
    let rel = kickAngle - player.angle;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    pAny.wantsKick = true;
    pAny.wantsKickDir = rel / Math.PI;
    pAny.kickCooldown = KICKAWAY_COOLDOWN;
  }
  if (pAny.kickCooldown > 0) pAny.kickCooldown--;
}

function applyDummyAttacker(
  player: FootballPlayer,
  scoringGoal: { x: number; y: number; width: number; height: number }
): void {
  // Respect stun: when frozen, stay still so DEF can see the effect
  if ((player.dashStunTimer ?? 0) > 0) {
    player.vx = 0;
    player.vy = 0;
    return;
  }

  // Two-phase curriculum speed for dummy attacker in Step 2:
  // Phase 1: If defStunAvg < 7, all defenders chase a single moving dummy carrying the ball (50% speed)
  // Phase 2: Once defStunAvg >= 7, switch to curriculum-based speed (40% / 65% / 100%)
  let speedFactor: number;
  const d = step2DefStunAvg;
  if (d < 7) {
    speedFactor = 0.50; // Phase 1: moderate chase speed (50%)
  } else {
    // Phase 2: curriculum difficulty scaling
    if (d < 8)       speedFactor = 0.40;
    else if (d < 15) speedFactor = 0.65;
    else             speedFactor = 1.0;
  }

  if (speedFactor <= 0) {
    player.vx = 0;
    player.vy = 0;
    return;
  }

  const gx = scoringGoal.x + scoringGoal.width / 2;
  const gy = scoringGoal.y + scoringGoal.height / 2;
  player.angle = Math.atan2(gy - player.y, gx - player.x);
  const speed = PLAYER_SPEED * speedFactor;
  player.vx = Math.cos(player.angle) * speed;
  player.vy = Math.sin(player.angle) * speed;
}

// ─── ATK Curriculum Spawn Range ──────────────────────────────────────────────
// Returns the X and Y spawn range for ATK in Step 2, scaled by how well ATK scores.
// Starts close to goal so AI discovers scoring reward immediately, then expands gradually.
// X range is generous from the start so ATK never gets stuck in a tiny corridor.
function getStep2AtkSpawnRange(team: 'A' | 'B'): { minX: number; maxX: number; minY: number; maxY: number } {
  const avg = step2AtkGoalsAvg;

  // X: distance from goal opening, grows with competence.
  // Minimum is 25% pitch width so there is always enough room to dribble.
  let maxRangeFromGoal: number;
  if (avg < 2)        maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.25); // 280px — close but not trivial
  else if (avg < 5)   maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.38); // 426px
  else if (avg < 10)  maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.52); // 582px — half field+
  else if (avg < 15)  maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.65); // 728px
  else                maxRangeFromGoal = Math.round(PITCH_WIDTH * 0.82); // ~920px — near full field

  // Y: starts inside goal mouth so agent discovers scoring signal fast.
  const goalCenter = PITCH_HEIGHT / 2;
  let yMargin: number;
  if (avg < 2)        yMargin = GOAL_HALF_HEIGHT * 1.2;   //  60px — within goal mouth
  else if (avg < 5)   yMargin = GOAL_HALF_HEIGHT * 2.5;   // 125px
  else if (avg < 10)  yMargin = GOAL_HALF_HEIGHT * 4.5;   // 225px
  else if (avg < 15)  yMargin = GOAL_HALF_HEIGHT * 7.0;   // 350px
  else                yMargin = GOAL_HALF_HEIGHT * 11.0;  // ~550px ≈ full field

  const minY = Math.max(60, goalCenter - yMargin);
  const maxY = Math.min(PITCH_HEIGHT - 60, goalCenter + yMargin);

  if (team === 'A') {
    const maxX = PITCH_WIDTH - 55;
    const minX = Math.max(60, PITCH_WIDTH - maxRangeFromGoal);
    return { minX, maxX, minY, maxY };
  } else {
    const minX = 55;
    const maxX = Math.min(PITCH_WIDTH - 60, maxRangeFromGoal);
    return { minX, maxX, minY, maxY };
  }
}

function getAttackerSpawn(team: 'A' | 'B', isDummy: boolean) {
  const angle = team === 'A' ? 0 : Math.PI;
  if (isDummy) {
    // Step 2 starts with a shared mannequin-style dummy so all DEFs train
    // against the same kind of carrier first; once the team succeeds enough,
    // each DEF gets its own dummy training lane.
    if (config && config.step === 2 && isStep2DefSharedDummyMode()) {
      const x = team === 'A' ? PITCH_WIDTH * 0.54 : PITCH_WIDTH * 0.46;
      const y = PITCH_HEIGHT / 2 + (team === 'A' ? -64 : 64);
      return { x, y, angle };
    }

    // Later phase: still keep the dummy close to the center lanes, but allow
    // each defender pair to evolve on its own lane.
    const x = team === 'A'
      ? (420 + Math.random() * 140)
      : (560 + Math.random() * 140);
    const y = 140 + Math.random() * (PITCH_HEIGHT - 280);
    return { x, y, angle };
  }

  // Step 2: use curriculum-based spawn range (always pointing at goal)
  if (config && config.step === 2) {
    const range = getStep2AtkSpawnRange(team);
    const x = range.minX + Math.random() * (range.maxX - range.minX);
    const y = range.minY + Math.random() * (range.maxY - range.minY);
    return { x, y, angle };
  }

  const x = team === 'A' ? (160 + Math.random() * 80) : (PITCH_WIDTH - 160 - Math.random() * 80);
  const y = PITCH_HEIGHT / 2 + (Math.random() * 200 - 100);
  return { x, y, angle };
}

function getDefenderSpawn(team: 'A' | 'B') {
  const angle = team === 'A' ? 0 : Math.PI;
  const x = team === 'A' ? (160 + Math.random() * 80) : (PITCH_WIDTH - 160 - Math.random() * 80);
  const y = PITCH_HEIGHT / 2 + (Math.random() * 200 - 100);
  return { x, y, angle };
}

// ─── Init Generation ─────────────────────────────────────────────────────────

function initGeneration(useSavedBrains: boolean) {
  if (!config) return;
  const { step } = config;
  population = [];
  const totalGen = state?.generation || 0;
  const isHofMatchGen = step === 3 && totalGen > 0 && (totalGen % HOF_MATCH_INTERVAL === 0) && hallOfFame.length > 0;

  function getOrCreateBrain(role: 'attacker' | 'defender', savedPool: Array<{brain: NeuralNetwork; personality: PersonalityGene}>): {brain: NeuralNetwork; personality: PersonalityGene} {
    if (useSavedBrains && savedPool.length > 0) {
      // Only use saved brains whose input dimension matches this step's expected size.
      // Prevents step-2 brains (3-input) from contaminating step-1 (2-input) or step-3 (12-input) pools.
      const expectedInputs = step === 1 ? STEP1_INPUTS : (role === 'attacker' ? ATK_INPUTS : DEF_INPUTS);
      const compatible = savedPool.filter(p => p.brain.layers[0]?.inputs === expectedInputs);
      if (compatible.length > 0) {
        const topCount = Math.max(1, Math.floor(compatible.length * 0.3));
        const parent = compatible[Math.floor(Math.random() * topCount)];
        const brain = JSON.parse(JSON.stringify(parent.brain));
        mutate(brain, config!.mutationRate);
        return { brain, personality: mutatePersonality(parent.personality, config!.mutationRate) };
      }
    }
    return { brain: makeBrain(step, role), personality: randomPersonality() };
  }

  if (step === 1) {
    // Dynamic population size in Step 1
    const popSize = config.populationSize || 4;
    // Top 20% are Elite (Inherited exactly), rest are Learning (Mutated)
    const eliteCount = useSavedBrains && attackerSavedBrains.length > 0 ? Math.max(1, Math.floor(popSize * 0.2)) : 0;

    for (let i = 0; i < popSize; i++) {
      let brain: NeuralNetwork;
      let personality: PersonalityGene;
      let isElitePlayer = false;

      if (i < eliteCount) {
        const compatibleElites = attackerSavedBrains.filter(p => p.brain.layers[0]?.inputs === STEP1_INPUTS);
        if (compatibleElites.length > 0) {
          const parent = compatibleElites[Math.min(i, compatibleElites.length - 1)];
          brain = JSON.parse(JSON.stringify(parent.brain));
          personality = { ...parent.personality };
          isElitePlayer = true;
        } else {
          const res = getOrCreateBrain('attacker', attackerSavedBrains);
          brain = res.brain;
          personality = res.personality;
          isElitePlayer = false;
        }
      } else {
        const res = getOrCreateBrain('attacker', attackerSavedBrains);
        brain = res.brain;
        personality = res.personality;
        isElitePlayer = false;
      }

      const x = PITCH_WIDTH / 2 + (Math.random() * 400 - 200);
      const y = PITCH_HEIGHT / 2 + (Math.random() * 300 - 150);
      // Yellow (#fbbf24) for Elite, Blue (#38bdf8) for Learning
      const color = isElitePlayer ? '#fbbf24' : '#38bdf8';
      const p = makePlayer(`p_${i}`, x, y, 'A', color, brain, personality, 'attacker');
      p.isElite = isElitePlayer;
      population.push(p);
    }
  } else if (step === 2) {
    // Step 2 uses a completely different group-based system (see initStep2Generation)
    initStep2Generation(useSavedBrains);
    return; // state is set up inside initStep2Generation
  } else if (step === 3) {
    initStep3Generation(useSavedBrains);
    return;
  } else {
    // Steps 3 & 4: 4 players, 2 pairs, parallel training
    // pair 0: Elite Pair (ATK and DEF are copied exactly without mutation, if available)
    // pair 1: Learning Pair (ATK and DEF are mutated)
    const pairDefs: Array<{role: 'attacker'|'defender', team: 'A'|'B', pairIdx: number}> = [
      { role: 'attacker', team: 'A', pairIdx: 0 },
      { role: 'defender', team: 'B', pairIdx: 0 },
      { role: 'attacker', team: 'B', pairIdx: 1 },
      { role: 'defender', team: 'A', pairIdx: 1 },
    ];

    for (let i = 0; i < 4; i++) {
      const { role, team, pairIdx } = pairDefs[i];
      const pool = role === 'attacker' ? attackerSavedBrains : defenderSavedBrains;

      let brain: NeuralNetwork;
      let personality: PersonalityGene;
      let isElitePlayer = false;

      // HoF match: replace one defender with HoF champion
      if (isHofMatchGen && role === 'defender' && hallOfFame.length > 0) {
        const hof = hallOfFame[Math.floor(Math.random() * Math.min(3, hallOfFame.length))];
        brain = JSON.parse(JSON.stringify(hof.brain));
        personality = { ...hof.personality };
        isElitePlayer = true; // Champion is elite
      } else {
        if (pairIdx === 0 && useSavedBrains && pool.length > 0) {
          // Pair 0 is Elite (Yellow) - inherited exactly
          const parent = pool[0];
          brain = JSON.parse(JSON.stringify(parent.brain));
          personality = { ...parent.personality };
          isElitePlayer = true;
        } else {
          // Pair 1 is Learning (Blue) - mutated
          const res = getOrCreateBrain(role, pool);
          brain = res.brain;
          personality = res.personality;
          isElitePlayer = false;
        }
      }

      // Spawn positions
      let spawnX: number, spawnY: number, angle: number;
      if (role === 'attacker') {
        const spawn = getAttackerSpawn(team, false);
        spawnX = spawn.x;
        spawnY = spawn.y;
        angle = spawn.angle;
      } else {
        const spawn = getDefenderSpawn(team);
        spawnX = spawn.x;
        spawnY = spawn.y;
        angle = spawn.angle;
      }

      // Yellow (#fbbf24) for Elite, Blue (#38bdf8) for Learning
      const color = isElitePlayer ? '#fbbf24' : '#38bdf8';
      const p = makePlayer(`p_${i}`, spawnX, spawnY, team, color, brain, personality, role);
      p.angle = angle;
      p.isElite = isElitePlayer;
      (p as any).pairIdx = pairIdx;
      population.push(p);
    }
  }

  // Setup balls
  const balls: Ball[] = [];
  if (step === 1) {
    // Single ball in field
    let bx: number, by: number;
    do {
      bx = 80 + Math.random() * (PITCH_WIDTH - 160);
      by = 80 + Math.random() * (PITCH_HEIGHT - 160);
    } while (population.some(p => distance(p.x, p.y, bx, by) < 80));
    balls.push({ id: 'b_0', x: bx, y: by, vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: null, isActive: true });
    ballRespawnTimer = 0;
  } else {
    const trainersPerSide = config.populationSize || 15;
    const pairCount = 2; // step 2 returns early; only step 3+ reaches here
    for (let pairIdx = 0; pairIdx < pairCount; pairIdx++) {
      const atk = population.find(p => (p as any).pairIdx === pairIdx && p.role === 'attacker');
      if (!atk) continue;

      // Standard (glued to attacker from start for Steps 2 & 3):
      // ATK trains sút bóng: spawns near the goal with ball in possession (có sẵn bóng)
      // DEF trains cản phá: dummy ATK spawns with ball in possession
      balls.push({
        id: `b_${pairIdx}`,
        x: atk.x + Math.cos(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
        y: atk.y + Math.sin(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2),
        vx: 0, vy: 0, radius: BALL_RADIUS, ownerId: atk.id, isActive: true
      });
    }
  }

  // Setup goals (physically solid goal cages inside the pitch)
  const goals = [
    { team: 'A' as const, x: 10, y: PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT, width: 25, height: GOAL_HALF_HEIGHT * 2 },
    { team: 'B' as const, x: PITCH_WIDTH - 35, y: PITCH_HEIGHT / 2 - GOAL_HALF_HEIGHT, width: 25, height: GOAL_HALF_HEIGHT * 2 }
  ];

  const env = generateEnvironment();

  state = {
    players: population,
    balls,
    goals,
    pitch: { width: PITCH_WIDTH, height: PITCH_HEIGHT },
    generation: (state?.generation || 0) + 1,
    scores: { 
      A: 0, 
      B: 0,
      even: { A: 0, B: 0 },
      odd:  { A: 0, B: 0 },
      defStuns: 0
    } as any,
    ticks: 0,
    bestFitness: 0,
    isHofMatchGen,
    obstacles: step >= 3 ? env.obstacles : [],
    wind: step >= 3 ? env.wind : { x: 0, y: 0 },
    slipperyZones: step >= 3 ? env.slipperyZones : [],
    currentObstacleCount
  };
}

// ─── Evolve Next Generation ──────────────────────────────────────────────────

function evolveNextGeneration() {
  if (!state || !config) return;
  const { step } = config;

  lastGenerationDuration = state.ticks;

  // ── Step 2: own evolution path ────────────────────────────────────────────
  if (step === 2) {
    const popSize = config.populationSize || 15;
    // Collect ALL trained ATK (all pairIdx) and ALL trained DEF — exclude dummies
    const atkPlayers = population.filter(p => p.role === 'attacker' && (p as any).controlMode !== 'step2-dummy');
    const defPlayers = population.filter(p => p.role === 'defender');
    atkPlayers.sort((a, b) => b.fitness - a.fitness);
    defPlayers.sort((a, b) => b.fitness - a.fitness);

    if (atkPlayers.length > 0) {
      attackerSavedBrains = atkPlayers.map(p => ({
        brain: JSON.parse(JSON.stringify(p.brain)),
        personality: { ...(p.personality || randomPersonality()) }
      }));
      state.bestFitness = Math.max(state.bestFitness, atkPlayers[0].fitness);
    }
    if (defPlayers.length > 0) {
      defenderSavedBrains = defPlayers.map(p => ({
        brain: JSON.parse(JSON.stringify(p.brain)),
        personality: { ...(p.personality || randomPersonality()) }
      }));
      state.bestFitness = Math.max(state.bestFitness, defPlayers[0].fitness);
    }

    // EMA curriculum tracking
    const atkGoals = (state as any).s2AtkGoals ?? 0;
    const defClear = (state as any).s2DefClearances ?? 0;
    step2AtkGoalsAvg = step2AtkGoalsAvg * (1 - CURRICULUM_EMA_ALPHA) + (atkGoals / Math.max(1, popSize)) * CURRICULUM_EMA_ALPHA;
    step2DefStunAvg  = step2DefStunAvg  * (1 - CURRICULUM_EMA_ALPHA) + (defClear / Math.max(1, popSize)) * CURRICULUM_EMA_ALPHA;

    roleSwapCounter++;
    initStep2Generation(true);
    return;
  }

  // ── Step 3: 1v1 evolution path ───────────────────────────────────────────
  if (step === 3) {
    const popSize = config.populationSize || 15;
    const atkPlayers = population.filter(p => p.role === 'attacker');
    const defPlayers = population.filter(p => p.role === 'defender');
    atkPlayers.sort((a, b) => b.fitness - a.fitness);
    defPlayers.sort((a, b) => b.fitness - a.fitness);

    if (atkPlayers.length > 0) {
      attackerSavedBrains = atkPlayers.map(p => ({
        brain: JSON.parse(JSON.stringify(p.brain)),
        personality: { ...(p.personality || randomPersonality()) }
      }));
      state.bestFitness = Math.max(state.bestFitness, atkPlayers[0].fitness);
    }
    if (defPlayers.length > 0 && getStep3DefPhase() === 4) {
      defenderSavedBrains = defPlayers.map(p => ({
        brain: JSON.parse(JSON.stringify(p.brain)),
        personality: { ...(p.personality || randomPersonality()) }
      }));
    }

    const atkGoals = (state as any).s3AtkGoals ?? 0;
    step3AtkGoalsAvg = step3AtkGoalsAvg * (1 - CURRICULUM_EMA_ALPHA) + (atkGoals / Math.max(1, popSize)) * CURRICULUM_EMA_ALPHA;

    initStep3Generation(true);
    return;
  }

  // ── Steps 1 & 4+: original evolution path ────────────────────────────────
  if (step >= 2 && lastGenerationDuration < 1500) {
    currentObstacleCount = Math.min(currentObstacleCount + 1, 7);
  }

  roleSwapCounter++;

  const atkPlayers = population.filter(p => p.role === 'attacker' && (p as any).controlMode !== 'dummy-atk');
  const defPlayers = population.filter(p => p.role === 'defender' && (p as any).controlMode !== 'scripted-def');
  atkPlayers.sort((a, b) => b.fitness - a.fitness);
  defPlayers.sort((a, b) => b.fitness - a.fitness);

  if (atkPlayers.length > 0) {
    attackerSavedBrains = atkPlayers.map(p => ({
      brain: JSON.parse(JSON.stringify(p.brain)),
      personality: { ...(p.personality || randomPersonality()) }
    }));
  }
  if (defPlayers.length > 0) {
    defenderSavedBrains = defPlayers.map(p => ({
      brain: JSON.parse(JSON.stringify(p.brain)),
      personality: { ...(p.personality || randomPersonality()) }
    }));
  }

  const bestAtk = atkPlayers.length > 0 ? atkPlayers[0].fitness : 0;
  const bestDef = defPlayers.length > 0 ? defPlayers[0].fitness : 0;
  state.bestFitness = Math.max(bestAtk, bestDef);

  if (atkPlayers[0] && atkPlayers[0].fitness > 0) tryAddToHallOfFame(atkPlayers[0]);
  if (defPlayers[0] && defPlayers[0].fitness > 0) tryAddToHallOfFame(defPlayers[0]);

  // ─── Step 2 Curriculum EMA Update ───────────────────────────────────────────
  if (config.step === 2) {
    const trainersPerSide = config.populationSize || 15;
    // ATK goals: sum of even-pair goals divided by number of ATK pairs
    const atkGoalsThisGen = (state.scores.even?.A ?? 0) + (state.scores.even?.B ?? 0);
    const atkPairCount = trainersPerSide; // one even pair per trainer
    const atkGoalsPerPair = atkPairCount > 0 ? atkGoalsThisGen / atkPairCount : 0;
    step2AtkGoalsAvg = step2AtkGoalsAvg * (1 - CURRICULUM_EMA_ALPHA) + atkGoalsPerPair * CURRICULUM_EMA_ALPHA;

    // DEF clearances: only counted when DEF successfully kicks ball away (not just stun)
    const defClearCount = (state.scores as any).defClearances ?? 0;
    const defClearPerPair = trainersPerSide > 0 ? defClearCount / trainersPerSide : 0;
    step2DefStunAvg = step2DefStunAvg * (1 - CURRICULUM_EMA_ALPHA) + defClearPerPair * CURRICULUM_EMA_ALPHA;
  }

  // Now init next generation using saved brains
  initGeneration(true);
}

// ─── Reset Pair Helper ───────────────────────────────────────────────────────

function resetPair(pairIdx: number) {
  if (!state || !config) return;
  const step = config.step;
  const ball = state.balls[pairIdx] ?? state.balls[0];
  if (!ball) return;

  const atk = state.players.find(p => (p as any).pairIdx === pairIdx && p.role === 'attacker');
  const def = state.players.find(p => (p as any).pairIdx === pairIdx && p.role === 'defender');

  if (atk) {
    const isAtkTrainPair = step === 2 && pairIdx % 2 === 0;
    let spawnX: number;
    let spawnY: number;
    let angle: number;

    if (isAtkTrainPair) {
      // Curriculum-based spawn: closer to goal when ATK is weak, farther as they improve
      const range = getStep2AtkSpawnRange(atk.team);
      spawnX = range.minX + Math.random() * (range.maxX - range.minX);
      spawnY = range.minY + Math.random() * (range.maxY - range.minY);
      angle  = atk.team === 'A' ? 0 : Math.PI;  // Face the goal
    } else {
      const isDummy = (atk as any).controlMode === 'dummy-atk' || (atk as any).controlMode === 'shared-dummy-atk';
      const spawn = getAttackerSpawn(atk.team, isDummy);
      spawnX = spawn.x;
      spawnY = spawn.y;
      angle = spawn.angle;
    }

    atk.x = spawnX;
    atk.y = spawnY;
    atk.vx = 0;
    atk.vy = 0;
    atk.angle = angle;
    atk.lostBallLockoutTimer = 0;
    atk.dashStunTimer = 0;
    atk.isSprinting = false;
    atk.isDashing = false;
    (atk as any).prevDist = undefined;
    (atk as any).prevPlayerGoalDist = undefined;
    (atk as any).prevVx = 0;
    (atk as any).prevVy = 0;
  }

  if (def) {
    const spawn = getDefenderSpawn(def.team);
    def.x = spawn.x;
    def.y = spawn.y;
    def.vx = 0;
    def.vy = 0;
    def.angle = spawn.angle;
    def.lostBallLockoutTimer = 0;
    def.dashStunTimer = 0;
    def.isSprinting = false;
    def.isDashing = false;
    (def as any).prevDist = undefined;
    (def as any).prevDistToCarrier = undefined;
    (def as any).prevVx = 0;
    (def as any).prevVy = 0;
  }

  if (atk) {
    // Standard: ALWAYS glue ball to the attacker upon reset so they restart in possession (có sẵn bóng)
    ball.x = atk.x + Math.cos(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.y = atk.y + Math.sin(atk.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.vx = 0;
    ball.vy = 0;
    ball.ownerId = atk.id;
    ball.isActive = true;
    (ball as any).goalScored = false;
  }
}

// ─── Step 2 Physics Functions ────────────────────────────────────────────────

function relAngleFrom(player: FootballPlayer, tx: number, ty: number): number {
  let a = Math.atan2(ty - player.y, tx - player.x) - player.angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a / Math.PI;
}

function applyStep1StyleMovement(player: FootballPlayer, outputs: number[]) {
  const pAny = player as any;
  const speedNorm = Math.max(0, Math.min(1, (outputs[0] + 1) / 2));
  const turn = Math.max(-1, Math.min(1, outputs[1]));
  player.angle += turn * 0.28;
  while (player.angle > Math.PI) player.angle -= Math.PI * 2;
  while (player.angle < -Math.PI) player.angle += Math.PI * 2;
  const desiredVx = Math.cos(player.angle) * speedNorm * PLAYER_SPEED;
  const desiredVy = Math.sin(player.angle) * speedNorm * PLAYER_SPEED;
  player.vx = (pAny.prevVx ?? desiredVx) + (desiredVx - (pAny.prevVx ?? desiredVx)) * 0.3;
  player.vy = (pAny.prevVy ?? desiredVy) + (desiredVy - (pAny.prevVy ?? desiredVy)) * 0.3;
  pAny.prevVx = player.vx;
  pAny.prevVy = player.vy;
  player.x = Math.max(player.radius, Math.min(PITCH_WIDTH - player.radius, player.x + player.vx));
  player.y = Math.max(player.radius, Math.min(PITCH_HEIGHT - player.radius, player.y + player.vy));
}

// Collide player and ball with floating goal cage
function resolveStep2GoalZoneCollisions(p: { x: number; y: number; vx: number; vy: number; radius: number }, isBall: boolean) {
  const gz = step2GoalZone;
  const goalTop = gz.y;
  const goalBottom = gz.y + gz.height;

  if (p.x > gz.x - p.radius && p.x < gz.x + gz.width + p.radius) {
    if (p.y > goalTop - p.radius && p.y < goalBottom + p.radius) {
      if (p.y <= goalTop && p.y + p.radius > goalTop) {
        p.y = goalTop - p.radius;
        p.vy = -Math.abs(p.vy) * 0.4;
      }
      else if (p.y >= goalBottom && p.y - p.radius < goalBottom) {
        p.y = goalBottom + p.radius;
        p.vy = Math.abs(p.vy) * 0.4;
      }
      else if (p.y > goalTop && p.y < goalBottom) {
        if (isBall) {
          if (p.x + p.radius > gz.x + gz.width) {
            p.x = gz.x + gz.width - p.radius;
            p.vx = -Math.abs(p.vx) * 0.4;
          }
        } else {
          if (p.x < gz.x) {
            p.x = gz.x - p.radius;
            p.vx = -Math.abs(p.vx) * 0.4;
          } else {
            p.x = gz.x + gz.width + p.radius;
            p.vx = Math.abs(p.vx) * 0.4;
          }
        }
      }
    }
  }
}

// Collide player and ball with solid goal cages at the borders (A & B)
function resolveGoalCageCollisions(p: { x: number; y: number; vx: number; vy: number; radius: number }, isBall: boolean) {
  const goalTop = 300;
  const goalBottom = 400;
  
  if (p.x < 35 + p.radius) {
    if (p.y > goalTop && p.y < goalBottom) {
      if (isBall) {
        if (p.x - p.radius < 10) {
          p.x = 10 + p.radius;
          p.vx = Math.abs(p.vx) * 0.4;
        }
        if (p.y - p.radius < goalTop) {
          p.y = goalTop + p.radius;
          p.vy = Math.abs(p.vy) * 0.4;
        } else if (p.y + p.radius > goalBottom) {
          p.y = goalBottom - p.radius;
          p.vy = -Math.abs(p.vy) * 0.4;
        }
      } else {
        p.x = 35 + p.radius;
        p.vx = Math.abs(p.vx) * 0.4;
      }
    } else {
      if (p.y <= goalTop && p.y + p.radius > goalTop) {
        p.y = goalTop - p.radius;
        p.vy = -Math.abs(p.vy) * 0.4;
      } else if (p.y >= goalBottom && p.y - p.radius < goalBottom) {
        p.y = goalBottom + p.radius;
        p.vy = Math.abs(p.vy) * 0.4;
      }
    }
  }

  if (p.x > 1085 - p.radius) {
    if (p.y > goalTop && p.y < goalBottom) {
      if (isBall) {
        if (p.x + p.radius > 1110) {
          p.x = 1110 - p.radius;
          p.vx = -Math.abs(p.vx) * 0.4;
        }
        if (p.y - p.radius < goalTop) {
          p.y = goalTop + p.radius;
          p.vy = Math.abs(p.vy) * 0.4;
        } else if (p.y + p.radius > goalBottom) {
          p.y = goalBottom - p.radius;
          p.vy = -Math.abs(p.vy) * 0.4;
        }
      } else {
        p.x = 1085 - p.radius;
        p.vx = -Math.abs(p.vx) * 0.4;
      }
    } else {
      if (p.y <= goalTop && p.y + p.radius > goalTop) {
        p.y = goalTop - p.radius;
        p.vy = -Math.abs(p.vy) * 0.4;
      } else if (p.y >= goalBottom && p.y - p.radius < goalBottom) {
        p.y = goalBottom + p.radius;
        p.vy = Math.abs(p.vy) * 0.4;
      }
    }
  }
}

function resetStep2AtkPair(player: FootballPlayer, ball: Ball) {
  const range = getStep2AtkSpawnRange(player.team);
  player.x = range.minX + Math.random() * (range.maxX - range.minX);
  player.y = range.minY + Math.random() * (range.maxY - range.minY);
  player.vx = 0;
  player.vy = 0;
  player.angle = player.team === 'A' ? 0 : Math.PI;
  player.lostBallLockoutTimer = 0;
  player.dashStunTimer = 0;
  player.isSprinting = false;
  player.isDashing = false;
  
  const pAny = player as any;
  pAny.prevDist = undefined;
  pAny.prevGoalDist = undefined;
  pAny.prevVx = 0;
  pAny.prevVy = 0;

  // Ball is glued to attacker on reset
  ball.x = player.x + Math.cos(player.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
  ball.y = player.y + Math.sin(player.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
  ball.vx = 0;
  ball.vy = 0;
  ball.ownerId = player.id;
  ball.isActive = true;
  (ball as any).goalScored = false;
  (ball as any).kickedLockoutTimer = 0;
}

function resetStep2DefPair(player: FootballPlayer, ball: Ball, dummy: FootballPlayer) {
  const defTeam = player.team;
  const atkTeam = defTeam === 'A' ? 'B' : 'A';

  // 1. Reset defender position (own half)
  let x: number;
  if (defTeam === 'B') {
    x = PITCH_WIDTH * 0.55 + Math.random() * PITCH_WIDTH * 0.38;
  } else {
    x = PITCH_WIDTH * 0.07 + Math.random() * PITCH_WIDTH * 0.38;
  }
  player.x = x;
  player.y = 60 + Math.random() * (PITCH_HEIGHT - 120);
  player.vx = 0;
  player.vy = 0;
  player.angle = defTeam === 'A' ? 0 : Math.PI;
  player.lostBallLockoutTimer = 0;
  player.dashStunTimer = 0;
  player.isSprinting = false;
  player.isDashing = false;

  const pAny = player as any;
  pAny.prevDistToCarrier = undefined;
  pAny.cumulAngle = 0;

  // 2. Reset dummy position
  let dummyX: number;
  if (defTeam === 'B') {
    dummyX = PITCH_WIDTH * 0.52 + Math.random() * PITCH_WIDTH * 0.40;
  } else {
    dummyX = PITCH_WIDTH * 0.08 + Math.random() * PITCH_WIDTH * 0.40;
  }
  dummy.x = dummyX;
  dummy.y = 60 + Math.random() * (PITCH_HEIGHT - 120);
  dummy.vx = 0;
  dummy.vy = 0;
  dummy.angle = atkTeam === 'A' ? 0 : Math.PI;
  dummy.dashStunTimer = 0;

  const dAny = dummy as any;
  dAny.s2resetDelay = 0;

  // 3. Reset ball (glued to dummy)
  ball.x = dummy.x + Math.cos(dummy.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
  ball.y = dummy.y + Math.sin(dummy.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
  ball.vx = 0;
  ball.vy = 0;
  ball.ownerId = dummy.id;
  ball.isActive = true;
  (ball as any).goalScored = false;
  (ball as any).kickedLockoutTimer = 0;
}

function processStep2Atk(player: FootballPlayer, ball: Ball, maxDist: number) {
  const pAny = player as any;
  if (pAny.s2delay && pAny.s2delay > 0) {
    pAny.s2delay--;
    player.vx = 0; player.vy = 0;
    if (pAny.s2delay === 0) {
      resetStep2AtkPair(player, ball);
    }
    return;
  }

  const scoringGoal = player.team === 'A' ? state!.goals[1] : state!.goals[0];
  const hasBall = ball.ownerId === player.id;
  const locked = ((ball as any).kickedLockoutTimer ?? 0) > 0;

  const goalX = scoringGoal.x + scoringGoal.width / 2;
  const goalY = scoringGoal.y + scoringGoal.height / 2;
  const distToBall = distance(player.x, player.y, ball.x, ball.y);
  const distToGoal = distance(player.x, player.y, goalX, goalY);

  // 5-input network: [distBall, angleBall, hasBall, distGoal, angleGoal]
  // hasBall=0: network learns to chase ball; hasBall=1: network learns to drive to goal
  const inputs = [
    Math.min(1, distToBall / maxDist),
    relAngleFrom(player, ball.x, ball.y),
    hasBall ? 1.0 : 0.0,
    Math.min(1, distToGoal / maxDist),
    relAngleFrom(player, goalX, goalY)
  ];
  applyStep1StyleMovement(player, feedForward(inputs, player.brain));

  // Glue ball to carrier
  if (hasBall) {
    ball.x = player.x + Math.cos(player.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.y = player.y + Math.sin(player.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
    ball.vx = player.vx; ball.vy = player.vy;
  }

  // Pickup loose ball
  if (!hasBall && !locked && ball.ownerId === null) {
    if (distToBall < PLAYER_RADIUS + BALL_RADIUS + 6) {
      ball.ownerId = player.id;
      player.fitness += 30;
      pAny.prevGoalDist = undefined;
    }
  }

  // Goal check
  let isInGoal = false;
  if (player.team === 'A') {
    isInGoal = ball.x > 1085 && ball.y > 300 && ball.y < 400;
  } else {
    isInGoal = ball.x < 35 && ball.y > 300 && ball.y < 400;
  }

  if (hasBall && isInGoal && !(ball as any).goalScored) {
    (ball as any).goalScored = true;
    player.fitness += 500;

    if (player.team === 'A') {
      state!.scores.A++;
      if (state!.scores.even) state!.scores.even.A++;
    } else {
      state!.scores.B++;
      if (state!.scores.even) state!.scores.even.B++;
    }
    (state! as any).s2AtkGoals = ((state! as any).s2AtkGoals ?? 0) + 1;

    pAny.s2delay = 45;
    return;
  }

  // Fitness shaping — only shape toward goal when carrying ball
  if (hasBall) {
    const prevGoalDist = pAny.prevGoalDist ?? distToGoal;
    const prog = prevGoalDist - distToGoal;
    // Reward progress toward goal; penalise retreating
    player.fitness += prog > 0 ? prog * 5.0 : prog * 0.5;
    // Proximity bonus: higher reward the closer to goal
    player.fitness += Math.pow(1 - Math.min(1, distToGoal / maxDist), 2) * 3.0;
    // Facing bonus: reward pointing toward goal
    let relA = Math.atan2(goalY - player.y, goalX - player.x) - player.angle;
    while (relA > Math.PI) relA -= Math.PI * 2;
    while (relA < -Math.PI) relA += Math.PI * 2;
    player.fitness += Math.max(0, Math.cos(relA)) * 1.5;
    pAny.prevGoalDist = distToGoal;
  } else {
    // Without ball: small progress reward toward ball to encourage pickup
    const prevBallDist = pAny.prevDist ?? distToBall;
    const prog = prevBallDist - distToBall;
    player.fitness += prog > 0 ? prog * 1.0 : 0;
    pAny.prevDist = distToBall;
  }

  // Anti-spin: only penalise tight spinning without goal progress (looser threshold)
  const prevAngle = pAny.prevAngle ?? player.angle;
  let aDelta = player.angle - prevAngle;
  while (aDelta > Math.PI) aDelta -= Math.PI * 2;
  while (aDelta < -Math.PI) aDelta += Math.PI * 2;
  pAny.cumulAngle = (pAny.cumulAngle ?? 0) + Math.abs(aDelta);
  if (pAny.cumulAngle > Math.PI * 2.0) {
    player.fitness -= hasBall ? 30 : 10;
    pAny.cumulAngle = 0;
  }
  pAny.prevAngle = player.angle;

  // Tiny time cost — nudges toward efficiency without dominating the reward signal
  player.fitness -= 0.002;
}

function processStep2Def(player: FootballPlayer, defBall: Ball, dummy: FootballPlayer, maxDist: number) {
  const pAny = player as any;
  const dAny = dummy as any;
  // Wait while dummy is respawning
  if (dAny.s2resetDelay && dAny.s2resetDelay > 0) { player.vx = 0; player.vy = 0; return; }

  // DEF is team B (or A, depending on generation swap).
  // Check if dummy is in their own half (defender's half).
  const halfFieldX = PITCH_WIDTH / 2;
  const dummyInHalf = player.team === 'B' ? (dummy.x > halfFieldX) : (dummy.x < halfFieldX);

  if (dummyInHalf) {
    // AI: chase dummy carrier
    const distToCarrier = distance(player.x, player.y, dummy.x, dummy.y);
    const inputs = [
      Math.min(1, distToCarrier / maxDist),
      relAngleFrom(player, dummy.x, dummy.y)
    ];
    applyStep1StyleMovement(player, feedForward(inputs, player.brain));

    // Contact with dummy's ball → CLEARANCE (DEF Team B scores odd.B!)
    if (defBall.ownerId === dummy.id && distToCarrier < STUN_RANGE) {
      player.fitness += 250;
      
      // Increment defender scoreboard
      if (player.team === 'B') {
        state!.scores.B++;
        if (state!.scores.odd) state!.scores.odd.B++;
      } else {
        state!.scores.A++;
        if (state!.scores.odd) state!.scores.odd.A++;
      }
      (state! as any).s2DefClearances = ((state! as any).s2DefClearances ?? 0) + 1;

      // Stun dummy
      dummy.dashStunTimer = STUN_DURATION;
      dummy.vx = 0; dummy.vy = 0;

      // Kick ball away (towards opponent half)
      defBall.ownerId = null;
      const kickAngle = player.team === 'B' ? (Math.PI + (Math.random() - 0.5) * 0.8) : ((Math.random() - 0.5) * 0.8);
      const kickSpeed = 15;
      defBall.vx = Math.cos(kickAngle) * kickSpeed;
      defBall.vy = Math.sin(kickAngle) * kickSpeed;
      (defBall as any).kickedLockoutTimer = 60;
      (player as any).showKickEffect = 20;

      // Start reset delay
      dAny.s2resetDelay = 60;
      return;
    }

    // Shaping
    const prevDist = pAny.prevDistToCarrier ?? distToCarrier;
    const prog = prevDist - distToCarrier;
    player.fitness += prog > 0 ? prog * 3.0 : -0.2;
    player.fitness += Math.pow(1 - Math.min(1, distToCarrier / maxDist), 2) * 3.0;

    const prevAngle = pAny.prevAngle ?? player.angle;
    let aDelta = player.angle - prevAngle;
    while (aDelta > Math.PI) aDelta -= Math.PI * 2;
    while (aDelta < -Math.PI) aDelta += Math.PI * 2;
    pAny.cumulAngle = (pAny.cumulAngle ?? 0) + Math.abs(aDelta);
    if (pAny.cumulAngle > Math.PI * 1.2 && prog <= 0) { player.fitness -= 15; pAny.cumulAngle = 0; }
    pAny.prevAngle = player.angle;
    pAny.prevDistToCarrier = distToCarrier;

  } else {
    // Return to own goal area
    const ownGoalX = player.team === 'B' ? PITCH_WIDTH - 100 : 100;
    const ownGoalY = PITCH_HEIGHT / 2;
    const dx = ownGoalX - player.x;
    const dy = ownGoalY - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 15) {
      player.angle = Math.atan2(dy, dx);
      player.vx = Math.cos(player.angle) * PLAYER_SPEED * 0.5;
      player.vy = Math.sin(player.angle) * PLAYER_SPEED * 0.5;
      player.x = Math.max(player.radius, Math.min(PITCH_WIDTH - player.radius, player.x + player.vx));
      player.y = Math.max(player.radius, Math.min(PITCH_HEIGHT - player.radius, player.y + player.vy));
    } else { player.vx = 0; player.vy = 0; }
    if (d < 150) player.fitness += 0.01;
    pAny.prevDistToCarrier = undefined;
  }
  player.fitness -= 0.005;
}

function updateStep2Physics() {
  if (!state || !config) return;
  const maxDist = Math.sqrt(PITCH_WIDTH ** 2 + PITCH_HEIGHT ** 2);
  const popSize = config.populationSize || 15;
  const isShared = isStep2DefSharedDummyMode();
  const goals = state.goals;

  // ── Ball physics & bounds ──
  for (let b = 0; b < state.balls.length; b++) {
    const ball = state.balls[b];
    if (!ball || ball.isActive === false) continue;

    if ((ball as any).kickedLockoutTimer > 0) (ball as any).kickedLockoutTimer--;
    
    if (ball.ownerId === null) {
      ball.x += ball.vx; ball.y += ball.vy;
      ball.vx *= BALL_FRICTION; ball.vy *= BALL_FRICTION;
      
      // Cap speed
      const bSpeed = Math.sqrt(ball.vx**2 + ball.vy**2);
      if (bSpeed > BALL_MAX_SPEED * 2) {
        ball.vx = (ball.vx / bSpeed) * BALL_MAX_SPEED * 2;
        ball.vy = (ball.vy / bSpeed) * BALL_MAX_SPEED * 2;
      }

      // Outer wall bounces
      if (ball.y - ball.radius < 15) {
        ball.y = 15 + ball.radius; ball.vy = Math.abs(ball.vy) * 1.1 + 1.5;
      } else if (ball.y + ball.radius > PITCH_HEIGHT - 15) {
        ball.y = PITCH_HEIGHT - 15 - ball.radius; ball.vy = -Math.abs(ball.vy) * 1.1 - 1.5;
      }
      
      const goalTop = 300;
      const goalBottom = 400;
      if (ball.y < goalTop || ball.y > goalBottom) {
        if (ball.x - ball.radius < 15) {
          ball.x = 15 + ball.radius; ball.vx = Math.abs(ball.vx) * 1.1 + 1.5;
        } else if (ball.x + ball.radius > PITCH_WIDTH - 15) {
          ball.x = PITCH_WIDTH - 15 - ball.radius; ball.vx = -Math.abs(ball.vx) * 1.1 - 1.5;
        }
      }

      // Real goal cage collisions
      resolveGoalCageCollisions(ball, true);
    }
  }

  // ── Handle dummies: movement + reset timer + ball glue ──
  for (const p of population) {
    if ((p as any).controlMode === 'step2-dummy') {
      const dAny = p as any;
      const pairIdx = dAny.pairIdx;
      const defBall = state.balls[pairIdx];

      if (dAny.s2resetDelay && dAny.s2resetDelay > 0) {
        dAny.s2resetDelay--;
        p.vx = 0; p.vy = 0;
        if (dAny.s2resetDelay === 0) {
          if (isShared) {
            // Reset shared dummy & ball
            const defTeam = state.players.find(x => x.role === 'defender' && (x as any).pairIdx === S2_DEF_PAIR)?.team || 'B';
            const atkTeam = defTeam === 'A' ? 'B' : 'A';
            let dummyX: number;
            if (defTeam === 'B') {
              dummyX = PITCH_WIDTH * 0.52 + Math.random() * PITCH_WIDTH * 0.40;
            } else {
              dummyX = PITCH_WIDTH * 0.08 + Math.random() * PITCH_WIDTH * 0.40;
            }
            p.x = dummyX;
            p.y = 60 + Math.random() * (PITCH_HEIGHT - 120);
            p.vx = 0; p.vy = 0;
            p.angle = atkTeam === 'A' ? 0 : Math.PI;
            p.dashStunTimer = 0;
            if (defBall) {
              defBall.x = p.x + Math.cos(p.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
              defBall.y = p.y + Math.sin(p.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
              defBall.vx = 0; defBall.vy = 0;
              defBall.ownerId = p.id;
              (defBall as any).kickedLockoutTimer = 0;
              (defBall as any).goalScored = false;
            }
            for (const defender of population) {
              if (defender.role === 'defender' && (defender as any).pairIdx === S2_DEF_PAIR) {
                (defender as any).prevDistToCarrier = undefined;
                (defender as any).cumulAngle = 0;
              }
            }
          } else {
            const defender = population.find(x => x.role === 'defender' && (x as any).pairIdx === pairIdx);
            if (defender && defBall) {
              resetStep2DefPair(defender, defBall, p);
            }
          }
        }
      } else {
        // Move dummy towards target goal
        const dummyScoringGoal = p.team === 'A' ? goals[1] : goals[0];
        applyDummyAttacker(p, dummyScoringGoal);
        p.x = Math.max(p.radius, Math.min(PITCH_WIDTH - p.radius, p.x + p.vx));
        p.y = Math.max(p.radius, Math.min(PITCH_HEIGHT - p.radius, p.y + p.vy));
        resolveGoalCageCollisions(p, false);

        // Glue ball to dummy
        if (defBall && defBall.ownerId === p.id) {
          defBall.x = p.x + Math.cos(p.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
          defBall.y = p.y + Math.sin(p.angle) * (PLAYER_RADIUS + BALL_RADIUS - 2);
          defBall.vx = p.vx; defBall.vy = p.vy;
        }

        // Dummy goal check (penalize defender if dummy scores)
        if (defBall && defBall.ownerId === p.id) {
          let dummyGoal = false;
          if (p.team === 'A') {
            dummyGoal = defBall.x > 1085 && defBall.y > 300 && defBall.y < 400;
          } else {
            dummyGoal = defBall.x < 35 && defBall.y > 300 && defBall.y < 400;
          }

          if (dummyGoal && !(defBall as any).goalScored) {
            (defBall as any).goalScored = true;
            if (isShared) {
              for (const defender of population) {
                if (defender.role === 'defender' && (defender as any).pairIdx === S2_DEF_PAIR) {
                  defender.fitness -= 100;
                }
              }
            } else {
              const defender = population.find(x => x.role === 'defender' && (x as any).pairIdx === pairIdx);
              if (defender) defender.fitness -= 100;
            }

            if (p.team === 'A') {
              state.scores.A++;
              if (state.scores.odd) state.scores.odd.A++;
            } else {
              state.scores.B++;
              if (state.scores.odd) state.scores.odd.B++;
            }

            dAny.s2resetDelay = 45; // 45 ticks freeze
          }
        }
      }
    }
  }

  // ── Per-player updates & general collisions ──
  for (let i = 0; i < population.length; i++) {
    const player = population[i];
    const pAny = player as any;
    if (pAny.controlMode === 'step2-dummy') continue;

    // Timers
    if (player.dashStunTimer && player.dashStunTimer > 0) player.dashStunTimer--;
    if (pAny.showKickEffect && pAny.showKickEffect > 0) pAny.showKickEffect--;

    // Process logic
    const pairIdx = pAny.pairIdx;
    if (player.role === 'attacker') {
      const atkBall = state.balls[pairIdx];
      if (atkBall) processStep2Atk(player, atkBall, maxDist);
    } else if (player.role === 'defender') {
      const defBall = state.balls[pairIdx];
      let pairDummy: FootballPlayer | null = null;
      if (isShared) {
        pairDummy = population.find(x => x.id === S2_DUMMY_ID) ?? null;
      } else {
        pairDummy = population.find(x => x.role === 'attacker' && (x as any).pairIdx === pairIdx) ?? null;
      }
      if (defBall && pairDummy) processStep2Def(player, defBall, pairDummy, maxDist);
    }

    // ── Border Penalty Zone & Out-of-bounds Law (Step 2) ──
    const inBorderZone = isPlayerInBorderZone(player.x, player.y);
    if (inBorderZone) {
      player.fitness -= 0.02;
      player.vx *= 0.6;
      player.vy *= 0.6;

      const ball = state.balls[pairIdx];
      if (ball && ball.ownerId === player.id) {
        player.fitness -= 30; // Heavy penalty for out-of-bounds ball loss
        player.lostBallLockoutTimer = 80;
        player.dashStunTimer = 35;
        player.isSprinting = false;
        player.isDashing = false;

        ball.ownerId = null;
        (ball as any).kickedLockoutTimer = 85;

        // Determine a random vector pointing back into the field and away from the goal areas
        let vx = 0;
        let vy = 0;
        if (ball.y < 80) {
          vy = 4.5 + Math.random() * 4.5;
          vx = (Math.random() - 0.5) * 8;
        } else if (ball.y > PITCH_HEIGHT - 80) {
          vy = -(4.5 + Math.random() * 4.5);
          vx = (Math.random() - 0.5) * 8;
        } else if (ball.x < 80) {
          vx = 4.5 + Math.random() * 4.5;
          vy = (Math.random() < 0.5 ? 1 : -1) * (3.0 + Math.random() * 5.0);
        } else {
          vx = -(4.5 + Math.random() * 4.5);
          vy = (Math.random() < 0.5 ? 1 : -1) * (3.0 + Math.random() * 5.0);
        }

        const speed = Math.sqrt(vx * vx + vy * vy);
        ball.vx = (vx / (speed || 1)) * 8.5;
        ball.vy = (vy / (speed || 1)) * 8.5;
      }
    }

    // Outer wall bounds
    let hitWall = false;
    if (player.x < player.radius) { player.x = player.radius; player.vx = Math.abs(player.vx) * 0.4 + 0.5; hitWall = true; }
    else if (player.x > PITCH_WIDTH - player.radius) { player.x = PITCH_WIDTH - player.radius; player.vx = -Math.abs(player.vx) * 0.4 - 0.5; hitWall = true; }
    if (player.y < player.radius) { player.y = player.radius; player.vy = Math.abs(player.vy) * 0.4 + 0.5; hitWall = true; }
    else if (player.y > PITCH_HEIGHT - player.radius) { player.y = PITCH_HEIGHT - player.radius; player.vy = -Math.abs(player.vy) * 0.4 - 0.5; hitWall = true; }
    if (hitWall) player.fitness -= 0.4;

    // Real goal cage collisions
    resolveGoalCageCollisions(player, false);

    // Player vs Player collision
    for (let j = i + 1; j < population.length; j++) {
      resolvePlayerPlayerCollision(player, population[j]);
    }
  }
}

// ─── Update Physics ──────────────────────────────────────────────────────────

function updatePhysics() {
  if (!state || !config) return;
  state.ticks++;
  const step = config.step;

  // Step 2 & 3 use separate physics loops
  if (step === 2) { updateStep2Physics(); return; }
  if (step === 3) { updateStep3Physics(); return; }

  // Decrement ball kicked lockout timers
  for (let b = 0; b < state.balls.length; b++) {
    const ball = state.balls[b];
    if ((ball as any).kickedLockoutTimer && (ball as any).kickedLockoutTimer > 0) {
      (ball as any).kickedLockoutTimer--;
    }
  }

  if (step === 1) {
    const mainBall = state.balls[0];
    if (mainBall && mainBall.isActive === false) {
      ballRespawnTimer--;
      if (ballRespawnTimer <= 0) {
        mainBall.isActive = true;
        mainBall.x = Math.random() * (PITCH_WIDTH - 40) + 20;
        mainBall.y = Math.random() * (PITCH_HEIGHT - 40) + 20;
      }
    }
  }

  const maxDist = Math.sqrt(PITCH_WIDTH ** 2 + PITCH_HEIGHT ** 2);
  const obstacles = state.obstacles || [];
  const wind = state.wind || { x: 0, y: 0 };
  const slipperyZones = state.slipperyZones || [];
  const goals = state.goals;

  for (let i = 0; i < population.length; i++) {
    const player = population[i];
    const pAny = player as any;

    // Determine pair and ball for this player
    const pairIdx = step === 1 ? 0 : (pAny.pairIdx ?? 0);
    const ball = state.balls[pairIdx] ?? state.balls[0];
    if (!ball) continue;

    // Determine opponent (the other player in the same pair)
    let opponent: FootballPlayer | null = null;
    if (step >= 2) {
      opponent = population.find(p => (p as any).pairIdx === pairIdx && p.id !== player.id) ?? null;
    }

    // Determine scoring goal and own goal for this player
    // pair 0 ATK (team A): scoringGoal=goals[1], ownGoal=goals[0]
    // pair 0 DEF (team B): scoringGoal=goals[0], ownGoal=goals[1]
    // pair 1 ATK (team B): scoringGoal=goals[0], ownGoal=goals[1]
    // pair 1 DEF (team A): scoringGoal=goals[1], ownGoal=goals[0]
    const scoringGoal = player.team === 'A' ? goals[1] : goals[0];
    const ownGoal = player.team === 'A' ? goals[0] : goals[1];

    // ── Timer countdowns ──
    if (player.sprintTimer && player.sprintTimer > 0) { player.sprintTimer--; if (player.sprintTimer === 0) player.isSprinting = false; }
    if (player.sprintCooldown && player.sprintCooldown > 0) player.sprintCooldown--;
    if (player.dashTimer && player.dashTimer > 0) { player.dashTimer--; if (player.dashTimer === 0) player.isDashing = false; }
    if (player.dashCooldown && player.dashCooldown > 0) player.dashCooldown--;
    if (player.stealSpeedBoostTimer && player.stealSpeedBoostTimer > 0) player.stealSpeedBoostTimer--;
    if (player.lostBallLockoutTimer && player.lostBallLockoutTimer > 0) player.lostBallLockoutTimer--;
    if (player.dashStunTimer && player.dashStunTimer > 0) player.dashStunTimer--;
    if (pAny.showKickEffect && pAny.showKickEffect > 0) pAny.showKickEffect--;

    // ── Reset Delay Timer (Stun/Freeze players to let ball fly out visually) ──
    if (pAny.resetDelayTimer && pAny.resetDelayTimer > 0) {
      pAny.resetDelayTimer--;
      if (pAny.resetDelayTimer === 0) {
        resetPair(pairIdx);
      }
      player.vx = 0;
      player.vy = 0;
      if (opponent) {
        opponent.vx = 0;
        opponent.vy = 0;
      }
      continue;
    }

    // ── Slippery/Slow zone check ──
    let inSlowZone = false;
    for (const zone of slipperyZones) {
      if (distance(player.x, player.y, zone.x, zone.y) < zone.radius) { inSlowZone = true; break; }
    }

    let distToBall = maxDist;
    if (ball.isActive !== false) {
      distToBall = distance(player.x, player.y, ball.x, ball.y);
    }



    const controlMode = (pAny.controlMode as string | undefined) ?? 'brain';

    if (controlMode === 'scripted-def') {
      applyScriptedDefender(player, ball, opponent, scoringGoal, ownGoal);
    } else if (controlMode === 'dummy-atk' || controlMode === 'shared-dummy-atk') {
      applyDummyAttacker(player, scoringGoal);
    } else {
      // ── Compute inputs ──
      const inputs = computeInputs(player, ball, opponent, scoringGoal, ownGoal, step);

      // ── Feedforward ──
      const outputs = feedForward(inputs, player.brain);

      // ── Apply outputs (movement + skills) ──
      applyOutputs(player, outputs, opponent, step);
    }

    // ── Inertia / Smoothing (lerp velocity) ──
    const isStunned = (player.dashStunTimer ?? 0) > 0;
    const lerpFactor = inSlowZone ? 0.15 : isStunned ? 0.05 : player.isDashing ? 0.6 : 0.25;

    const windNudgeX = ball.ownerId !== player.id ? wind.x * 0.012 : wind.x * 0.004;
    const windNudgeY = ball.ownerId !== player.id ? wind.y * 0.012 : wind.y * 0.004;

    const desiredVx = player.vx; // applyOutputs already sets vx/vy
    const desiredVy = player.vy;
    // We'll apply a lerp from previous velocity toward desired
    // Store previous velocity before overwrite
    const prevVx = pAny.prevVx ?? desiredVx;
    const prevVy = pAny.prevVy ?? desiredVy;
    player.vx = (prevVx + (desiredVx - prevVx) * lerpFactor) + windNudgeX;
    player.vy = (prevVy + (desiredVy - prevVy) * lerpFactor) + windNudgeY;

    if (inSlowZone) {
      player.vx *= 0.55;
      player.vy *= 0.55;
    }

    pAny.prevVx = player.vx;
    pAny.prevVy = player.vy;

    player.x += player.vx;
    player.y += player.vy;

    // Resolve goal cage boundaries for player
    if (step >= 2) {
      resolveGoalCageCollisions(player, false);
    }

    // ── Sticky ball gluing ──
    if (step >= 2 && ball.ownerId === player.id) {
      const personality = player.personality || { aggression: 0.5, riskTolerance: 0.5, pressureThreshold: 100 };
      const glueOffset = PLAYER_RADIUS + BALL_RADIUS - 2 - personality.riskTolerance * 2;
      ball.x = player.x + Math.cos(player.angle) * glueOffset;
      ball.y = player.y + Math.sin(player.angle) * glueOffset;
      ball.vx = player.vx;
      ball.vy = player.vy;
    }

    // ── Border Penalty Zone & Out-of-bounds Law (Steps 2 & 3) ──
    const inBorderZone = (step >= 2) && isPlayerInBorderZone(player.x, player.y);
    if (inBorderZone) {
      player.fitness -= 0.02; // Reduced penalty to encourage exploration
      player.vx *= 0.6;
      player.vy *= 0.6;

      if (ball.ownerId === player.id) {
        player.fitness -= 30; // Heavy penalty for out-of-bounds ball loss
        player.lostBallLockoutTimer = 80;
        player.dashStunTimer = 35;
        player.isSprinting = false;
        player.isDashing = false;

        ball.ownerId = null;
        (ball as any).kickedLockoutTimer = 85; // Ball is untouchable while flying back

        // Determine a random vector pointing back into the field and away from the goal areas
        let vx = 0;
        let vy = 0;
        if (ball.y < 80) {
          // Near top wall: push downwards with random slant
          vy = 4.5 + Math.random() * 4.5;
          vx = (Math.random() - 0.5) * 8;
        } else if (ball.y > PITCH_HEIGHT - 80) {
          // Near bottom wall: push upwards with random slant
          vy = -(4.5 + Math.random() * 4.5);
          vx = (Math.random() - 0.5) * 8;
        } else if (ball.x < 80) {
          // Near left wall: push rightward, slanted up or down to avoid the center right goal
          vx = 4.5 + Math.random() * 4.5;
          vy = (Math.random() < 0.5 ? 1 : -1) * (3.0 + Math.random() * 5.0);
        } else {
          // Near right wall: push leftward, slanted up or down to avoid the center left goal
          vx = -(4.5 + Math.random() * 4.5);
          vy = (Math.random() < 0.5 ? 1 : -1) * (3.0 + Math.random() * 5.0);
        }

        const speed = Math.sqrt(vx * vx + vy * vy);
        ball.vx = (vx / (speed || 1)) * 8.5;
        ball.vy = (vy / (speed || 1)) * 8.5;
      }
    }

    // ── Player wall bounds ──
    let hitWall = false;
    if (player.x < player.radius) { player.x = player.radius; player.vx = Math.abs(player.vx) * 0.4 + 0.5; hitWall = true; }
    else if (player.x > PITCH_WIDTH - player.radius) { player.x = PITCH_WIDTH - player.radius; player.vx = -Math.abs(player.vx) * 0.4 - 0.5; hitWall = true; }
    if (player.y < player.radius) { player.y = player.radius; player.vy = Math.abs(player.vy) * 0.4 + 0.5; hitWall = true; }
    else if (player.y > PITCH_HEIGHT - player.radius) { player.y = PITCH_HEIGHT - player.radius; player.vy = -Math.abs(player.vy) * 0.4 - 0.5; hitWall = true; }
    if (hitWall) player.fitness -= 0.4;

    // ── Player vs Obstacle collision ──
    for (const obs of obstacles) resolvePlayerObstacle(player, obs);

    // ── Player vs Player collision (all steps, between players sharing same ball) ──
    for (let j = i + 1; j < population.length; j++) {
      resolvePlayerPlayerCollision(player, population[j]);
    }

    // ── Ball physics (unowned) — only processed by the primary player for each ball ──
    // step1: single ball, only i=0
    // step2+: one ball per pair, processed by the attacker of the pair
    const isBallPrimaryPlayer = step === 1 ? (i === 0) : (player.role === 'attacker');
    if (ball.isActive !== false && ball.ownerId !== player.id && isBallPrimaryPlayer) {
      // Apply wind to ball
      ball.vx += wind.x * 0.03;
      ball.vy += wind.y * 0.03;

      // Slippery zone: ball barely decelerates inside zone
      let ballInSlippery = false;
      for (const zone of slipperyZones) {
        if (distance(ball.x, ball.y, zone.x, zone.y) < zone.radius) { ballInSlippery = true; break; }
      }
      const ballFriction = ballInSlippery ? 0.999 : BALL_FRICTION;

      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= ballFriction;
      ball.vy *= ballFriction;

      // Cap ball speed
      const bSpeed = Math.sqrt(ball.vx ** 2 + ball.vy ** 2);
      if (bSpeed > BALL_MAX_SPEED * 2) {
        ball.vx = (ball.vx / bSpeed) * BALL_MAX_SPEED * 2;
        ball.vy = (ball.vy / bSpeed) * BALL_MAX_SPEED * 2;
      }

      if (step >= 2) {
        // Bounce off top/bottom pitch walls
        if (ball.y - ball.radius < 15) {
          ball.y = 15 + ball.radius;
          ball.vy = Math.abs(ball.vy) * 1.1 + 1.5;
        } else if (ball.y + ball.radius > PITCH_HEIGHT - 15) {
          ball.y = PITCH_HEIGHT - 15 - ball.radius;
          ball.vy = -Math.abs(ball.vy) * 1.1 - 1.5;
        }

        // Bounces off left/right pitch walls if outside goal Y range
        const goalTop = 300;
        const goalBottom = 400;
        if (ball.y < goalTop || ball.y > goalBottom) {
          if (ball.x - ball.radius < 15) {
            ball.x = 15 + ball.radius;
            ball.vx = Math.abs(ball.vx) * 1.1 + 1.5;
          } else if (ball.x + ball.radius > PITCH_WIDTH - 15) {
            ball.x = PITCH_WIDTH - 15 - ball.radius;
            ball.vx = -Math.abs(ball.vx) * 1.1 - 1.5;
          }
        }

        // Resolve goal cage boundaries for the ball
        resolveGoalCageCollisions(ball, true);
      } else {
        // Step 1: Standard pitch outer wall bounce
        if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx *= -1; }
        else if (ball.x + ball.radius > PITCH_WIDTH) { ball.x = PITCH_WIDTH - ball.radius; ball.vx *= -1; }
        if (ball.y - ball.radius < 0) { ball.y = ball.radius; ball.vy *= -1; }
        else if (ball.y + ball.radius > PITCH_HEIGHT) { ball.y = PITCH_HEIGHT - ball.radius; ball.vy *= -1; }
      }

      // Ball vs Obstacle
      for (const obs of obstacles) resolveBallObstacle(ball, obs);
    }

    // ── Possession & Tackle ──
    const isBallLocked = (ball as any).kickedLockoutTimer && (ball as any).kickedLockoutTimer > 0;
    if (ball.isActive !== false && !isBallLocked) {
      const pDist = distance(player.x, player.y, ball.x, ball.y);
      const minDist = player.radius + ball.radius;
      const dashReach = player.isDashing ? 10 : 0;
      const defenderReach = (player.role === 'defender' && ball.ownerId !== player.id) ? 10 : 0;

      if (pDist < minDist + dashReach + defenderReach) {
        if (step === 1) {
          player.fitness += 10;
          state.scores.A++;
          state.generation++;

          let bx: number, by: number;
          do {
            bx = 80 + Math.random() * (PITCH_WIDTH - 160);
            by = 80 + Math.random() * (PITCH_HEIGHT - 160);
          } while (population.some(p => distance(p.x, p.y, bx, by) < 80));

          ball.x = bx;
          ball.y = by;
          ball.vx = 0;
          ball.vy = 0;
          ball.ownerId = null;
          ball.isActive = true;
          pAny.prevDist = undefined;
        } else {
          if (ball.ownerId === null) {
            {
              // Step 3+: normal pickup
              ball.ownerId = player.id;
              if (player.role === 'defender') {
                player.fitness += 100; // Kept for step 3
              } else {
                player.fitness += 0.5;
              }
            }
          } else if (ball.ownerId !== player.id) {
            const tackleMagnitude = Math.sqrt(player.vx ** 2 + player.vy ** 2);
            const isDashTackle = player.isDashing || tackleMagnitude > PLAYER_SPEED * 1.8;
            const previousOwnerId = ball.ownerId;
            const prevOwner = population.find(p => p.id === previousOwnerId);

            if (isDashTackle) {
              ball.ownerId = null;
              const scatterAngle = player.angle + (Math.random() - 0.5) * Math.PI * 0.6;
              const scatterSpeed = tackleMagnitude * 1.5 + 2;
              ball.vx = Math.cos(scatterAngle) * scatterSpeed;
              ball.vy = Math.sin(scatterAngle) * scatterSpeed;
              player.dashTimer = 0;
              player.isDashing = false;
              player.dashStunTimer = 15;
              player.fitness += player.role === 'defender' ? 80 : 1;
            } else {
              // Step 3+ DEF contacts ATK ball
              if (false) { // placeholder — step 2 handled in updateStep2Physics
              } else {
                ball.ownerId = player.id;
                player.fitness += player.role === 'defender' ? 100 : 1;
                player.stealSpeedBoostTimer = 90;
              }
            }

            if (prevOwner) {
              prevOwner.fitness -= 5;
              prevOwner.lostBallLockoutTimer = 60;
              prevOwner.isSprinting = false;
              prevOwner.isDashing = false;
              prevOwner.sprintTimer = 0;
              prevOwner.dashTimer = 0;
              prevOwner.dashStunTimer = 20;
            }
          }
        }
      } else if (player.isDashing && pDist < minDist + 40) {
        if (ball.ownerId !== player.id) {
          player.dashStunTimer = 25;
          player.isDashing = false;
          player.dashTimer = 0;
          player.stamina = Math.max(0, (player.stamina || 0) - 15);
        }
      }
    }

    // ── Defender STUN skill ──
    if (step >= 2 && player.role === 'defender') {
      const oppInPair = population.find(p => p.id !== player.id && (p as any).pairIdx === pAny.pairIdx);
      if (oppInPair) {
        const distToOpp = distance(player.x, player.y, oppInPair.x, oppInPair.y);
        const shouldStun = pAny.wantsStun && distToOpp < STUN_RANGE;

        if (shouldStun) {
          pAny.wantsStun = false;
          oppInPair.dashStunTimer = STUN_DURATION;
          oppInPair.isSprinting = false;
          oppInPair.isDashing = false;
          oppInPair.vx = 0; oppInPair.vy = 0;
          oppInPair.fitness -= 5;
          player.fitness += 80; // Strong reward for successful stun
          pAny.stunCooldown = STUN_COOLDOWN;

          // (Step 2 stun handled in updateStep2Physics)
        }
      }
    }

    // ── Defender KICK-AWAY skill ──
    if (step >= 2 && player.role === 'defender' && pAny.wantsKick && ball.ownerId === player.id) {
      pAny.wantsKick = false;
      ball.ownerId = null;
      const kickAngle = (pAny.wantsKickDir ?? 0) * Math.PI + player.angle;
      const kickSpeed = 14;
      ball.vx = Math.cos(kickAngle) * kickSpeed;
      ball.vy = Math.sin(kickAngle) * kickSpeed;
      (ball as any).kickedLockoutTimer = KICKAWAY_LOCKOUT;
      player.lostBallLockoutTimer = 30;

      // Reward good clearance (toward opponent half)
      const ownGoalX = ownGoal.x + ownGoal.width / 2;
      const kickedTowardOpponentHalf = ownGoalX < PITCH_WIDTH / 2 ? (ball.vx > 0) : (ball.vx < 0);
      if (kickedTowardOpponentHalf) {
        player.fitness += 10;
      } else {
        player.fitness -= 15;
      }
      pAny.showKickEffect = 20;

      // (Step 3+: kick-away reward — step 2 handled in updateStep2Physics)
    }

    // ── Goal Check ──
    if (step >= 2) {
      const isAttacker = player.role === 'attacker';
      const isDefender = player.role === 'defender';

      let isInGoal = false;
      const atkPlayer = population.find(p => (p as any).pairIdx === pairIdx && p.role === 'attacker');
      const atkTeam = atkPlayer ? atkPlayer.team : 'A';
      
      if (atkTeam === 'A') {
        // Team A attacks goals[1] (right side, x=1085 to 1110)
        isInGoal = ball.x > 1085 && ball.y > 300 && ball.y < 400;
      } else {
        // Team B attacks goals[0] (left side, x=10 to 35)
        isInGoal = ball.x < 35 && ball.y > 300 && ball.y < 400;
      }

      if (isInGoal && isBallPrimaryPlayer && !(ball as any).goalScored) {
        (ball as any).goalScored = true;
        const isEven = pairIdx % 2 === 0;
        
        // Only process goal event from primary player for this pair
        if (isAttacker) {
          player.fitness += 500; // Large reward — goal scoring must dominate the fitness landscape
          if (opponent) opponent.fitness -= 5;
          if (atkTeam === 'A') {
            state.scores.A++;
            if (state.scores.even && isEven) state.scores.even.A++;
            if (state.scores.odd && !isEven) state.scores.odd.A++;
          } else {
            state.scores.B++;
            if (state.scores.even && isEven) state.scores.even.B++;
            if (state.scores.odd && !isEven) state.scores.odd.B++;
          }
        } else if (isDefender) {
          player.fitness -= 5;
          if (opponent) opponent.fitness += 100;
          if (atkTeam === 'A') {
            state.scores.A++;
            if (state.scores.even && isEven) state.scores.even.A++;
            if (state.scores.odd && !isEven) state.scores.odd.A++;
          } else {
            state.scores.B++;
            if (state.scores.even && isEven) state.scores.even.B++;
            if (state.scores.odd && !isEven) state.scores.odd.B++;
          }
        }

        // Set reset delay timer so the ball can roll into the net and bounce!
        pAny.resetDelayTimer = 45;
      }
    }

    // ── Shaping Rewards ──
    if (step === 1) {
      if (ball.isActive !== false) {
        // Small reward per frame if distance decreases
        const prog = (pAny.prevDist ?? distToBall) - distToBall;
        if (prog > 0) player.fitness += 0.2;
        if (prog <= 0 && distToBall < 120) {
          player.fitness -= 0.05 * (1 - distToBall / 120);
        }
        player.fitness -= 0.005; // time penalty

        // Light anti-spin penalty when not making progress
        const prevAngle = pAny.prevAngle ?? player.angle;
        let angleDelta = player.angle - prevAngle;
        while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
        pAny.cumulAngleDelta = (pAny.cumulAngleDelta ?? 0) + Math.abs(angleDelta);
        if (pAny.cumulAngleDelta > Math.PI * 2 && prog <= 0) {
          player.fitness -= 1.0;
          pAny.cumulAngleDelta = 0;
        }
        pAny.prevAngle = player.angle;

        pAny.prevDist = distToBall;
      }
    } else if (player.role === 'attacker') {
      const gx = scoringGoal.x + scoringGoal.width / 2;
      const gy = scoringGoal.y + scoringGoal.height / 2;
      const hasBall = ball.ownerId === player.id;

      if (hasBall) {
        // ── PHASE 2: Drive to goal ────────────────────────────────────────────
        const playerDistToGoal = distance(player.x, player.y, gx, gy);
        const prev = pAny.prevPlayerGoalDist ?? playerDistToGoal;
        const prog = prev - playerDistToGoal;

        // Dense progress reward: every pixel closer to goal counts
        if (prog > 0) {
          player.fitness += prog * 4.0;
        } else {
          player.fitness -= 0.8;
        }

        // Proximity bonus: the closer to goal the better
        const proximityBonus = Math.pow(1 - Math.min(1, playerDistToGoal / maxDist), 2) * 5.0;
        player.fitness += proximityBonus;

        // Facing bonus: reward for pointing at the goal — strongest signal for "don't spin"
        const angleToGoal = Math.atan2(gy - player.y, gx - player.x);
        let relFacingAngle = angleToGoal - player.angle;
        while (relFacingAngle > Math.PI) relFacingAngle -= Math.PI * 2;
        while (relFacingAngle < -Math.PI) relFacingAngle += Math.PI * 2;
        const facingBonus = Math.max(0, Math.cos(relFacingAngle)) * 3.0; // up to 3/tick
        player.fitness += facingBonus;

        // Y-alignment bonus: when close to the goal X-line, reward correct Y
        const goalCenterY = scoringGoal.y + scoringGoal.height / 2;
        const xDistToGoal = Math.abs(player.x - (scoringGoal.x + scoringGoal.width / 2));
        if (xDistToGoal < 400) {
          const yOffset = Math.abs(player.y - goalCenterY);
          const nearFactor = 1 - Math.min(1, xDistToGoal / 400);
          const yAlignBonus = Math.max(0, 1 - yOffset / (GOAL_HALF_HEIGHT * 3)) * 4.0 * nearFactor;
          player.fitness += yAlignBonus;
        }

        // Ball-near-goal-line bonus: reward when ball is inches from crossing
        const goalLineX = scoringGoal.x + (player.team === 'A' ? 0 : scoringGoal.width);
        const ballToLine = Math.abs(ball.x - goalLineX);
        const ballAlignedY = Math.abs(ball.y - goalCenterY) < GOAL_HALF_HEIGHT * 2;
        if (ballAlignedY && ballToLine < 150) {
          player.fitness += (1 - ballToLine / 150) * 5.0; // up to 5/tick when ball is nearly in
        }

        pAny.prevPlayerGoalDist = playerDistToGoal;
        pAny.prevDist = distToBall;
      } else {
        // ── PHASE 1: Fetch the ball ───────────────────────────────────────────
        const prog = (pAny.prevDist ?? distToBall) - distToBall;
        if (prog > 0) {
          player.fitness += prog * 2.0; // Reward every step toward ball
        } else if (distToBall < 140) {
          player.fitness -= 0.3; // Near ball but not picking it — penalize
        }
        pAny.prevPlayerGoalDist = undefined;
      }

      // Time penalty (phase 2 costs more since we want quick scoring)
      player.fitness -= hasBall ? 0.02 : 0.008;

      // Anti-spin: detect if player spins without making progress
      const prevAngle = pAny.prevAngle ?? player.angle;
      let angleDelta = player.angle - prevAngle;
      while (angleDelta >  Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      pAny.cumulAngleDelta = (pAny.cumulAngleDelta ?? 0) + Math.abs(angleDelta);
      const progressCheck = hasBall
        ? (pAny.prevPlayerGoalDist !== undefined
            ? (pAny.prevPlayerGoalDist - distance(player.x, player.y, gx, gy))
            : 0)
        : ((pAny.prevDist ?? distToBall) - distToBall);
      // Stronger anti-spin threshold when holding the ball (should be driving, not spinning)
      const spinThreshold = hasBall ? Math.PI * 0.8 : Math.PI * 1.5;
      const spinPenalty = hasBall ? 50.0 : 20.0;
      if (pAny.cumulAngleDelta > spinThreshold && progressCheck <= 0) {
        player.fitness -= spinPenalty;
        pAny.cumulAngleDelta = 0;
      }
      pAny.prevAngle = player.angle;
      pAny.prevDist = distToBall;

    } else if (player.role === 'defender') {
      const ownGoalX = ownGoal.x + ownGoal.width / 2;
      const halfFieldX = PITCH_WIDTH / 2;
      const carrier = ball.ownerId ? population.find(p => p.id === ball.ownerId) ?? null : null;

      if (carrier && carrier.team !== player.team) {
        const cx = carrier.x, cy = carrier.y;
        const carrierInDefHalf = ownGoalX < halfFieldX ? (cx < halfFieldX) : (cx > halfFieldX);

        if (carrierInDefHalf) {
          // ── ENGAGE: opponent carrying ball in our half ─────────────────────
          const distToCarrier = distance(player.x, player.y, cx, cy);
          const prevDTC = pAny.prevDistToCarrier ?? distToCarrier;
          const prog = prevDTC - distToCarrier;

          // Dense approach reward
          if (prog > 0) player.fitness += prog * 2.5;
          else          player.fitness -= 0.3;

          // Proximity reward: big bonus for being in stun range
          if (distToCarrier < STUN_RANGE * 2) player.fitness += 1.5;
          if (distToCarrier < STUN_RANGE)     player.fitness += 3.0; // About to stun!

          pAny.prevDistToCarrier = distToCarrier;
        } else {
          // Carrier in opponent half — hold position, don't chase
          pAny.prevDistToCarrier = undefined;
          player.fitness -= 0.003;
        }
      } else {
        // No carrier or teammate has ball: hold position near own goal
        const distToGoal = distance(player.x, player.y, ownGoalX, ownGoal.y + ownGoal.height / 2);
        if (distToGoal > 200) player.fitness -= 0.005; // Encourage staying near goal
        pAny.prevDistToCarrier = undefined;
      }

      // Penalty for crossing half-field
      const crossedHalf = ownGoalX < halfFieldX ? (player.x > halfFieldX) : (player.x < halfFieldX);
      if (crossedHalf) {
        const overBy = ownGoalX < halfFieldX ? (player.x - halfFieldX) : (halfFieldX - player.x);
        player.fitness -= 1.5 * (overBy / 100);
      }

      // Anti-spin for DEF
      const prevAngle = pAny.prevAngle ?? player.angle;
      let angleDelta = player.angle - prevAngle;
      while (angleDelta >  Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      pAny.cumulAngleDelta = (pAny.cumulAngleDelta ?? 0) + Math.abs(angleDelta);
      const distProg = (pAny.prevDist ?? distToBall) - distToBall;
      if (pAny.cumulAngleDelta > Math.PI * 1.5 && distToBall > 100 && distProg <= 0) {
        player.fitness -= 25;
        pAny.cumulAngleDelta = 0;
      } else if (distToBall < 100) {
        pAny.cumulAngleDelta = 0;
      }
      pAny.prevAngle = player.angle;

      player.fitness -= 0.005; // time penalty
      pAny.prevDist = distToBall;
    }
  }

  // ── Anti-Corner Camping Law — check ALL balls ──
  if (step >= 2) {
    let anyBallNearWall = false;
    for (let b = 0; b < state.balls.length; b++) {
      const ball = state.balls[b];
      if (!ball || ball.ownerId === null) continue;
      const nearWall = ball.x < 55 || ball.x > PITCH_WIDTH - 55 || ball.y < 55 || ball.y > PITCH_HEIGHT - 55;
      if (nearWall) {
        anyBallNearWall = true;
        ballCornerCampingTimer++;
        if (ballCornerCampingTimer >= 150) {
          const camperId = ball.ownerId;
          const camper = population.find(p => p.id === camperId);
          if (camper) {
            camper.fitness -= 600;
            camper.lostBallLockoutTimer = 90;
            camper.vx = 0;
            camper.vy = 0;
            camper.dashStunTimer = 45;
            camper.isSprinting = false;
            camper.isDashing = false;
          }
          ball.ownerId = null;
          const centerX = PITCH_WIDTH / 2;
          const centerY = PITCH_HEIGHT / 2;
          const angleToCenter = Math.atan2(centerY - ball.y, centerX - ball.x);
          ball.vx = Math.cos(angleToCenter) * 8.5;
          ball.vy = Math.sin(angleToCenter) * 8.5;
          ballCornerCampingTimer = 0;
        }
        break;
      }
    }
    if (!anyBallNearWall) ballCornerCampingTimer = 0;
  }
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

function runTick() {
  if (!state || !config) return;

  const ticksToRun = isBackgroundMode ? 180 : simulationSpeed;

  for (let s = 0; s < ticksToRun; s++) {
    updatePhysics();
    if (state.ticks >= MAX_TICKS) {
      evolveNextGeneration();
      break;
    }
  }

  // Optimize: Strip heavy brain objects from the state sent to the main UI thread
  const lightweightPlayers = state.players.map(p => {
    const { brain, ...rest } = p;
    return rest;
  });

  const lightweightState = {
    ...state,
    players: lightweightPlayers
  };

  const curriculumData = config.step === 3
    ? {
        atkGoalsAvg: step3AtkGoalsAvg,
        defPhase: getStep3DefPhase(),
        atkGoals: (state as any).s3AtkGoals ?? 0,
        defClearances: (state as any).s3DefClearances ?? 0
      }
    : { atkGoalsAvg: step2AtkGoalsAvg, defStunAvg: step2DefStunAvg };

  // In background mode, only send update once every 100 ticks or on generation change to prevent UI thread flooding
  if (isBackgroundMode) {
    if (state.ticks % 100 === 0 || state.ticks === 1 || state.ticks >= MAX_TICKS - 1) {
      postMessage({ type: 'UPDATE', state: lightweightState, curriculum: curriculumData });
    }
  } else {
    postMessage({ type: 'UPDATE', state: lightweightState, curriculum: curriculumData });
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'INIT':
      config = payload;
      stepGenerationOffset = 0;
      roleSwapCounter = 0;
      currentObstacleCount = 2;
      ballCornerCampingTimer = 0;
      // Reset curriculum when starting fresh (not when just changing speed)
      if (!payload.keepBrains) {
        step2AtkGoalsAvg = 0;
        step2DefStunAvg  = 0;
        step3AtkGoalsAvg = 0;
      }
      initGeneration(payload.keepBrains);
      break;
    case 'START':
      if (!intervalId) intervalId = self.setInterval(runTick, 16);
      break;
    case 'STOP':
      if (intervalId) { self.clearInterval(intervalId); intervalId = null; }
      break;
    case 'SET_BACKGROUND_MODE':
      isBackgroundMode = payload;
      break;
    case 'SET_STEP':
      if (config) {
        config.step = payload;
        stepGenerationOffset = state ? state.generation : 0;
        currentObstacleCount = 2;
        roleSwapCounter = 0;
        ballCornerCampingTimer = 0;
        initGeneration(true);
      }
      break;
    case 'SET_SPEED':
      if (typeof payload === 'number' && payload >= 1 && payload <= 20) simulationSpeed = payload;
      break;
    case 'EXPORT_BRAINS':
      if (population.length > 0) {
        const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
        postMessage({
          type: 'EXPORTED_BRAINS',
          brains: sorted.map(p => ({ team: p.team, role: p.role, fitness: p.fitness, brain: p.brain, personality: p.personality }))
        });
      }
      break;
    case 'IMPORT_BRAINS':
      if (Array.isArray(payload) && payload.length > 0) {
        attackerSavedBrains = payload.filter((x: any) => x.role !== 'defender').map((x: any) => ({
          brain: x.brain,
          personality: x.personality || randomPersonality()
        }));
        defenderSavedBrains = payload.filter((x: any) => x.role === 'defender').map((x: any) => ({
          brain: x.brain,
          personality: x.personality || randomPersonality()
        }));
        if (attackerSavedBrains.length === 0) attackerSavedBrains = payload.map((x: any) => ({ brain: x.brain, personality: x.personality || randomPersonality() }));
        if (state) state.generation = 0;
        stepGenerationOffset = 0;
        initGeneration(true);
      }
      break;
  }
};
