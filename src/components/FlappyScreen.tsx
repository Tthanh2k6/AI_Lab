import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Hash, Trophy, Activity, Bird as BirdIcon } from 'lucide-react';
import { FlappyConfig } from '../types/game';
import { FLAPPY, FlappyBird, FlappyPipe, createPopulation, nextGeneration, stepWorld } from '../utils/flappy';
import flappyBirdUrl from '../assets/FlappyBird.png';

interface FlappyScreenProps {
  config: FlappyConfig;
  onBack: () => void;
}

const NET_INPUT_LABELS = ['cao độ', 'vận tốc', 'k/c ống', 'lệch khe'];

// Vẽ mạng nơ-ron (nút + cạnh theo TRỌNG SỐ): xanh = dương, đỏ = âm, dày/đậm = lớn.
function drawFlappyNet(ctx: CanvasRenderingContext2D, brain: any, W: number, H: number) {
  ctx.clearRect(0, 0, W, H);
  if (!brain?.layers?.length) return;
  const layers = brain.layers;
  const counts = [layers[0].inputs, ...layers.map((l: any) => l.outputs)];
  const cols = counts.length;
  const colX = (i: number) => 64 + (i * (W - 128)) / (cols - 1);
  const nodeY = (count: number, idx: number) => {
    const pad = 22, span = H - 2 * pad;
    return count <= 1 ? pad + span / 2 : pad + idx * (span / (count - 1));
  };
  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l];
    for (let o = 0; o < layer.outputs; o++) for (let i = 0; i < layer.inputs; i++) {
      const w = layer.weights[o][i];
      const mag = Math.min(1, Math.abs(w));
      ctx.strokeStyle = w >= 0 ? `rgba(52,211,153,${0.12 + mag * 0.7})` : `rgba(248,113,113,${0.12 + mag * 0.7})`;
      ctx.lineWidth = 0.5 + mag * 2.6;
      ctx.beginPath();
      ctx.moveTo(colX(l), nodeY(counts[l], i));
      ctx.lineTo(colX(l + 1), nodeY(counts[l + 1], o));
      ctx.stroke();
    }
  }
  for (let c = 0; c < cols; c++) for (let n = 0; n < counts[c]; n++) {
    ctx.beginPath();
    ctx.arc(colX(c), nodeY(counts[c], n), 7, 0, Math.PI * 2);
    ctx.fillStyle = c === 0 ? '#38bdf8' : c === cols - 1 ? '#fbbf24' : '#a855f7';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i < counts[0] && i < NET_INPUT_LABELS.length; i++) ctx.fillText(NET_INPUT_LABELS[i], colX(0) - 10, nodeY(counts[0], i));
  ctx.textAlign = 'left';
  ctx.fillText('Vỗ cánh', colX(cols - 1) + 10, nodeY(counts[cols - 1], 0));
}

// Font số pixel-art 3×5 (mỗi hàng 3 bit: trái-giữa-phải)
const PIX_DIGITS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
};

// Vẽ một con số kiểu pixel-art (ô trắng viền đen) căn giữa quanh cx, đỉnh tại topY.
function drawPixelNumber(ctx: CanvasRenderingContext2D, value: number, cx: number, topY: number, cell: number) {
  const s = String(value);
  const digitW = 3 * cell;
  const gap = cell; // khoảng cách giữa các chữ số
  const totalW = s.length * digitW + (s.length - 1) * gap;
  let x0 = cx - totalW / 2;

  // Lượt 1: viền đen (ô to hơn) cho mọi pixel bật
  ctx.fillStyle = '#1f2937';
  for (const ch of s) {
    const rows = PIX_DIGITS[ch];
    if (rows) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (rows[r] & (1 << (2 - c))) ctx.fillRect(x0 + c * cell - 2, topY + r * cell - 2, cell + 4, cell + 4);
      }
    }
    x0 += digitW + gap;
  }
  // Lượt 2: ô trắng
  x0 = cx - totalW / 2;
  ctx.fillStyle = '#ffffff';
  for (const ch of s) {
    const rows = PIX_DIGITS[ch];
    if (rows) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (rows[r] & (1 << (2 - c))) ctx.fillRect(x0 + c * cell, topY + r * cell, cell, cell);
      }
    }
    x0 += digitW + gap;
  }
}

