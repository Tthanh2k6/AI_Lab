import { HeuristicWeights, Player } from '../types/game';

/**
 * Returns a set of weights where the AI has zero tactical knowledge (all 0 or small random).
 * It will make completely random moves initially, except prioritizing the winning line of 5.
 */
export function getZeroWeights(): HeuristicWeights {
  return {
    win5: 100000, // Fixed baseline so it knows 5 is a win
    live4: 240,     // 12000 / 50 (realistic baseline proportions)
    closed4: 24,    // 1200 / 50
    live3: 30,      // 1500 / 50
    closed3: 4,     // 180 / 50
    live2: 2,       // 120 / 50
    closed2: 1,     // 12 / 50
    doubleLive3: 160, // 8000 / 50
    fork43: 300,    // 15000 / 50
    blockLive4: 280, // 14000 / 50
    blockLive3: 40,  // 2000 / 50
    center: 0.1
  };
}

/**
 * Returns highly optimized, hand-tuned Gomoku weights (Pre-trained Master level).
 */
export function getMasterWeights(): HeuristicWeights {
  return {
    win5: 100000,
    live4: 12000,
    closed4: 1200,
    live3: 1500,
    closed3: 180,
    live2: 120,
    closed2: 12,
    doubleLive3: 8000,    // 3-3 fork is extremely strong
    fork43: 15000,        // 4-3 fork is almost a winning threat
    blockLive4: 14000,    // Defensive blocking Live 4 is highly urgent
    blockLive3: 2000,     // Defensive blocking Live 3 is highly urgent
    center: 4
  };
}

/**
 * Creates a slightly mutated copy of parent weights using a genetic mutation operator.
 * `mutationRate` controls how large the weights can jump (0 to 1).
 */
export function mutateWeights(parent: HeuristicWeights, mutationRate: number = 0.2): HeuristicWeights {
  const mutateValue = (val: number, baseScale: number): number => {
    // 40% chance to mutate this weight (increased from 20% for faster evolution of new weights)
    if (Math.random() > 0.6) return val;
    
    // Proportional Mutation: Delta scales dynamically with the current value
    // Math.max ensures that even if val is extremely small, it has a minimum baseScale to grow from scratch
    const scale = Math.max(val, baseScale);
    const delta = (Math.random() * 2 - 1) * mutationRate * scale;
    const newVal = Math.max(0, val + delta);
    return Math.round(newVal);
  };

  return {
    win5: 100000, // Keep win state fixed as the benchmark score
    live4: mutateValue(parent.live4, 240),
    closed4: mutateValue(parent.closed4, 24),
    live3: mutateValue(parent.live3, 30),
    closed3: mutateValue(parent.closed3, 4),
    live2: mutateValue(parent.live2, 2),
    closed2: mutateValue(parent.closed2, 1),
    doubleLive3: mutateValue(parent.doubleLive3 || 0, 160),
    fork43: mutateValue(parent.fork43 || 0, 300),
    blockLive4: mutateValue(parent.blockLive4 || 0, 280),
    blockLive3: mutateValue(parent.blockLive3 || 0, 40),
    center: Math.max(0, Math.round((parent.center + (Math.random() * 2 - 1) * 0.2) * 10) / 10)
  };
}

/**
 * Uniform crossover: randomly picks each weight from either parent.
 * Produces a child that combines strategies from both parents.
 */
function crossoverWeights(parent1: HeuristicWeights, parent2: HeuristicWeights): HeuristicWeights {
  const pick = () => Math.random() < 0.5;
  return {
    win5: 100000,
    live4: pick() ? parent1.live4 : parent2.live4,
    closed4: pick() ? parent1.closed4 : parent2.closed4,
    live3: pick() ? parent1.live3 : parent2.live3,
    closed3: pick() ? parent1.closed3 : parent2.closed3,
    live2: pick() ? parent1.live2 : parent2.live2,
    closed2: pick() ? parent1.closed2 : parent2.closed2,
    doubleLive3: pick() ? parent1.doubleLive3 : parent2.doubleLive3,
    fork43: pick() ? parent1.fork43 : parent2.fork43,
    blockLive4: pick() ? parent1.blockLive4 : parent2.blockLive4,
    blockLive3: pick() ? parent1.blockLive3 : parent2.blockLive3,
    center: pick() ? parent1.center : parent2.center,
  };
}

/**
 * Generates new weights for the loser using a diversity-preserving strategy.
 * - 12% chance: innovation reset to master weights (breaks local optima)
 * - 25% chance: crossover with master weights (genetic recombination)
 * - 63% chance: standard mutation of winner (exploitation)
 */
function generateDiverseWeights(winnerWeights: HeuristicWeights, mutationRate: number): HeuristicWeights {
  const rand = Math.random();
  if (rand < 0.12) {
    // Innovation: fresh start from expert weights to explore new strategies
    return mutateWeights(getMasterWeights(), mutationRate * 1.5);
  } else if (rand < 0.37) {
    // Crossover: mix winner's strategy with expert knowledge
    return mutateWeights(crossoverWeights(winnerWeights, getMasterWeights()), mutationRate * 0.6);
  } else {
    // Standard exploitation: mutate winner's weights
    return mutateWeights(winnerWeights, mutationRate);
  }
}

