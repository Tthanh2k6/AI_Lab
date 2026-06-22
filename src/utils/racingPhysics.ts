import { Point, Line, NeuralNetworkType, NetworkLayer } from '../types/game';

// ============================================================================
// NEURAL NETWORK MATH & FUNCTIONS
// ============================================================================

export class NeuralNetwork {
  static create(neuronCounts: number[]): NeuralNetworkType {
    const layers: NetworkLayer[] = [];
    for (let i = 0; i < neuronCounts.length - 1; i++) {
      const inputs = neuronCounts[i];
      const outputs = neuronCounts[i + 1];
      
      const weights: number[][] = [];
      const biases: number[] = [];

      for (let o = 0; o < outputs; o++) {
        const row: number[] = [];
        for (let j = 0; j < inputs; j++) {
          // Initialize weights randomly between -1 and 1
          row.push(Math.random() * 2 - 1);
        }
        weights.push(row);
        biases.push(Math.random() * 2 - 1);
      }

      layers.push({ inputs, outputs, weights, biases });
    }
    return { layers };
  }

  static copy(network: NeuralNetworkType): NeuralNetworkType {
    return {
      layers: network.layers.map(layer => ({
        inputs: layer.inputs,
        outputs: layer.outputs,
        weights: layer.weights.map(row => [...row]),
        biases: [...layer.biases]
      }))
    };
  }

  static feedForward(network: NeuralNetworkType, inputs: number[]): number[] {
    let currentInputs = [...inputs];

    for (const layer of network.layers) {
      const nextInputs: number[] = [];
      for (let o = 0; o < layer.outputs; o++) {
        let sum = layer.biases[o];
        for (let i = 0; i < layer.inputs; i++) {
          sum += currentInputs[i] * layer.weights[o][i];
        }
        // Hyperbolic tangent activation function (tanh) for range [-1, 1]
        nextInputs.push(Math.tanh(sum));
      }
      currentInputs = nextInputs;
    }

    return currentInputs;
  }

  static mutate(network: NeuralNetworkType, rate: number): NeuralNetworkType {
    const mutated = NeuralNetwork.copy(network);
    for (const layer of mutated.layers) {
      // Mutate weights
      for (let o = 0; o < layer.outputs; o++) {
        for (let i = 0; i < layer.inputs; i++) {
          if (Math.random() < rate) {
            // Add Gaussian-like random noise or assign new random weight
            layer.weights[o][i] += (Math.random() * 2 - 1) * 0.3;
            // Clamp to [-1, 1]
            if (layer.weights[o][i] > 1) layer.weights[o][i] = 1;
            if (layer.weights[o][i] < -1) layer.weights[o][i] = -1;
          }
        }
        // Mutate biases
        if (Math.random() < rate) {
          layer.biases[o] += (Math.random() * 2 - 1) * 0.3;
          if (layer.biases[o] > 1) layer.biases[o] = 1;
          if (layer.biases[o] < -1) layer.biases[o] = -1;
        }
      }
    }
    return mutated;
  }

