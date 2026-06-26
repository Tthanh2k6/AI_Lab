import { NeuralNetworkType } from '../types/game';
import { NeuralNetwork } from './racingPhysics';

// ============================================================================
// FLAPPY BIRD — Tham số thế giới
// ============================================================================

export const FLAPPY = {
  WIDTH: 960,        // màn hình ngang (landscape)
  HEIGHT: 600,
  GROUND_H: 80,
  BIRD_X: 150,
  BIRD_R: 14,
  GRAVITY: 0.20,     // trọng lực nhẹ → chim rơi chậm, dễ kiểm soát
  JUMP: -4.2,        // lực vỗ vừa phải → mỗi cú vỗ nhích lên ~44px (lọt khe gọn)
  MAX_FALL: 4.5,     // tốc độ rơi tối đa → hạ xuống chậm, không lao quá đà đâm cột dưới
  PIPE_W: 72,
  PIPE_SPEED: 2.2,   // tốc độ cuộn chậm hơn → dễ kiểm soát
  PIPE_SPACING: 336, // khoảng cách ngang giữa các ống (px) — đã dãn thêm 20%
  PIPE_MARGIN: 60,   // khe không sinh quá sát mép trên/dưới
  GRACE_TICKS: 180,  // ~3s đầu (60 tick/s) không có vật cản để khởi động
};

// Kiến trúc mạng: 4 input → 6 hidden → 1 output (vỗ cánh nếu > 0)
const NET_SHAPE = [4, 6, 1];

export interface FlappyBird {
  brain: NeuralNetworkType;
  y: number;
  vy: number;
  alive: boolean;
  fitness: number;
  score: number; // số ống đã vượt trong lượt hiện tại
  hue: number;   // màu sắc đa dạng
}

export interface FlappyPipe {
  x: number;
  gapY: number;   // tâm khe
  scored: boolean;
}

const playableBottom = () => FLAPPY.HEIGHT - FLAPPY.GROUND_H;

function spawnY(gapSize: number): number {
  const top = FLAPPY.PIPE_MARGIN + gapSize / 2;
  const bottom = playableBottom() - FLAPPY.PIPE_MARGIN - gapSize / 2;
  return top + Math.random() * Math.max(1, bottom - top);
}

function makeBird(brain: NeuralNetworkType, hue: number): FlappyBird {
  return { brain, y: FLAPPY.HEIGHT / 2, vy: 0, alive: true, fitness: 0, score: 0, hue };
}

export function createPopulation(n: number): FlappyBird[] {
  const birds: FlappyBird[] = [];
  for (let i = 0; i < n; i++) {
    birds.push(makeBird(NeuralNetwork.create(NET_SHAPE), Math.floor((i / n) * 360)));
  }
  return birds;
}

/** Ống đầu tiên còn nằm trước hoặc ngang chim (ống mà chim sắp phải vượt). */
export function nextPipe(pipes: FlappyPipe[]): FlappyPipe | null {
  for (const p of pipes) {
    if (p.x + FLAPPY.PIPE_W >= FLAPPY.BIRD_X) return p;
  }
  return null;
}

/** Mạng neural quyết định có vỗ cánh không. */
export function decideFlap(bird: FlappyBird, pipes: FlappyPipe[]): boolean {
  const np = nextPipe(pipes);
  const inputs = [
    bird.y / FLAPPY.HEIGHT,
    Math.max(-1, Math.min(1, bird.vy / 12)),
    np ? (np.x - FLAPPY.BIRD_X) / FLAPPY.WIDTH : 1,
    np ? (np.gapY - bird.y) / FLAPPY.HEIGHT : 0,
  ];
  const out = NeuralNetwork.feedForward(bird.brain, inputs);
  return out[0] > 0;
}

/** Bộ điều khiển bằng quy tắc (chơi giỏi, hiếm khi chết) — dùng cho màn mô phỏng. */
export function heuristicFlap(bird: FlappyBird, pipes: FlappyPipe[]): boolean {
  const np = nextPipe(pipes);
  // Khi cột còn xa thì giữ ở giữa màn; chỉ "khóa" vào khe khi cột tới gần → bay tự nhiên, không dính trần.
  // Giữ giữa màn khi cột còn xa; khóa vào khe khi cột tới gần. Vỗ khi chim ở DƯỚI (tâm khe + 20)
  // → bay hơi thấp trong lỗ, dao động nhỏ, rất bền (đã test qua nhiều độ rộng khe).
  const close = !!np && np.x - FLAPPY.BIRD_X < 500;
  const target = close ? np!.gapY : FLAPPY.HEIGHT / 2;
  return bird.y > target + 20;
}