/**
 * Runs a genetic tournament selection step between Player X and Player O.
 * The winning weights are preserved; the loser gets a diverse replacement
 * to avoid both AIs converging to a single one-dimensional strategy.
 */
export function evolveWeights(
  winner: Player | 'DRAW',
  weightsX: HeuristicWeights,
  weightsO: HeuristicWeights,
  mutationRate: number = 0.25
): { newWeightsX: HeuristicWeights; newWeightsO: HeuristicWeights } {
  if (winner === 'X') {
    return {
      newWeightsX: { ...weightsX },
      newWeightsO: generateDiverseWeights(weightsX, mutationRate)
    };
  } else if (winner === 'O') {
    return {
      newWeightsX: generateDiverseWeights(weightsO, mutationRate),
      newWeightsO: { ...weightsO }
    };
  } else {
    // Draw: Mutate both slightly to find a breakthrough
    return {
      newWeightsX: mutateWeights(weightsX, mutationRate * 0.5),
      newWeightsO: mutateWeights(weightsO, mutationRate * 0.5)
    };
  }
}

/**
 * Updates weights based on a direct threat reinforcement scheme.
 * If X lost to a specific Gomoku shape (e.g. O formed Live 4), X increases its weight for Live 4 to block it next time.
 * Critically also reinforces fork recognition (fork43, doubleLive3) so AI learns to detect and block forks.
 */
export function reinforceWeights(
  winner: Player | 'DRAW',
  weightsX: HeuristicWeights,
  weightsO: HeuristicWeights
): { newWeightsX: HeuristicWeights; newWeightsO: HeuristicWeights } {
  const newWeightsX = { ...weightsX };
  const newWeightsO = { ...weightsO };

  if (winner === 'X') {
    // O lost: raise O's defense/block weights to better block next time
    newWeightsO.live4 = Math.round(newWeightsO.live4 * 1.3) + 200;
    newWeightsO.closed4 = Math.round(newWeightsO.closed4 * 1.3) + 50;
    newWeightsO.live3 = Math.round(newWeightsO.live3 * 1.2) + 20;
    newWeightsO.blockLive4 = Math.round((newWeightsO.blockLive4 || 0) * 1.35) + 250;
    newWeightsO.blockLive3 = Math.round((newWeightsO.blockLive3 || 0) * 1.25) + 30;
    // Reinforce fork recognition — AI must learn to detect/block 4-3 and 3-3 forks
    newWeightsO.fork43 = Math.round((newWeightsO.fork43 || 0) * 1.4) + 500;
    newWeightsO.doubleLive3 = Math.round((newWeightsO.doubleLive3 || 0) * 1.3) + 200;

    newWeightsO.live4 = Math.min(newWeightsO.live4, 25000);
    newWeightsO.closed4 = Math.min(newWeightsO.closed4, 5000);
    newWeightsO.live3 = Math.min(newWeightsO.live3, 3000);
    newWeightsO.blockLive4 = Math.min(newWeightsO.blockLive4, 30000);
    newWeightsO.blockLive3 = Math.min(newWeightsO.blockLive3, 4000);
    newWeightsO.fork43 = Math.min(newWeightsO.fork43, 40000);
    newWeightsO.doubleLive3 = Math.min(newWeightsO.doubleLive3, 20000);
  } else if (winner === 'O') {
    // X lost: raise X's defense/block weights
    newWeightsX.live4 = Math.round(newWeightsX.live4 * 1.3) + 200;
    newWeightsX.closed4 = Math.round(newWeightsX.closed4 * 1.3) + 50;
    newWeightsX.live3 = Math.round(newWeightsX.live3 * 1.2) + 20;
    newWeightsX.blockLive4 = Math.round((newWeightsX.blockLive4 || 0) * 1.35) + 250;
    newWeightsX.blockLive3 = Math.round((newWeightsX.blockLive3 || 0) * 1.25) + 30;
    // Reinforce fork recognition
    newWeightsX.fork43 = Math.round((newWeightsX.fork43 || 0) * 1.4) + 500;
    newWeightsX.doubleLive3 = Math.round((newWeightsX.doubleLive3 || 0) * 1.3) + 200;

    newWeightsX.live4 = Math.min(newWeightsX.live4, 25000);
    newWeightsX.closed4 = Math.min(newWeightsX.closed4, 5000);
    newWeightsX.live3 = Math.min(newWeightsX.live3, 3000);
    newWeightsX.blockLive4 = Math.min(newWeightsX.blockLive4, 30000);
    newWeightsX.blockLive3 = Math.min(newWeightsX.blockLive3, 4000);
    newWeightsX.fork43 = Math.min(newWeightsX.fork43, 40000);
    newWeightsX.doubleLive3 = Math.min(newWeightsX.doubleLive3, 20000);
  }

  return {
    newWeightsX,
    newWeightsO
  };
}