  static crossover(netA: NeuralNetworkType, netB: NeuralNetworkType): NeuralNetworkType {
    const child = NeuralNetwork.copy(netA);
    for (let l = 0; l < child.layers.length; l++) {
      const layer = child.layers[l];
      const parentB = netB.layers[l];

      for (let o = 0; o < layer.outputs; o++) {
        for (let i = 0; i < layer.inputs; i++) {
          // 50% chance to inherit weight from parent B
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
}

// ============================================================================
// MATH GEOMETRY UTILITIES
// ============================================================================

export function getIntersection(A: Point, B: Point, C: Point, D: Point): { x: number; y: number; offset: number } | null {
  const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
  const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
  const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

  if (bottom !== 0) {
    const t = tTop / bottom;
    const u = uTop / bottom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: A.x + (B.x - A.x) * t,
        y: A.y + (B.y - A.y) * t,
        offset: t
      };
    }
  }

  return null;
}

export function distancePointToPoint(p1: Point, p2: Point): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// ============================================================================
// TRACK DEFINITION AND GENERATION
// ============================================================================

export interface RacingTrack {
  id: string;
  name: string;
  centerLine: Point[];
  leftWall: Line[];
  rightWall: Line[];
  checkpoints: Line[];
  startPoint: Point;
  startAngle: number;
  width: number;
}

// Helper to compute boundaries from a center line path
export function buildTrackBoundaries(centerLine: Point[], width: number, isClosed = true): { leftWall: Line[]; rightWall: Line[]; checkpoints: Line[] } {
  const checkpoints: Line[] = [];
  const leftPoints: Point[] = [];
  const rightPoints: Point[] = [];

  const n = centerLine.length;
  for (let i = 0; i < n; i++) {
    const curr = centerLine[i];

    let prev: Point;
    let next: Point;

    if (isClosed) {
      prev = centerLine[(i - 1 + n) % n];
      next = centerLine[(i + 1) % n];
    } else {
      prev = i === 0 ? curr : centerLine[i - 1];
      next = i === n - 1 ? curr : centerLine[i + 1];
    }

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;

    if (dx === 0 && dy === 0) {
      if (i < n - 1) {
        dx = centerLine[i + 1].x - curr.x;
        dy = centerLine[i + 1].y - curr.y;
      } else {
        dx = curr.x - centerLine[i - 1].x;
        dy = curr.y - centerLine[i - 1].y;
      }
    }

    const length = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / length;
    const uy = dy / length;

    const nx = -uy;
    const ny = ux;

    const halfW = width / 2;
    const lp = { x: curr.x + nx * halfW, y: curr.y + ny * halfW };
    const rp = { x: curr.x - nx * halfW, y: curr.y - ny * halfW };

    leftPoints.push(lp);
    rightPoints.push(rp);
    checkpoints.push({ p1: lp, p2: rp });
  }

  // Build raw wall segments
  const rawLeft: Line[] = [];
  const rawRight: Line[] = [];
  for (let i = 0; i < n - 1; i++) {
    rawLeft.push({ p1: leftPoints[i], p2: leftPoints[i + 1] });
    rawRight.push({ p1: rightPoints[i], p2: rightPoints[i + 1] });
  }
  if (isClosed) {
    rawLeft.push({ p1: leftPoints[n - 1], p2: leftPoints[0] });
    rawRight.push({ p1: rightPoints[n - 1], p2: rightPoints[0] });
  }

  // Filter out wall segments that cross the opposite wall (crossover zones),
  // self-intersect, or encroach into the drivable road of another track section.
  // This turns sharp crossovers and overlaps into open merged sections (like a paintbrush).
  const SKIP = 4; // ignore nearby opposite segments
  const skipIndexRange = Math.max(12, Math.floor(n * 0.06)); // ignore close neighbors on the same wall/centerline
  const leftWall: Line[] = [];
  const rightWall: Line[] = [];

  for (let i = 0; i < rawLeft.length; i++) {
    let crosses = false;

    // 1. Crossover check with opposite wall
    for (let j = 0; j < rawRight.length; j++) {
      if (Math.abs(i - j) < SKIP) continue;
      if (getIntersection(rawLeft[i].p1, rawLeft[i].p2, rawRight[j].p1, rawRight[j].p2)) {
        crosses = true;
        break;
      }
    }

    // 2. Self-intersection check with other left wall segments
    if (!crosses) {
      for (let j = 0; j < rawLeft.length; j++) {
        const idxDist = isClosed 
          ? Math.min(Math.abs(i - j), n - Math.abs(i - j)) 
          : Math.abs(i - j);
        if (idxDist < skipIndexRange) continue;
        if (getIntersection(rawLeft[i].p1, rawLeft[i].p2, rawLeft[j].p1, rawLeft[j].p2)) {
          crosses = true;
          break;
        }
      }
    }

    // 3. Inside road check (encroaching another section's drivable lane)
    if (!crosses) {
      const halfW = width / 2;
      for (let k = 0; k < n; k++) {
        const idxDist = isClosed 
          ? Math.min(Math.abs(i - k), n - Math.abs(i - k)) 
          : Math.abs(i - k);
        if (idxDist < skipIndexRange) continue;
        
        const d1 = distancePointToPoint(rawLeft[i].p1, centerLine[k]);
        const d2 = distancePointToPoint(rawLeft[i].p2, centerLine[k]);
        // If either endpoint is inside the track width of another section, it's encroaching
        if (d1 < halfW * 0.85 || d2 < halfW * 0.85) {
          crosses = true;
          break;
        }
      }
    }

    if (!crosses) leftWall.push(rawLeft[i]);
  }

  for (let j = 0; j < rawRight.length; j++) {
    let crosses = false;

    // 1. Crossover check with opposite wall
    for (let i = 0; i < rawLeft.length; i++) {
      if (Math.abs(i - j) < SKIP) continue;
      if (getIntersection(rawRight[j].p1, rawRight[j].p2, rawLeft[i].p1, rawLeft[i].p2)) {
        crosses = true;
        break;
      }
    }

    // 2. Self-intersection check with other right wall segments
    if (!crosses) {
      for (let k = 0; k < rawRight.length; k++) {
        const idxDist = isClosed 
          ? Math.min(Math.abs(j - k), n - Math.abs(j - k)) 
          : Math.abs(j - k);
        if (idxDist < skipIndexRange) continue;
        if (getIntersection(rawRight[j].p1, rawRight[j].p2, rawRight[k].p1, rawRight[k].p2)) {
          crosses = true;
          break;
        }
      }
    }

    // 3. Inside road check (encroaching another section's drivable lane)
    if (!crosses) {
      const halfW = width / 2;
      for (let k = 0; k < n; k++) {
        const idxDist = isClosed 
          ? Math.min(Math.abs(j - k), n - Math.abs(j - k)) 
          : Math.abs(j - k);
        if (idxDist < skipIndexRange) continue;
        
        const d1 = distancePointToPoint(rawRight[j].p1, centerLine[k]);
        const d2 = distancePointToPoint(rawRight[j].p2, centerLine[k]);
        if (d1 < halfW * 0.85 || d2 < halfW * 0.85) {
          crosses = true;
          break;
        }
      }
    }

    if (!crosses) rightWall.push(rawRight[j]);
  }

  return { leftWall, rightWall, checkpoints };
}

/**
 * Checks if a closed path self-intersects (any two non-adjacent segments cross).
 * O(n²) but fast enough for n≤280.
 */
function hasCenterlineSelfIntersection(path: Point[]): boolean {
  const n = path.length;
  // Skip range: ignore segments that are within 8% of the path length (local neighbors)
  const skipRange = Math.max(6, Math.floor(n * 0.08));

  for (let i = 0; i < n; i++) {
    const a1 = path[i];
    const a2 = path[(i + 1) % n];

    for (let j = i + skipRange; j < n - 1; j++) {
      const b1 = path[j];
      const b2 = path[(j + 1) % n];
      if (getIntersection(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * Checks if any two non-adjacent centerline points are closer than minDist.
 * Prevents track sections from being so close that walls overlap.
 */
function hasTrackSectionsTooClose(path: Point[], minDist: number): boolean {
  const n = path.length;
  const skipRange = Math.max(8, Math.floor(n * 0.1));

  for (let i = 0; i < n; i++) {
    for (let j = i + skipRange; j < n; j++) {
      if (distancePointToPoint(path[i], path[j]) < minDist) return true;
    }
  }
  return false;
}

// Procedural Track Generator — retries until it produces a non-overlapping circuit
export function generateRandomTrack(width = 65): RacingTrack {
  const cx = 1100;
  const cy = 900;
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const numControlPoints = 20;
    const controlPoints: Point[] = [];

    // Control points near angle 0 (= start/finish) get a consistent radius so the
    // Catmull-Rom spline produces a gentle arc there — effectively a "straight" section.
    // Turns only begin once the car is already moving and the AI has had time to learn.
    const AVG_RADIUS = 615; // midpoint between inner (510) and outer (720)
    const STRAIGHT_CTRL = 4; // how many control points on each side of angle-0 stay "straight"

    for (let i = 0; i < numControlPoints; i++) {
      const angle = (i / numControlPoints) * Math.PI * 2;

      // Distance from angle-0 measured in control-point steps (wrapping around)
      const distFromStart = Math.min(i, numControlPoints - i);

      let rad: number;
      if (distFromStart < STRAIGHT_CTRL) {
        // Near start/finish: constant radius → gentle arc, AI can drive straight here
        rad = AVG_RADIUS;
      } else if (i % 2 === 0) {
        rad = 510 + (Math.random() * 80 - 40); // inner turn
      } else {
        rad = 720 + (Math.random() * 80 - 40); // outer sweep
      }

      controlPoints.push({
        x: cx + Math.cos(angle) * rad,
        y: cy + Math.sin(angle) * rad
      });
    }

    // Catmull-Rom spline — 10 points per segment → 200 total path points
    const path: Point[] = [];
    const pointsPerSegment = 10;

    for (let i = 0; i < numControlPoints; i++) {
      const p0 = controlPoints[(i - 1 + numControlPoints) % numControlPoints];
      const p1 = controlPoints[i];
      const p2 = controlPoints[(i + 1) % numControlPoints];
      const p3 = controlPoints[(i + 2) % numControlPoints];

      for (let step = 0; step < pointsPerSegment; step++) {
        const t = step / pointsPerSegment;
        const t2 = t * t;
        const t3 = t2 * t;

        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );
        const y = 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );

        path.push({ x, y });
      }
    }

    // Reject self-intersecting tracks or tracks with sections too close to each other
    if (hasCenterlineSelfIntersection(path)) continue;
    if (hasTrackSectionsTooClose(path, width * 1.5)) continue;

    // Valid track found — build boundaries and return
    const { leftWall, rightWall, checkpoints } = buildTrackBoundaries(path, width, true);

    const startPt = path[0];
    const nextPt = path[1];
    const startAngle = Math.atan2(nextPt.y - startPt.y, nextPt.x - startPt.x);

    return {
      id: 'random',
      name: 'Bản Đồ Tạo Sinh Ngẫu Nhiên',
      centerLine: path,
      leftWall,
      rightWall,
      checkpoints,
      startPoint: startPt,
      startAngle,
      width
    };
  }

  // All attempts failed — fall back to a known-good preset track
  return getPresetTrack('monza', width);
}

// 3 Preset Tracks
export function getPresetTrack(trackId: string, width = 65): RacingTrack {
  let centerLine: Point[] = [];

  const cx = 1100;
  const cy = 900;

  if (trackId === 'scurve') {
    // S-Curve Mountain Pass: tight zigzags, narrow turns without self-intersections
    const pts = [
      // Start at top horizontal section — car gets a straight run-in before zigzags
      { x: 800,  y: 300  },  // Start/Finish — top center heading right
      { x: 1050, y: 355  },  // top-right
      { x: 960,  y: 490  },  // R1 (rounded: was 950,480)
      { x: 1085, y: 605  },  // R2 (rounded: was 1100,600)
      { x: 1010, y: 800  },  // R3 (rounded: was 1000,800)
      { x: 1125, y: 910  },  // R4 (rounded: was 1150,900)
      { x: 1050, y: 1100 },
      { x: 1155, y: 1210 },  // bottom-right corner (rounded: was 1200,1200)
      { x: 1000, y: 1350 },
      { x: 800,  y: 1255 },
      { x: 600,  y: 1350 },
      { x: 445,  y: 1200 },  // bottom-left corner (rounded: was 400,1200)
      { x: 555,  y: 1100 },
      { x: 478,  y: 902  },  // L1 (rounded: was 450,900 → +28x)
      { x: 573,  y: 800  },  // L2 (rounded: was 600,800 → -27x)
      { x: 524,  y: 600  },  // L3 (rounded: was 500,600 → +24x)
      { x: 623,  y: 483  },  // L4 (rounded: was 650,480 → -27x)
      { x: 562,  y: 355  },  // top-left (rounded: was 550,350)
    ];
    
    // Interpolate S-Curve
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;

  } else if (trackId === 'grandprix') {
    // Grand Prix F1 circuit: contains obtuse turns, hairpins, straight lines, no self-intersections
    const pts = [
      { x: 400, y: 1300 }, // Start/Finish
      { x: 300, y: 1000 },
      { x: 450, y: 700 },
      { x: 350, y: 450 },
      { x: 600, y: 350 },
      { x: 900, y: 380 },
      { x: 1200, y: 320 },
      { x: 1500, y: 350 },
      { x: 1750, y: 450 },
      { x: 1850, y: 700 },
      { x: 1650, y: 1000 },
      { x: 1780, y: 1200 },
      { x: 1500, y: 1350 },
      { x: 1250, y: 1100 },
      { x: 1100, y: 1150 },
      { x: 950, y: 1350 },
      { x: 700, y: 1350 },
      { x: 500, y: 1320 }
    ];
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;

  } else if (trackId === 'monza') {
    // Monza GP Ultra-Chicane (Ý)
    const pts = [
      { x: 1000, y: 1400 }, { x: 850, y: 1400 }, { x: 700, y: 1400 },
      { x: 550, y: 1420 }, { x: 420, y: 1350 }, { x: 300, y: 1400 },
      { x: 220, y: 1280 }, { x: 280, y: 1140 }, { x: 380, y: 1060 },
      { x: 480, y: 1120 }, { x: 600, y: 1080 }, { x: 740, y: 980 },
      { x: 820, y: 860 },  { x: 720, y: 760 },  { x: 580, y: 740 },
      { x: 460, y: 680 },  { x: 420, y: 540 },  { x: 520, y: 440 },
      { x: 660, y: 400 },  { x: 780, y: 460 },  { x: 900, y: 420 },
      { x: 1020, y: 520 }, { x: 1150, y: 600 }, { x: 1280, y: 520 },
      { x: 1400, y: 600 }, { x: 1520, y: 520 }, { x: 1650, y: 620 },
      { x: 1720, y: 760 }, { x: 1620, y: 900 }, { x: 1480, y: 980 },
      { x: 1580, y: 1120 },{ x: 1640, y: 1260 },{ x: 1520, y: 1380 },
      { x: 1350, y: 1380 },{ x: 1180, y: 1400 }
    ];
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 10; s++) {
        const t = s / 10;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;

  } else if (trackId === 'redbull') {
    // Red Bull Ring (Áo)
    const pts = [
      { x: 1100, y: 1300 }, { x: 950, y: 1300 }, { x: 800, y: 1300 },
      { x: 650, y: 1300 },  { x: 500, y: 1300 }, { x: 380, y: 1250 },
      { x: 280, y: 1160 },  { x: 220, y: 1040 }, { x: 160, y: 900 },
      { x: 140, y: 740 },   { x: 180, y: 580 },  { x: 260, y: 440 },
      { x: 380, y: 380 },   { x: 480, y: 480 },  { x: 540, y: 600 },
      { x: 640, y: 680 },   { x: 740, y: 580 },  { x: 820, y: 460 },
      { x: 920, y: 540 },   { x: 990, y: 660 },  { x: 1080, y: 760 },
      { x: 1180, y: 680 },  { x: 1260, y: 580 }, { x: 1340, y: 680 },
      { x: 1440, y: 780 },  { x: 1540, y: 880 }, { x: 1650, y: 800 },
      { x: 1760, y: 720 },  { x: 1830, y: 840 }, { x: 1760, y: 980 },
      { x: 1640, y: 1060 }, { x: 1500, y: 1140 },{ x: 1360, y: 1220 },
      { x: 1220, y: 1300 }
    ];
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 10; s++) {
        const t = s / 10;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;

  } else if (trackId === 'shanghai') {
    // Shanghai International Circuit (Trung Quốc)
    const pts = [
      { x: 1050, y: 1200 }, { x: 850, y: 1200 }, { x: 650, y: 1180 },
      { x: 500, y: 1100 },  { x: 420, y: 960 },  { x: 380, y: 800 },
      { x: 420, y: 640 },   { x: 540, y: 520 },  { x: 680, y: 460 },
      { x: 800, y: 480 },   { x: 860, y: 580 },  { x: 800, y: 680 },
      { x: 680, y: 700 },   { x: 620, y: 820 },  { x: 700, y: 920 },
      { x: 820, y: 880 },   { x: 960, y: 820 },  { x: 1100, y: 780 },
      { x: 1240, y: 820 },  { x: 1380, y: 760 }, { x: 1500, y: 820 },
      { x: 1600, y: 940 },  { x: 1580, y: 1080 },{ x: 1460, y: 1140 },
      { x: 1320, y: 1100 }, { x: 1200, y: 1160 },{ x: 1100, y: 1200 }
    ];
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 10; s++) {
        const t = s / 10;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;

  } else if (trackId === 'singapore') {
    // Singapore Marina Bay Street Circuit (Singapore) - Sửa lỗi và loại bỏ hoàn toàn các điểm giao nhau (no crossovers)
    const pts = [
      { x: 1000, y: 1300 }, { x: 800,  y: 1300 }, { x: 600,  y: 1300 }, // Start/Finish Straight
      { x: 450,  y: 1250 }, { x: 380,  y: 1150 }, // T1-T3 Chicane
      { x: 420,  y: 1050 }, { x: 550,  y: 1050 }, // Straight right
      { x: 680,  y: 1050 }, { x: 800,  y: 950  }, // T5 right turn
      { x: 720,  y: 800  }, { x: 620,  y: 650  }, // Nicoll Highway Straight
      { x: 510,  y: 555  }, // T7 approach
      { x: 420,  y: 515  }, // T7 entry
      { x: 355,  y: 465  }, // T7 apex (wider radius — rounded corner)
      { x: 370,  y: 400  }, // T7 exit
      { x: 480,  y: 390  }, // T7 exit straight
      { x: 620,  y: 415  }, { x: 740,  y: 420  }, // T8-T9 right-left
      { x: 900,  y: 420  }, { x: 1100, y: 420  }, { x: 1300, y: 420  }, // Esplanade Straight
      { x: 1420, y: 480  }, { x: 1480, y: 600  }, // T10 left (Singapore Sling)
      { x: 1380, y: 700  }, { x: 1260, y: 700  }, // T11-T12 right
      { x: 1140, y: 760  }, { x: 1080, y: 840  }, // T13 hairpin entry & apex
      { x: 1140, y: 920  }, { x: 1260, y: 920  }, // T13 exit
      { x: 1380, y: 920  }, { x: 1480, y: 920  }, // Anderson Bridge straight
      { x: 1560, y: 980  }, { x: 1580, y: 1080 }, // T14 right
      { x: 1480, y: 1140 }, { x: 1380, y: 1140 }, // T15 left
      { x: 1280, y: 1200 }, // T16-T17 chicane
      { x: 1180, y: 1180 }, // T18-T19 grandstand tunnel
      { x: 1080, y: 1220 }, // T20-T21
      { x: 1020, y: 1260 }  // T22-T23 double fast left back to start
    ];
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 10; s++) {
        const t = s / 10;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;

  } else {
    // Default 'oval': "Vòng cua Hoàn Mỹ" (Perfect curves, smooth oval loop with slight wobbles)
    const pts: Point[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      // Bean/Peanut shape
      const rx = 800 + 100 * Math.sin(2 * angle);
      const ry = 550 + 60 * Math.sin(2 * angle);
      pts.push({
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry
      });
    }

    // Interpolation
    const path: Point[] = [];
    const segments = pts.length;
    for (let i = 0; i < segments; i++) {
      const p0 = pts[(i - 1 + segments) % segments];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % segments];
      const p3 = pts[(i + 2) % segments];
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * ((2*p1.x) + (-p0.x + p2.x)*t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y + p2.y)*t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*t3);
        path.push({ x, y });
      }
    }
    centerLine = path;
  }

  const { leftWall, rightWall, checkpoints } = buildTrackBoundaries(centerLine, width, true);

  const startPt = centerLine[0];
  const nextPt = centerLine[1];
  const startAngle = Math.atan2(nextPt.y - startPt.y, nextPt.x - startPt.x);

  let trackName = 'Vòng Cua Hoàn Mỹ';
  if (trackId === 'scurve') trackName = 'Đèo Tử Thần';
  if (trackId === 'grandprix') trackName = 'Đấu Trường F1 Grand Prix';
  if (trackId === 'monza') trackName = 'Đường Đua Siêu Tốc Monza (Ý)';
  if (trackId === 'redbull') trackName = 'Đường Đua Red Bull Ring (Áo)';
  if (trackId === 'shanghai') trackName = 'Đường Đua Thượng Hải (Trung Quốc)';
  if (trackId === 'singapore') trackName = 'Đường Đua Singapore GP (Singapore)';

  return {
    id: trackId,
    name: trackName,
    centerLine,
    leftWall,
    rightWall,
    checkpoints,
    startPoint: startPt,
    startAngle,
    width
  };
}

// ============================================================================
// CAR SIMULATION CLASS
// ============================================================================

export class CarInstance {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  friction: number;
  turnSpeed: number;

