export type CurriculumStep = 1 | 2 | 3 | 4;
// 1: Gather ball
// 2: Score goal
// 3: 1v1
// 4: 3v3

export interface Point {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface PersonalityGene {
  aggression: number;        // 0-1: higher = more aggressive tackles, lower dash cooldown
  riskTolerance: number;     // 0-1: higher = dribbles closer to opponent without panicking
  pressureThreshold: number; // 40-200: distance at which player feels pressured
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SlipperyZone {
  x: number;
  y: number;
  radius: number;
}

export interface FootballPlayer extends GameObject {
  team: 'A' | 'B';
  brain: any; // NeuralNetwork
  fitness: number;
  color: string;
  hasBall: boolean;
  angle: number;
  role?: 'attacker' | 'defender';
  personality?: PersonalityGene;
  isHofChampion?: boolean;       // Flagged if this player is a Hall of Fame guest
  ballPossessionDrought?: number; // Ticks since last having the ball (comeback mechanic)
  sprintTimer?: number;
  sprintCooldown?: number;
  dashTimer?: number;
  dashCooldown?: number;
  isSprinting?: boolean;
  isDashing?: boolean;
  stealSpeedBoostTimer?: number;
  lostBallLockoutTimer?: number;
  isElite?: boolean;
  roundTicks?: number;
  virtualDefenderSpawnX?: number;
  virtualDefenderSpawnY?: number;
  virtualDefenderKickEffect?: number;
  startVirtualY?: number;
  targetGoalY?: number;
  // Dramatic mechanics
  stamina?: number;
  dashStunTimer?: number;
  targetVx?: number;
  targetVy?: number;
}

export interface Ball extends GameObject {
  ownerId: string | null;
  isActive?: boolean;
}

export interface FootballConfig {
  populationSize: number;
  mutationRate: number;
  step: CurriculumStep;
  matchDuration: number;
}

export interface SimulationState {
  players: FootballPlayer[];
  balls: Ball[];
  goals: { team: 'A' | 'B'; x: number; y: number; width: number; height: number }[];
  pitch: { width: number; height: number };
  generation: number;
  ticks: number;
  bestFitness: number;
  scores: { 
    A: number; 
    B: number; 
    even?: { A: number; B: number }; 
    odd?: { A: number; B: number };
  };
  // Environment
  obstacles: Obstacle[];
  wind: { x: number; y: number };
  slipperyZones: SlipperyZone[];
  // Meta
  isHofMatchGen?: boolean;
  currentObstacleCount?: number;
  // Step 2: floating goal zone (random circle on field)
  goalZone?: { x: number; y: number; radius: number };
}
