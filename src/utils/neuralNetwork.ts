export interface NeuralNetworkLayer {
  inputs: number;
  outputs: number;
  weights: number[][]; // [outputNode][inputNode]
  biases: number[];    // [outputNode]
}

export interface NeuralNetwork {
  layers: NeuralNetworkLayer[];
}

// Step 1 — All players (learn to approach ball)
export const STEP1_INPUTS = 2;
export const STEP1_HIDDEN = 8;
export const STEP1_OUTPUTS = 2;

// Step 2 — ATK focuses purely on dribbling ball into goal (no opponent awareness)
// Inputs: [dist_to_ball, angle_to_ball, hasBall, dist_to_goal, angle_to_goal]
// When hasBall=0: network drives toward ball. When hasBall=1: network drives toward goal.
export const S2_ATK_INPUTS = 5;
export const S2_ATK_HIDDEN = 16;
export const S2_ATK_OUTPUTS = 2; // speed, turn

// DEF: [dist_to_carrier, angle_to_carrier]
export const S2_DEF_INPUTS = 2;
export const S2_DEF_HIDDEN = 8;
export const S2_DEF_OUTPUTS = 2; // speed, turn

// Step 3 — 1v1 dedicated brains (9/7 inputs, incompatible with S2 sizes)
// ATK: dist_ball, angle_ball, hasBall, dist_goal, angle_goal, dist_def, angle_def, sprint_cd, dash_cd
export const S3_ATK_INPUTS  = 9;
export const S3_ATK_HIDDEN  = 16;
export const S3_ATK_OUTPUTS = 4; // speed, turn, sprint_activate, dash_activate

// DEF: dist_carrier, angle_carrier, carrier_has_ball, dist_own_goal, angle_own_goal, stun_cd, kick_cd
export const S3_DEF_INPUTS  = 7;
export const S3_DEF_HIDDEN  = 12;
export const S3_DEF_OUTPUTS = 4; // speed, turn, stun_activate, kick_activate

// Step 4+ — Full attacker  (12 inputs: ball pos, goal pos, opp pos, cooldowns + hasBall)
export const ATK_INPUTS = 12;
export const ATK_HIDDEN = 12;
export const ATK_OUTPUTS = 4; // speed, turn, sprint_activate, dash_activate

// Step 4+ — Full defender  (10 inputs: simplified approach + stun focus)
export const DEF_INPUTS = 10;
export const DEF_HIDDEN = 12;
export const DEF_OUTPUTS = 5; // speed, turn, stun_activate, kick_activate, kick_direction

// Keep for backward compat — maps to ATK for default
export const FOOTBALL_INPUTS = ATK_INPUTS;
export const FOOTBALL_HIDDEN = ATK_HIDDEN;
export const FOOTBALL_OUTPUTS = ATK_OUTPUTS;

export function createNeuralNetwork(inputNodes: number, hiddenNodes: number[], outputNodes: number): NeuralNetwork {
  const layers: NeuralNetworkLayer[] = [];
  let currentInputs = inputNodes;
  
  const allLayerNodes = [...hiddenNodes, outputNodes];
  
  for (const nodes of allLayerNodes) {
    const layer: NeuralNetworkLayer = {
      inputs: currentInputs,
      outputs: nodes,
      weights: [],
      biases: []
    };
    
    for (let i = 0; i < nodes; i++) {
      const neuronWeights = [];
      for (let j = 0; j < currentInputs; j++) {
        // Smaller initial variance to prevent tanh saturation early on
        neuronWeights.push((Math.random() - 0.5)); 
      }
      layer.weights.push(neuronWeights);
      layer.biases.push((Math.random() - 0.5));
    }
    
    layers.push(layer);
    currentInputs = nodes;
  }
  
  return { layers };
}

export function feedForward(inputs: number[], network: NeuralNetwork): number[] {
  let currentOutputs = inputs;
  
  for (const layer of network.layers) {
    const nextOutputs = [];
    for (let i = 0; i < layer.outputs; i++) {
      let sum = layer.biases[i];
      for (let j = 0; j < layer.inputs; j++) {
        // Zero-padding safeguard for variable inputs
        const inputVal = currentOutputs[j] !== undefined ? currentOutputs[j] : 0;
        sum += inputVal * layer.weights[i][j];
      }
      // Tanh activation function for -1 to 1 range
      nextOutputs.push(Math.tanh(sum));
    }
    currentOutputs = nextOutputs;
  }
  
  return currentOutputs;
}

export function crossover(parent1: NeuralNetwork, parent2: NeuralNetwork): NeuralNetwork {
  const child = JSON.parse(JSON.stringify(parent1)); // Deep copy
  
  for (let l = 0; l < child.layers.length; l++) {
    for (let i = 0; i < child.layers[l].outputs; i++) {
      // 50% chance to take from parent2
      if (Math.random() > 0.5) {
        child.layers[l].biases[i] = parent2.layers[l].biases[i];
        child.layers[l].weights[i] = [...parent2.layers[l].weights[i]];
      }
    }
  }
  
  return child;
}

export function mutate(network: NeuralNetwork, mutationRate: number): void {
  for (const layer of network.layers) {
    for (let i = 0; i < layer.outputs; i++) {
      if (Math.random() < mutationRate) {
        layer.biases[i] += (Math.random() * 0.5) - 0.25;
      }
      for (let j = 0; j < layer.inputs; j++) {
        if (Math.random() < mutationRate) {
          layer.weights[i][j] += (Math.random() * 0.5) - 0.25;
        }
      }
    }
  }
}