  crashed: boolean;
  finished: boolean;
  fitness: boolean | number; // numerical fitness score
  lapCount: number;

  // Track state
  currentCheckpointIndex: number;
  timeAlive: number;
  stagnantTimer: number; // to kill cars stuck in place

  // Brain
  brain: NeuralNetworkType;
  sensorRays: Line[] = [];
  sensorInputs: number[] = [];
  
  // Dimensions
  carWidth = 10;
  carHeight = 20;

  // Checkpoint coordinate tracking
  lastCheckpointTime = 0;
  totalDistanceTraveled = 0;
  lastPosition: Point;

  isPlayer: boolean;
  mutationType: 'elite' | 'explorer' | 'stable' | 'player' = 'stable';

  constructor(
    x: number,
    y: number,
    angle: number,
    numSensors = 5,
    brain?: NeuralNetworkType,
    isPlayer = false,
    maxSpeed = 4.2
  ) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = angle;
    this.speed = 0;
    this.maxSpeed = maxSpeed;
    this.friction = 0.05;
    this.turnSpeed = 0.045; // limit U-turns but enough for obtuse angles!

    this.crashed = false;
    this.finished = false;
    this.fitness = 0;
    this.lapCount = 0;

    this.currentCheckpointIndex = 1;
    this.timeAlive = 0;
    this.stagnantTimer = 0;