/** Tạo thế hệ mới: giữ tinh hoa + lai ghép/đột biến từ nhóm dẫn đầu. */
export function nextGeneration(birds: FlappyBird[], n: number, mutationRate: number): FlappyBird[] {
  const ranked = [...birds].sort((a, b) => b.fitness - a.fitness);
  const poolSize = Math.max(2, Math.floor(ranked.length * 0.5));
  const pool = ranked.slice(0, poolSize);
  const pick = () => pool[Math.floor(Math.random() * pool.length)];

  const next: FlappyBird[] = [];

  // Tinh hoa: giữ nguyên 1-2 con giỏi nhất (không đột biến)
  const eliteCount = Math.min(2, ranked.length);
  for (let i = 0; i < eliteCount && next.length < n; i++) {
    next.push(makeBird(NeuralNetwork.copy(ranked[i].brain), ranked[i].hue));
  }

  // Phần còn lại: lai ghép 2 cha mẹ từ nhóm dẫn đầu rồi đột biến
  let idx = next.length;
  while (next.length < n) {
    const child = NeuralNetwork.mutate(NeuralNetwork.crossover(pick().brain, pick().brain), mutationRate);
    next.push(makeBird(child, Math.floor((idx / n) * 360)));
    idx++;
  }
  return next;
}

export interface FlappyStepResult {
  aliveCount: number;
  maxScore: number;    // điểm cao nhất trong các chim còn sống ở lượt này
  newlyPassed: number; // số ống vừa vượt qua mốc chim trong tick này (cho người chơi dùng)
}

/**
 * Tiến 1 tick thế giới: di chuyển ống, sinh ống mới, cập nhật từng chim.
 * Trả về số chim còn sống + điểm cao nhất hiện tại.
 */
export function stepWorld(
  birds: FlappyBird[],
  pipes: FlappyPipe[],
  gapSize: number,
  decide: (bird: FlappyBird, pipes: FlappyPipe[]) => boolean = decideFlap,
): FlappyStepResult {
  // 1) Di chuyển ống, bỏ ống đã ra khỏi màn
  for (const p of pipes) p.x -= FLAPPY.PIPE_SPEED;
  while (pipes.length && pipes[0].x + FLAPPY.PIPE_W < 0) pipes.shift();

  // 2) Sinh ống mới khi cần. Ống ĐẦU TIÊN của mỗi lượt đặt xa hơn để có ~3s bay trống
  //    (đảm bảo ống đầu chỉ tới mốc chim sau ít nhất GRACE_TICKS tick).
  if (pipes.length === 0) {
    const firstX = Math.max(FLAPPY.WIDTH, FLAPPY.BIRD_X + FLAPPY.PIPE_SPEED * FLAPPY.GRACE_TICKS);
    pipes.push({ x: firstX, gapY: spawnY(gapSize), scored: false });
  } else {
    const lastX = pipes[pipes.length - 1].x;
    if (lastX < FLAPPY.WIDTH - FLAPPY.PIPE_SPACING) {
      pipes.push({ x: FLAPPY.WIDTH, gapY: spawnY(gapSize), scored: false });
    }
  }

  // 2.5) Đếm ống VỪA vượt qua mốc chim (đánh dấu 1 lần qua cờ scored) — bền vững kể cả
  //      khi ống sau đó biến mất khỏi màn (tránh lỗi đếm lại bị tụt điểm).
  let newlyPassed = 0;
  for (const p of pipes) {
    if (!p.scored && p.x + FLAPPY.PIPE_W < FLAPPY.BIRD_X) {
      p.scored = true;
      newlyPassed++;
    }
  }

  // 3) Cập nhật từng chim
  const bottom = playableBottom();
  let aliveCount = 0;
  let maxScore = 0;

  for (const bird of birds) {
    if (!bird.alive) continue;

    if (decide(bird, pipes)) bird.vy = FLAPPY.JUMP;
    bird.vy += FLAPPY.GRAVITY;
    if (bird.vy > FLAPPY.MAX_FALL) bird.vy = FLAPPY.MAX_FALL; // giới hạn tốc độ rơi
    bird.y += bird.vy;
    bird.fitness += 1;

    // Va chạm trần / đất
    if (bird.y - FLAPPY.BIRD_R < 0 || bird.y + FLAPPY.BIRD_R > bottom) {
      bird.alive = false;
      continue;
    }

    // Va chạm ống
    for (const p of pipes) {
      const withinX = FLAPPY.BIRD_X + FLAPPY.BIRD_R > p.x && FLAPPY.BIRD_X - FLAPPY.BIRD_R < p.x + FLAPPY.PIPE_W;
      if (withinX) {
        const gapTop = p.gapY - gapSize / 2;
        const gapBot = p.gapY + gapSize / 2;
        if (bird.y - FLAPPY.BIRD_R < gapTop || bird.y + FLAPPY.BIRD_R > gapBot) {
          bird.alive = false;
          break;
        }
      }
    }

    if (!bird.alive) continue;

    // Tính điểm theo sự kiện vượt ống (chỉ cộng cho chim còn sống ở tick này)
    if (newlyPassed > 0) {
      bird.fitness += 100 * newlyPassed; // thưởng lớn mỗi ống vượt được
      bird.score += newlyPassed;
    }

    aliveCount++;
    if (bird.score > maxScore) maxScore = bird.score;
  }

  return { aliveCount, maxScore, newlyPassed };
}