export default function FlappyScreen({ config, onBack }: FlappyScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const birdsRef = useRef<FlappyBird[]>([]);
  const pipesRef = useRef<FlappyPipe[]>([]);
  const rafRef = useRef<number | null>(null);

  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const genRef = useRef(1);
  const bestScoreRef = useRef(0);
  const bestFitRef = useRef(0);
  const frameRef = useRef(0);
  const animRef = useRef(0); // đếm khung cho animation (mây, cánh chim) — luôn tăng
  const netCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const birdImgRef = useRef<HTMLImageElement | null>(null);
  const birdBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Chế độ tự chơi
  const playerModeRef = useRef(false);
  const playerRef = useRef<{ y: number; vy: number; alive: boolean; score: number } | null>(null);
  const playerWaitingRef = useRef(false); // chờ cú click đầu tiên mới bắt đầu

  const { populationSize: popSize, mutationRate, gapSize } = config;

  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [playerMode, setPlayerMode] = useState(false);
  const [playerHud, setPlayerHud] = useState({ alive: false, score: 0 });
  const [playerWaiting, setPlayerWaiting] = useState(false);
  const [stats, setStats] = useState({
    generation: 1, alive: popSize, total: popSize, score: 0, bestScore: 0, bestFitness: 0,
  });

  // Nạp sprite chim + tự dò khung bao (bbox) phần không trong suốt để vẽ cho khít, đúng vị trí
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      try {
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const octx = off.getContext('2d');
        if (octx) {
          octx.drawImage(img, 0, 0);
          const data = octx.getImageData(0, 0, img.width, img.height).data;
          let minX = img.width, minY = img.height, maxX = 0, maxY = 0, found = false;
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              if (data[(y * img.width + x) * 4 + 3] > 16) {
                found = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          birdBoxRef.current = found
            ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
            : { x: 0, y: 0, w: img.width, h: img.height };
        }
      } catch {
        birdBoxRef.current = { x: 0, y: 0, w: img.width, h: img.height };
      }
      birdImgRef.current = img;
    };
    img.src = flappyBirdUrl;
  }, []);

  useEffect(() => {
    birdsRef.current = createPopulation(popSize);
    pipesRef.current = [];
    genRef.current = 1;
    bestScoreRef.current = 0;
    bestFitRef.current = 0;
    frameRef.current = 0;

    const render = () => {
      const cv = canvasRef.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const { WIDTH: W, HEIGHT: H, GROUND_H, PIPE_W, BIRD_X, BIRD_R } = FLAPPY;
      const bottom = H - GROUND_H;

      animRef.current++;
      const t = animRef.current;

      // Bầu trời (xanh kiểu Flappy cổ điển)
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#4ec0ca');
      sky.addColorStop(1, '#9be7ec');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Mây trôi (parallax nhẹ)
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 3; i++) {
        const span = W + 160;
        const cx = (((i * 220 - t * 0.4) % span) + span) % span - 80;
        const cy = 70 + i * 70;
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.arc(cx + 28, cy + 6, 20, 0, Math.PI * 2);
        ctx.arc(cx - 26, cy + 8, 18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ống (thân ống gradient + nắp)
      const drawPipe = (x: number, top: number, h: number, capAtTop: boolean) => {
        if (h <= 0) return;
        const body = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
        body.addColorStop(0, '#3a7a23');
        body.addColorStop(0.28, '#74c948');
        body.addColorStop(0.5, '#a3e85f');
        body.addColorStop(0.72, '#62b536');
        body.addColorStop(1, '#2c6019');
        ctx.strokeStyle = '#23491a';
        ctx.lineWidth = 3;
        ctx.fillStyle = body;
        ctx.fillRect(x, top, PIPE_W, h);
        ctx.strokeRect(x, top, PIPE_W, h);
        // nắp ống (rộng hơn một chút)
        const capH = 26;
        const capY = capAtTop ? top + h - capH : top;
        ctx.fillStyle = body;
        ctx.fillRect(x - 6, capY, PIPE_W + 12, capH);
        ctx.strokeRect(x - 6, capY, PIPE_W + 12, capH);
        // dải sáng dọc thân
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x + 9, top, 6, h);
      };

      for (const p of pipesRef.current) {
        const gapTop = p.gapY - gapSize / 2;
        const gapBot = p.gapY + gapSize / 2;
        drawPipe(p.x, 0, gapTop, true);                 // ống trên
        drawPipe(p.x, gapBot, bottom - gapBot, false);  // ống dưới
      }

      // Đất: dải cỏ + nền cát + vân chéo cuộn
      ctx.fillStyle = '#ded895';
      ctx.fillRect(0, bottom, W, GROUND_H);
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, bottom, W, 12);
      ctx.fillStyle = '#5a9e23';
      ctx.fillRect(0, bottom + 12, W, 4);
      // Vân chéo TĨNH (không cuộn) để khỏi gây chóng mặt
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 6;
      for (let gx = -GROUND_H; gx < W; gx += 22) {
        ctx.beginPath();
        ctx.moveTo(gx, bottom + 18);
        ctx.lineTo(gx + GROUND_H, bottom + GROUND_H);
        ctx.stroke();
      }

      // Chim còn sống (ẩn hoàn toàn đàn AI khi đang tự chơi — chỉ còn chim của bạn)
      for (const b of birdsRef.current) {
        if (playerModeRef.current) break;
        if (!b.alive) continue;
        ctx.save();
        ctx.translate(BIRD_X, b.y);
        const tilt = Math.max(-0.5, Math.min(0.9, b.vy / 14));
        ctx.rotate(tilt);

        // Vẽ sprite Flappy Bird (cắt đúng khung bao). Chưa nạp xong thì rơi xuống bản vẽ canvas.
        const img = birdImgRef.current;
        const box = birdBoxRef.current;
        if (img && box) {
          ctx.imageSmoothingEnabled = false; // giữ nét pixel-art
          const destH = BIRD_R * 2.6;
          const destW = destH * (box.w / box.h);
          ctx.drawImage(img, box.x, box.y, box.w, box.h, -destW / 2, -destH / 2, destW, destH);
          ctx.restore();
          continue;
        }

        // cánh vỗ (lên khi đang bay lên, dao động nhẹ khi rơi)
        const flap = b.vy < 0 ? -0.6 : 0.35 + Math.sin(t * 0.4 + b.hue) * 0.18;
        ctx.save();
        ctx.translate(-3, 1);
        ctx.rotate(flap);
        ctx.fillStyle = `hsl(${b.hue}, 65%, 45%)`;
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, BIRD_R * 0.75, BIRD_R * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // thân (gradient tròn)
        const bodyGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, BIRD_R);
        bodyGrad.addColorStop(0, `hsl(${b.hue}, 90%, 72%)`);
        bodyGrad.addColorStop(1, `hsl(${b.hue}, 80%, 52%)`);
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // bụng sáng
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.beginPath();
        ctx.ellipse(-1, BIRD_R * 0.42, BIRD_R * 0.55, BIRD_R * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();

        // mắt
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(BIRD_R * 0.4, -BIRD_R * 0.35, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(BIRD_R * 0.55, -BIRD_R * 0.35, 2, 0, Math.PI * 2);
        ctx.fill();

        // mỏ
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(BIRD_R * 0.75, -3);
        ctx.lineTo(BIRD_R + 9, 1);
        ctx.lineTo(BIRD_R * 0.75, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      // Chim của người chơi (nổi bật: vòng sáng cyan + nhãn BẠN)
      const pl = playerRef.current;
      if (playerModeRef.current && pl && pl.alive) {
        const pImg = birdImgRef.current;
        const pBox = birdBoxRef.current;
        ctx.save();
        ctx.translate(BIRD_X, pl.y);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_R + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.rotate(Math.max(-0.5, Math.min(0.9, pl.vy / 14)));
        if (pImg && pBox) {
          ctx.imageSmoothingEnabled = false;
          const destH = BIRD_R * 2.6;
          const destW = destH * (pBox.w / pBox.h);
          ctx.drawImage(pImg, pBox.x, pBox.y, pBox.w, pBox.h, -destW / 2, -destH / 2, destW, destH);
        } else {
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#22d3ee';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BẠN', BIRD_X, pl.y - BIRD_R - 14);
      }

      // Số cột đã vượt — pixel-art, giữa & trên màn (ẩn khi người chơi đã thua → để bảng thua hiện)
      let showScore = 0;
      if (playerModeRef.current) {
        if (!pl || !pl.alive) { /* đang thua/chờ-thua → không vẽ */ }
        showScore = pl ? pl.score : 0;
      } else {
        let m = 0;
        for (const b of birdsRef.current) if (b.alive && b.score > m) m = b.score;
        showScore = m;
      }
      if (!playerModeRef.current || (pl && pl.alive)) {
        drawPixelNumber(ctx, showScore, FLAPPY.WIDTH / 2, 28, 13);
      }

      // Vẽ bộ não (mạng nơ-ron) của chim dẫn đầu sang panel bên
      const nc = netCanvasRef.current;
      const nctx = nc?.getContext('2d');
      if (nc && nctx) {
        let lead: FlappyBird | null = null;
        for (const b of birdsRef.current) if (b.alive && (!lead || b.fitness > lead.fitness)) lead = b;
        if (!lead && birdsRef.current.length) lead = birdsRef.current[0];
        if (lead) drawFlappyNet(nctx, lead.brain, nc.width, nc.height);
      }
    };

    // Cập nhật chim của người chơi (vật lý + va chạm); flap được kích bởi input (đặt vy ngoài).
    const stepPlayer = (newlyPassed: number) => {
      const pl = playerRef.current;
      if (!pl || !pl.alive) return;
      pl.vy += FLAPPY.GRAVITY;
      if (pl.vy > FLAPPY.MAX_FALL) pl.vy = FLAPPY.MAX_FALL; // giới hạn tốc độ rơi
      pl.y += pl.vy;
      const bottom = FLAPPY.HEIGHT - FLAPPY.GROUND_H;
      let dead = pl.y - FLAPPY.BIRD_R < 0 || pl.y + FLAPPY.BIRD_R > bottom;
      if (!dead) {
        for (const p of pipesRef.current) {
          const withinX = FLAPPY.BIRD_X + FLAPPY.BIRD_R > p.x && FLAPPY.BIRD_X - FLAPPY.BIRD_R < p.x + FLAPPY.PIPE_W;
          if (withinX) {
            const gapTop = p.gapY - gapSize / 2;
            const gapBot = p.gapY + gapSize / 2;
            if (pl.y - FLAPPY.BIRD_R < gapTop || pl.y + FLAPPY.BIRD_R > gapBot) { dead = true; break; }
          }
        }
      }
      if (dead) {
        pl.alive = false;
        setPlayerHud({ alive: false, score: pl.score });
        return;
      }
      if (newlyPassed > 0) pl.score += newlyPassed;
    };

    const loop = () => {
      // Tự chơi: khi đang chờ cú click đầu tiên → đóng băng (không rơi, không cuộn) để khỏi chết oan
      const waitingToStart = playerModeRef.current && playerWaitingRef.current;
      if (runningRef.current && !waitingToStart) {
        let aliveCount = birdsRef.current.length;
        let maxScore = 0;
        // Tự chơi → ép tốc độ 1× cho người chơi kịp phản ứng
        const steps = playerModeRef.current ? 1 : speedRef.current;
        for (let s = 0; s < steps; s++) {
          const r = stepWorld(birdsRef.current, pipesRef.current, gapSize);
          aliveCount = r.aliveCount;
          maxScore = Math.max(maxScore, r.maxScore);
          if (playerModeRef.current) stepPlayer(r.newlyPassed);
          if (aliveCount === 0) {
            const bestFit = birdsRef.current.reduce((m, b) => Math.max(m, b.fitness), 0);
            if (bestFit > bestFitRef.current) bestFitRef.current = Math.round(bestFit);
            birdsRef.current = nextGeneration(birdsRef.current, popSize, mutationRate);
            // Khi đang tự chơi, KHÔNG xóa ống để lượt của người chơi không bị gián đoạn
            if (!playerModeRef.current) pipesRef.current = [];
            genRef.current += 1;
            aliveCount = popSize;
            break;
          }
        }
        if (maxScore > bestScoreRef.current) bestScoreRef.current = maxScore;
        if (playerModeRef.current && playerRef.current?.alive && frameRef.current % 5 === 0) {
          setPlayerHud({ alive: true, score: playerRef.current.score });
        }

        frameRef.current++;
        if (frameRef.current % 5 === 0) {
          setStats({
            generation: genRef.current,
            alive: aliveCount,
            total: popSize,
            score: maxScore,
            bestScore: bestScoreRef.current,
            bestFitness: bestFitRef.current,
          });
        }
      }
      render();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [popSize, gapSize, mutationRate]);

  const toggleRun = () => {
    runningRef.current = !runningRef.current;
    setIsRunning(runningRef.current);
  };

  const handleSpeed = (s: number) => {
    speedRef.current = s;
    setSimSpeed(s);
  };

  const handleReset = () => {
    birdsRef.current = createPopulation(popSize);
    pipesRef.current = [];
    genRef.current = 1;
    bestScoreRef.current = 0;
    bestFitRef.current = 0;
    frameRef.current = 0;
    setStats({ generation: 1, alive: popSize, total: popSize, score: 0, bestScore: 0, bestFitness: 0 });
  };

  // ── Chế độ tự chơi ──
  const spawnPlayer = () => {
    playerRef.current = { y: FLAPPY.HEIGHT / 2, vy: 0, alive: true, score: 0 };
    pipesRef.current = []; // xóa ống → có ~3s bay trống mỗi lần vào/chơi lại
    playerWaitingRef.current = true; // chờ click đầu tiên mới rơi/bắt đầu
    setPlayerWaiting(true);
    setPlayerHud({ alive: true, score: 0 });
  };

  const flapPlayer = () => {
    if (!playerModeRef.current) return;
    const pl = playerRef.current;
    if (pl && pl.alive) {
      if (playerWaitingRef.current) {
        playerWaitingRef.current = false; // cú click đầu tiên → bắt đầu
        setPlayerWaiting(false);
      }
      pl.vy = FLAPPY.JUMP;
    } else {
      spawnPlayer(); // đã chết → bấm để chơi lại (vẫn chờ click kế tiếp mới bắt đầu)
    }
  };

  const togglePlayer = () => {
    const on = !playerModeRef.current;
    playerModeRef.current = on;
    setPlayerMode(on);
    if (on) {
      speedRef.current = 1;
      setSimSpeed(1);
      runningRef.current = true;
      setIsRunning(true);
      spawnPlayer();
    } else {
      playerRef.current = null;
      setPlayerHud({ alive: false, score: 0 });
    }
  };

  // Phím Space / mũi tên lên để vỗ cánh (chỉ tác dụng ở chế độ tự chơi)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (playerModeRef.current) {
          e.preventDefault();
          flapPlayer();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="arena-container flex flex-col h-screen w-full">
      {/* HEADER */}
      <header className="arena-header flex items-center justify-between p-4 glass-panel border-b border-slate-800/50 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-2 px-3 text-xs flex gap-2">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-xl font-bold font-mono text-white tracking-wider flex items-center gap-2">
              <BirdIcon className="w-5 h-5 text-amber-400" /> FLAPPY BIRD AI
            </h1>
            <span className="text-[10px] text-amber-400/70 uppercase tracking-widest font-mono">
              NEUROEVOLUTION • NN + GENETIC ALGORITHM
            </span>
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-purple-500/10">
            <Hash className="w-3.5 h-3.5 text-purple-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">THẾ HỆ</span>
              <span className="text-xs font-bold text-white font-mono">{stats.generation}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-emerald-500/10">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">CÒN SỐNG</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">{stats.alive} / {stats.total}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-cyan-500/10">
            <Trophy className="w-3.5 h-3.5 text-cyan-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">ĐIỂM (NAY / KỶ LỤC)</span>
              <span className="text-xs font-bold text-cyan-400 font-mono">{stats.score} / {stats.bestScore}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-amber-500/10">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">FITNESS TỐT NHẤT</span>
              <span className="text-xs font-bold text-amber-400 font-mono">{stats.bestFitness}</span>
            </div>
          </div>
          {playerMode && (
            <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-cyan-400/40">
              <BirdIcon className="w-3.5 h-3.5 text-cyan-300" />
              <div>
                <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">ĐIỂM CỦA BẠN</span>
                <span className="text-xs font-bold text-cyan-300 font-mono">{playerHud.score}</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-lg p-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold pl-1.5">TỐC ĐỘ:</span>
            <div className="flex gap-0.5">
              {[1, 2, 4, 8, 15].map(s => (
                <button
                  key={s}
                  disabled={playerMode}
                  onClick={() => handleSpeed(s)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                    playerMode
                      ? 'text-slate-700 cursor-not-allowed'
                      : simSpeed === s ? 'bg-purple-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={togglePlayer}
            className={`cyber-btn py-2 px-3 flex items-center gap-1.5 text-xs font-bold ${
              playerMode ? 'cyber-btn-emerald shadow-[0_0_12px_rgba(34,211,238,0.4)]' : 'cyber-btn-outline text-cyan-300 border-cyan-900/50 hover:bg-cyan-900/20'
            }`}
          >
            <BirdIcon className="w-3.5 h-3.5" /> {playerMode ? 'ĐANG TỰ CHƠI' : 'TỰ CHƠI'}
          </button>
          <button onClick={handleReset} className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-amber-400 border-amber-900/50 hover:bg-amber-900/20">
            <RefreshCw className="w-3.5 h-3.5" /> LÀM LẠI
          </button>
          <button
            onClick={toggleRun}
            className={`cyber-btn py-2 px-3.5 flex items-center gap-1.5 text-xs ${isRunning ? 'cyber-btn-outline text-rose-400 border-rose-900/50 hover:bg-rose-900/20' : 'cyber-btn-emerald'}`}
          >
            {isRunning ? <><Square className="w-3.5 h-3.5" /> DỪNG</> : <><Play className="w-3.5 h-3.5" /> CHẠY</>}
          </button>
        </div>
      </header>

      {/* CANVAS + panel bộ não */}
      <div className="flex-grow flex items-stretch justify-center gap-4 p-4 overflow-hidden">
        <div className="flex-1 flex items-center justify-center min-w-0">
        <div
          className="relative"
          style={{ width: '100%', maxHeight: '100%', aspectRatio: `${FLAPPY.WIDTH} / ${FLAPPY.HEIGHT}` }}
        >
          <canvas
            ref={canvasRef}
            width={FLAPPY.WIDTH}
            height={FLAPPY.HEIGHT}
            onPointerDown={flapPlayer}
            className={`rounded-xl shadow-2xl border border-slate-700/50 w-full h-full block ${playerMode ? 'cursor-pointer' : ''}`}
          />

          {/* Gợi ý khi đang tự chơi */}
          {playerMode && playerHud.alive && (
            <div className={`absolute left-1/2 -translate-x-1/2 bg-slate-950/70 border border-cyan-500/30 rounded-full px-3 py-1 font-mono text-cyan-300 pointer-events-none ${playerWaiting ? 'top-1/3 text-sm font-bold animate-pulse' : 'top-3 text-[10px]'}`}>
              {playerWaiting ? '▶ Nhấn SPACE / click để BẮT ĐẦU' : 'Nhấn SPACE hoặc click để bay'}
            </div>
          )}

          {/* Lớp phủ khi thua */}
          {playerMode && !playerHud.alive && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 rounded-xl">
              <div className="bg-slate-900/95 border border-cyan-500/30 rounded-2xl px-8 py-6 text-center flex flex-col items-center gap-3 shadow-2xl">
                <span className="text-lg font-bold font-mono text-white tracking-wider">BẠN THUA!</span>
                <span className="text-sm font-mono text-slate-400">
                  Điểm của bạn: <span className="text-cyan-300 font-bold">{playerHud.score}</span>
                </span>
                <button onClick={spawnPlayer} className="cyber-btn cyber-btn-emerald py-2 px-5 text-xs mt-1 flex items-center gap-2">
                  <Play className="w-4 h-4" /> CHƠI LẠI (SPACE)
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Panel: bộ não AI (mạng nơ-ron) của chim dẫn đầu */}
        <div className="hidden lg:flex flex-col gap-2 glass-panel p-3 w-[290px] shrink-0">
          <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4" /> Bộ Não AI (chim dẫn đầu)
          </span>
          <canvas
            ref={netCanvasRef}
            width={266}
            height={210}
            className="rounded-lg border border-slate-800 bg-slate-950/60 w-full"
          />
          <div className="text-[10px] font-mono text-slate-400 leading-relaxed">
            <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 rounded-full bg-sky-400"></span> Input (cảm nhận) → <span className="w-3 h-3 rounded-full bg-purple-500"></span> ẩn → <span className="w-3 h-3 rounded-full bg-amber-400"></span> output</div>
            <div className="flex items-center gap-2"><span className="inline-block w-5 h-0.5 bg-emerald-400"></span> trọng số dương &nbsp; <span className="inline-block w-5 h-0.5 bg-rose-400"></span> âm</div>
            <p className="mt-2">Độ dày/đậm của cạnh = độ lớn trọng số. Khi tiến hóa, mạng của chim giỏi nhất đổi dần — đây là "bộ não" đang học.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