    this.lastPosition = { x, y };

    this.isPlayer = isPlayer;
    if (isPlayer) {
      this.mutationType = 'player';
    }

    if (isPlayer) {
      this.brain = NeuralNetwork.create([numSensors + 2, 6, 2]); // player doesn't use brain but needs it initialized
    } else if (brain) {
      this.brain = NeuralNetwork.copy(brain);
    } else {
      // 5 raycast inputs + 1 speed + 1 failure proximity = 7 inputs
      // Output: 1 steering angle, 1 acceleration force
      this.brain = NeuralNetwork.create([numSensors + 2, 7, 2]);
    }
  }

  // Update physical movements (fixed speed at 3.6px/frame or dynamic +/-30% in Phase 2, scaled by speedMultiplier)
  updatePhysics(steering: number, acceleration: number, isPhase2 = false, speedMultiplier = 1.0) {
    if (this.crashed) return;

    // Increased turning capability to 0.08 radians/frame for great agility
    this.turnSpeed = 0.08;

    if (!isPhase2) {
      // Phase 1: Fixed speed at exactly 3.6 px/frame (36 km/h display)
      this.speed = 3.6 * speedMultiplier;
      this.maxSpeed = 3.6 * speedMultiplier;
    } else {
      // Phase 2: Variable speed, 3.6 px/frame base, +/-30%
      // 3.6 * 0.3 = 1.08 px/frame variation.
      // acceleration output is mapped from [-1, 1] to [-1.08, 1.08]
      const accelFactor = Math.max(-1, Math.min(1, acceleration));
      this.speed = (3.6 + accelFactor * 1.08) * speedMultiplier;
      this.maxSpeed = 4.68 * speedMultiplier; // 3.6 * 1.3 * speedMultiplier
    }

    // Force steering to 0 for the first 20 frames to let cars accelerate straight from start line
    const actualSteering = this.timeAlive < 20 ? 0 : steering;
    this.angle += actualSteering * this.turnSpeed;

    // Update coordinates
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    // Calculate incremental distance traveled
    const dist = distancePointToPoint(this.lastPosition, { x: this.x, y: this.y });
    this.totalDistanceTraveled += dist;
    this.lastPosition = { x: this.x, y: this.y };

    this.timeAlive++;
  }

  // Perform Raycasting Sensoring (returns sensor inputs array)
  updateSensors(track: RacingTrack, crashMarkers: Point[], enableFailureAvoidance: boolean) {
    if (this.crashed) return;

    const numSensors = this.brain.layers[0].inputs - 2; // Subtract speed and failure input
    const rays: Line[] = [];
    const inputs: number[] = [];

    // Raycast coverage: -60deg to +60deg
    const rayRange = 260; // Extended ray range from 160 to 260px!
    const startAngle = -Math.PI / 3; // -60 deg
    const endAngle = Math.PI / 3;   // +60 deg
    const step = numSensors > 1 ? (endAngle - startAngle) / (numSensors - 1) : 0;

    for (let i = 0; i < numSensors; i++) {
      const rayAngle = this.angle + startAngle + i * step;
      const p1 = { x: this.x, y: this.y };
      const p2 = {
        x: this.x + Math.cos(rayAngle) * rayRange,
        y: this.y + Math.sin(rayAngle) * rayRange
      };

      rays.push({ p1, p2 });

      // Check intersections with all left/right walls
      let minOffset = 1;
      let intersectPoint: Point | null = null;

      const walls = [...track.leftWall, ...track.rightWall];
      for (const wall of walls) {
        const intersect = getIntersection(p1, p2, wall.p1, wall.p2);
        if (intersect && intersect.offset < minOffset) {
          minOffset = intersect.offset;
          intersectPoint = intersect;
        }
      }

      // Input is 1 - minOffset (1 is safe, 0 is touching wall)
      inputs.push(1 - minOffset);
    }

    this.sensorRays = rays;

    // Failure Avoidance Input: find distance & angle to the closest failure marker (crash point)
    let failureSensorVal = 0; // default 0 (no near crash)
    
    if (enableFailureAvoidance && crashMarkers.length > 0) {
      let minCrashDist = 200; // only detect crash points within 200px
      for (const marker of crashMarkers) {
        const d = distancePointToPoint({ x: this.x, y: this.y }, marker);
        if (d < minCrashDist) {
          minCrashDist = d;
        }
      }
      
      // Proximity is 1 - minCrashDist/200 (1 is on top of failure point, 0 is far away)
      failureSensorVal = 1 - minCrashDist / 200;
    }

    // Append standard outputs
    inputs.push(this.speed / this.maxSpeed); // Normalized speed
    inputs.push(failureSensorVal);          // Failure avoidance sensor input

    this.sensorInputs = inputs;
  }

  // AI Decision feedforward
  think(isPhase2 = false, speedMultiplier = 1.0) {
    if (this.crashed || this.isPlayer) return;

    // Output: [steering, acceleration]
    const outputs = NeuralNetwork.feedForward(this.brain, this.sensorInputs);
    
    const steering = outputs[0];      // Range [-1, 1]
    const acceleration = outputs[1];  // Range [-1, 1]

    this.updatePhysics(steering, acceleration, isPhase2, speedMultiplier);
  }

  // Crash detection & Checkpoint scoring
  checkCollisionAndCheckpoints(track: RacingTrack) {
    if (this.crashed) return;

    // 1. Wall Collisions: check if car body polygon overlaps walls (always active to prevent clipping)
    const carPoly = this.getCarPolygon();
    const walls = [...track.leftWall, ...track.rightWall];

    for (const wall of walls) {
      for (let i = 0; i < carPoly.length; i++) {
        const p1 = carPoly[i];
        const p2 = carPoly[(i + 1) % carPoly.length];

        if (getIntersection(p1, p2, wall.p1, wall.p2)) {
          this.crashed = true;
          this.speed = 0;
          return;
        }
      }
    }

    // 2. Checkpoints crossing detection
    // Target checkpoint is currentCheckpointIndex % track.checkpoints.length
    const checkIdx = this.currentCheckpointIndex % track.checkpoints.length;
    const checkpoint = track.checkpoints[checkIdx];

    // Check if the front-center of the car crossed the checkpoint line
    const carCenter = { x: this.x, y: this.y };
    const carFront = {
      x: this.x + Math.cos(this.angle) * (this.carHeight / 2),
      y: this.y + Math.sin(this.angle) * (this.carHeight / 2)
    };

    const cross = getIntersection(carCenter, carFront, checkpoint.p1, checkpoint.p2);
    if (cross) {
      this.currentCheckpointIndex++;
      this.stagnantTimer = 0; // reset stagnation
      this.lastCheckpointTime = this.timeAlive;

      // Completed a lap!
      if (this.currentCheckpointIndex >= track.checkpoints.length) {
        this.lapCount = Math.floor(this.currentCheckpointIndex / track.checkpoints.length);
        if (this.currentCheckpointIndex >= track.checkpoints.length * 1.5) {
          // Finish the trial after 1.5 laps to avoid infinite loops and declare victory!
          this.finished = true;
        }
      }
    } else {
      this.stagnantTimer++;
      // Kill cars stuck, going backward, or going in circles
      if (this.stagnantTimer > 280) { // ~5 seconds of no progress
        this.crashed = true;
        this.speed = 0;
      }
    }
  }

  // Calculate coordinates of the car's 4 corners (length 20, width 10, aligned along angle)
  getCarPolygon(): Point[] {
    const halfL = this.carHeight / 2; // length / 2 = 10
    const halfW = this.carWidth / 2;  // width / 2 = 5
    const corners = [
      { dx: halfL, dy: halfW },   // Front Right
      { dx: halfL, dy: -halfW },  // Front Left
      { dx: -halfL, dy: -halfW }, // Rear Left
      { dx: -halfL, dy: halfW }   // Rear Right
    ];
    return corners.map(c => ({
      x: this.x + c.dx * Math.cos(this.angle) - c.dy * Math.sin(this.angle),
      y: this.y + c.dx * Math.sin(this.angle) + c.dy * Math.cos(this.angle)
    }));
  }

  // Compute final fitness score (rewards both distance and speed, penalizing slow creeping)
  getFitness(track: RacingTrack): number {
    // Calculate average speed during the run
    const avgSpeed = this.totalDistanceTraveled / Math.max(1, this.timeAlive);

    // 1. Base score is the actual distance traveled in pixels
    let score = this.totalDistanceTraveled;

    // 2. Speed factor: Multiply score by up to 2.0x for cars maintaining top speed!
    const speedFactor = 1.0 + (avgSpeed / this.maxSpeed);
    score *= speedFactor;

    // 3. Strong checkpoint bonus to reward structured sequential progress
    score += this.currentCheckpointIndex * 3000;

    // 4. Complete track completion bonus & speed-efficiency reward
    if (this.finished) {
      score += 150000;
      // Time bonus: reward finishing faster (fewer frames alive = higher bonus)
      const timeBonus = Math.max(0, 20000 - this.timeAlive * 8);
      score += timeBonus;
    }

    this.fitness = score;
    return Math.max(1, this.fitness);
  }
}

// ============================================================================
// GENETIC EVOLUTION FOR CAR POPULATION
// ============================================================================

export interface OffspringInstance {
  brain: NeuralNetworkType;
  mutationType: 'elite' | 'explorer' | 'stable' | 'player';
}

export function evolveCarPopulation(
  currentCars: CarInstance[],
  mutationRate: number,
  track: RacingTrack,
  numSensors: number,
  maxSpeed: number,
  isPhase2 = false
): { nextOffspring: OffspringInstance[]; eliteFitness: number; bestCarIndex: number } {
  // 1. Calculate fitness for all cars
  const scoredCars = currentCars.map((car, idx) => ({
    index: idx,
    fitness: car.getFitness(track),
    brain: car.brain
  }));

  // Sort descending by fitness
  scoredCars.sort((a, b) => b.fitness - a.fitness);

  const bestCarIndex = scoredCars[0].index;
  const eliteFitness = scoredCars[0].fitness;
  const eliteBrain = scoredCars[0].brain;

  const nextOffspring: OffspringInstance[] = [];

  // Preservation: Keep top 2 elites completely unmodified
  nextOffspring.push({
    brain: NeuralNetwork.copy(eliteBrain),
    mutationType: 'elite'
  });
  if (scoredCars.length > 1) {
    nextOffspring.push({
      brain: NeuralNetwork.copy(scoredCars[1].brain),
      mutationType: 'elite'
    });
  }

  // 2. Tournament selection & reproduce
  const selectParent = (): NeuralNetworkType => {
    // Tournament of size 4
    const tournament: typeof scoredCars = [];
    for (let k = 0; k < 4; k++) {
      const randIdx = Math.floor(Math.random() * scoredCars.length);
      tournament.push(scoredCars[randIdx]);
    }
    tournament.sort((a, b) => b.fitness - a.fitness);
    return tournament[0].brain;
  };

  const numExplorers = Math.floor(currentCars.length * mutationRate);

  // Generate the rest of population
  while (nextOffspring.length < currentCars.length) {
    const parentA = selectParent();
    const parentB = selectParent();

    // Crossover
    let childBrain = NeuralNetwork.crossover(parentA, parentB);

    // Mutation
    let rateToUse = 0.06;
    let mutationType: 'explorer' | 'stable' = 'stable';

    if (isPhase2) {
      // Phase 2: Double the mutation rate, capped at 60%
      rateToUse = Math.min(0.60, mutationRate * 2);
      mutationType = 'explorer'; // all mutated offspring are exploring speed in Phase 2
    } else {
      // Phase 1: Explorer vs Stable split
      const spawnedSoFar = nextOffspring.length - 2; // excluding elites
      if (spawnedSoFar < numExplorers) {
        rateToUse = 0.45; // High mutation rate to explore past failure point
        mutationType = 'explorer';
      } else {
        rateToUse = 0.06; // Low mutation rate to preserve stable driving line
        mutationType = 'stable';
      }
    }

    childBrain = NeuralNetwork.mutate(childBrain, rateToUse);

    nextOffspring.push({
      brain: childBrain,
      mutationType
    });
  }

  return { nextOffspring, eliteFitness, bestCarIndex };
}
