import React, { useEffect, useRef, useState } from 'react';
import { Play, Settings, ArrowLeft, RefreshCw, Brain } from 'lucide-react';
import { AIConfig, AIAlgorithm, RacingConfig, FlappyConfig, Game2048Config, QMazeConfig, Connect4Config, SoccerConfig, TagConfig, CellWarConfig } from '../types/game';
import { getZeroWeights } from '../utils/trainer';
import { getPresetTrack } from '../utils/racingPhysics';
import { generateTrack, parseSeed, randomSeed, seedToString } from '../utils/trackGen';
import { FLAPPY, FlappyPipe, createPopulation, stepWorld, heuristicFlap } from '../utils/flappy';
import { TAG, TAG_MAPS } from '../utils/tagGame';
import { MAP_SIZES, STRATEGIES, FACTION_COLORS, MapSizeKey } from '../utils/cellwar';
import Game2048Preview from './Game2048Preview';
import QMazePreview from './QMazePreview';
import Connect4Preview from './Connect4Preview';
import SoccerPreview from './SoccerPreview';
import TrackBuilder from './TrackBuilder';

// Bản đồ nhìn-từ-trên của phòng Đuổi bắt đang chọn (hộp + tường + điểm xuất phát).
const TAG_CUBE_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6'];
function TagMapPreview({ mapIdx, size = 420 }: { mapIdx: number; size?: number }) {
  const map = TAG_MAPS[mapIdx] ?? TAG_MAPS[0];
  const L = TAG.LENGTH, W = TAG.WIDTH;
  const h = (size * W) / L;
  const sx = (x: number) => ((x + L / 2) / L) * size;
  const sy = (y: number) => ((y + W / 2) / W) * h;
  const ss = (v: number) => (v / L) * size;
  const cs = ss(TAG.CUBE_SIZE);
  const spawn = (L / 2 - 20) * 0.65; // khớp spawnPos initial
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}
      className="max-w-full border border-slate-800 rounded-xl shadow-2xl" style={{ background: '#0b1120' }}>
      {/* lưới */}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`v${i}`} x1={(size / 10) * i} y1={0} x2={(size / 10) * i} y2={h} stroke="#1e293b" strokeWidth={1} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <line key={`hh${i}`} x1={0} y1={(h / 7) * i} x2={size} y2={(h / 7) * i} stroke="#1e293b" strokeWidth={1} />
      ))}
      {/* viền sân */}
      <rect x={1} y={1} width={size - 2} height={h - 2} fill="none" stroke="#6366f1" strokeWidth={2} opacity={0.6} />
      {/* tường */}
      {map.walls.map((wl, i) => (
        <rect key={`w${i}`} x={sx(wl.x - wl.w / 2)} y={sy(wl.y - wl.h / 2)} width={ss(wl.w)} height={ss(wl.h)}
          fill="#475569" stroke="#93c5fd" strokeWidth={1.5} rx={2} />
      ))}
      {/* hộp */}
      {map.cubes.map((c, i) => (
        <rect key={`c${i}`} x={sx(c.x) - cs / 2} y={sy(c.y) - cs / 2} width={cs} height={cs}
          fill={TAG_CUBE_COLORS[i % TAG_CUBE_COLORS.length]} opacity={0.9} rx={2} />
      ))}
      {/* điểm xuất phát */}
      <circle cx={sx(-spawn)} cy={sy(0)} r={ss(5)} fill="#3b82f6" />
      <circle cx={sx(spawn)} cy={sy(0)} r={ss(5)} fill="#f97316" />
      <text x={sx(-spawn)} y={sy(0) - ss(8)} fill="#60a5fa" fontSize={11} fontFamily="monospace" textAnchor="middle">KAI</text>
      <text x={sx(spawn)} y={sy(0) - ss(8)} fill="#fb923c" fontSize={11} fontFamily="monospace" textAnchor="middle">ALBERT</text>
    </svg>
  );
}

// Xem trước Cell War: nền lưới + thủ phủ các phe xếp vòng tròn (như lúc khởi đầu).
function CellWarPreview({ numFactions, sizeKey, size = 420 }: { numFactions: number; sizeKey: MapSizeKey; size?: number }) {
  const { cols, rows } = MAP_SIZES[sizeKey];
  const h = (size * rows) / cols;
  const N = Math.max(2, Math.min(FACTION_COLORS.length, numFactions));
  const caps = Array.from({ length: N }).map((_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return {
      x: size / 2 + Math.cos(a) * size * 0.32,
      y: h / 2 + Math.sin(a) * h * 0.32,
      c: FACTION_COLORS[i].hex,
      s: STRATEGIES[i % STRATEGIES.length].name,
    };
  });
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}
      className="max-w-full border border-slate-800 rounded-xl shadow-2xl" style={{ background: '#0a0f1c' }}>
      {Array.from({ length: 13 }).map((_, i) => (
        <line key={`v${i}`} x1={(size / 12) * i} y1={0} x2={(size / 12) * i} y2={h} stroke="#1e293b" strokeWidth={1} />
      ))}
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={(h / 8) * i} x2={size} y2={(h / 8) * i} stroke="#1e293b" strokeWidth={1} />
      ))}
      <rect x={1} y={1} width={size - 2} height={h - 2} fill="none" stroke="#10b981" strokeWidth={2} opacity={0.5} />
      {caps.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={size * 0.05} fill={c.c} opacity={0.25} />
          <rect x={c.x - size * 0.022} y={c.y - size * 0.022} width={size * 0.044} height={size * 0.044} fill={c.c} rx={2} />
          <text x={c.x} y={c.y + size * 0.06} fill={c.c} fontSize={11} fontFamily="monospace" textAnchor="middle">{c.s}</text>
        </g>
      ))}
    </svg>
  );
}

interface SetupScreenProps {
  gameType: 'caro' | 'racing' | 'flappy' | '2048' | 'qmaze' | 'connect4' | 'soccer' | 'tag' | 'cellwar';
  onBack: () => void;
  onLaunchArena: (config1: AIConfig, config2: AIConfig, initFromScratch: boolean, timeLimitMs: number) => void;
  onLaunchRacing: (config: RacingConfig) => void;
  onLaunchFlappy: (config: FlappyConfig) => void;
  onLaunch2048: (config: Game2048Config) => void;
  onLaunchQMaze: (config: QMazeConfig) => void;
  onLaunchConnect4: (config: Connect4Config) => void;
  onLaunchSoccer: (config: SoccerConfig) => void;
  onLaunchTag: (config: TagConfig) => void;
  onLaunchCellWar: (config: CellWarConfig) => void;
}

export default function SetupScreen({ gameType, onBack, onLaunchArena, onLaunchRacing, onLaunchFlappy, onLaunch2048, onLaunchQMaze, onLaunchConnect4, onLaunchSoccer, onLaunchTag, onLaunchCellWar }: SetupScreenProps) {
  // Caro Config states
  const [algo1, setAlgo1] = useState<AIAlgorithm>('MINIMAX');
  const [algo2, setAlgo2] = useState<AIAlgorithm>('MCTS');
  const [depth1, setDepth1] = useState<number>(3);
  const [depth2, setDepth2] = useState<number>(3);
  const [sims1, setSims1] = useState<number>(200);
  const [sims2, setSims2] = useState<number>(200);
  const [timeLimit, setTimeLimit] = useState<number>(100);
  const [explorationC, setExplorationC] = useState<number>(1.4);

  // Racing Config states
  const [numCars, setNumCars] = useState<number>(100);
  const [numSensors, setNumSensors] = useState<number>(5);
  const [mutationRate, setMutationRate] = useState<number>(0.15); // 15%
  const [speed, setSpeed] = useState<number>(3.6); // px/frame — hiển thị ×10 thành km/h
  const [trackId, setTrackId] = useState<string>('procedural');
  const [enableFailureAvoidance, setEnableFailureAvoidance] = useState<boolean>(true);
  const [enablePlayerCar, setEnablePlayerCar] = useState<boolean>(false);
  const [showTrackBuilder, setShowTrackBuilder] = useState<boolean>(false);

  // ── Map thủ tục (procedural) ──
  // seed quyết định toàn bộ hình dạng; difficulty quyết định độ gắt của địa hình
  const [trackSeed, setTrackSeed] = useState<number>(() => randomSeed());
  const [seedInput, setSeedInput] = useState<string>('');
  const [trackDifficulty, setTrackDifficulty] = useState<number>(3);

  // Sinh map ngay khi seed/difficulty đổi — dùng cho cả preview lẫn lúc phóng game
  const proceduralTrack = React.useMemo(
    () => generateTrack({ seed: trackSeed, difficulty: trackDifficulty }),
    [trackSeed, trackDifficulty]
  );

  const rollNewSeed = () => {
    const s = randomSeed();
    setTrackSeed(s);
    setSeedInput('');
    setTrackId('procedural');
  };

  const applySeedInput = () => {
    setTrackSeed(parseSeed(seedInput));
    setTrackId('procedural');
  };

  // Flappy Bird Config states
  const [flappyPopulation, setFlappyPopulation] = useState<number>(150);
  const [flappyMutationRate, setFlappyMutationRate] = useState<number>(0.1);
  const [flappyGap, setFlappyGap] = useState<number>(160);

  // 2048 Config state
  const [g2048Speed, setG2048Speed] = useState<number>(4);

  // Q-learning Maze Config state
  const [qSize, setQSize] = useState<number>(12);
  const [qSpeed, setQSpeed] = useState<number>(25);

  // Connect Four Config state
  const [c4Depth, setC4Depth] = useState<number>(6);
  const [c4Speed, setC4Speed] = useState<number>(2);

  // Soccer Config state
  const [soccerMutation, setSoccerMutation] = useState<number>(0.1);
  const [soccerSpeed, setSoccerSpeed] = useState<number>(2);

  // Tag game Config state
  const [tagMutation, setTagMutation] = useState<number>(0.12);
  const [tagSpeed, setTagSpeed] = useState<number>(2);
  const [tagMapIdx, setTagMapIdx] = useState<number>(0);
  const [tagVision, setTagVision] = useState<boolean>(true);

  // Cell War Config state
  const [cwFactions, setCwFactions] = useState<number>(5);
  const [cwMapSize, setCwMapSize] = useState<MapSizeKey>('medium');
  const [cwGrowth, setCwGrowth] = useState<number>(1);
  const [cwSpeed, setCwSpeed] = useState<number>(4);

  // Canvas ref for the lightweight looping simulator on the left
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // State to show some dynamic text on the simulation side
  const [simStats, setSimStats] = useState({
    games: 14,
    xWins: 8,
    oWins: 6,
    avgMoves: 34
  });

  // Loop simulation logic on 12x12 mini-board for Caro
  useEffect(() => {
    if (gameType !== 'caro') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 12;
    const padding = 20;
    let board: (string | null)[][] = Array(size).fill(null).map(() => Array(size).fill(null));
    let isXTurn = true;
    let gameOver = false;
    let animationId: number;
    let lastMoveTime = Date.now();
    const moveInterval = 400; // ms per move

    // Generate valid neighborhood moves for the loop
    const getMiniCandidates = () => {
      const candidates: {r: number, c: number}[] = [];
      let hasStones = false;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] !== null) {
            hasStones = true;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === null) {
                  if (!candidates.some(cand => cand.r === nr && cand.c === nc)) {
                    candidates.push({ r: nr, c: nc });
                  }
                }
              }
            }
          }
        }
      }
      if (!hasStones) return [{ r: 6, c: 6 }];
      return candidates;
    };

    // Draw grid
    const draw = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      const cellSize = (width - padding * 2) / size;

      ctx.clearRect(0, 0, width, height);

      // Draw Grid Background Glow
      ctx.fillStyle = '#0a0d18';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid Lines
      ctx.strokeStyle = 'rgba(124, 58, 237, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= size; i++) {
        const pos = padding + i * cellSize;
        // Verticals
        ctx.beginPath();
        ctx.moveTo(pos, padding);
        ctx.lineTo(pos, height - padding);
        ctx.stroke();

        // Horizontals
        ctx.beginPath();
        ctx.moveTo(padding, pos);
        ctx.lineTo(width - padding, pos);
        ctx.stroke();
      }

      // Draw Stones
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const stone = board[r][c];
          if (!stone) continue;

          const cx = padding + c * cellSize + cellSize / 2;
          const cy = padding + r * cellSize + cellSize / 2;
          const radius = cellSize * 0.38;

          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);

          if (stone === 'X') {
            // Draw Glowing X stone (neon purple)
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#c084fc';
            ctx.fill();
            ctx.shadowBlur = 0; // reset

            // X symbol outline
            ctx.strokeStyle = '#06070d';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - radius/2, cy - radius/2);
            ctx.lineTo(cx + radius/2, cy + radius/2);
            ctx.moveTo(cx + radius/2, cy - radius/2);
            ctx.lineTo(cx - radius/2, cy + radius/2);
            ctx.stroke();
          } else {
            // Draw Glowing O stone (neon cyan)
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#22d3ee';
            ctx.fill();
            ctx.shadowBlur = 0; // reset

            // O symbol outline
            ctx.strokeStyle = '#06070d';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Radar scan line effect
      const now = Date.now();
      const scanY = padding + ((now % 3000) / 3000) * (height - padding * 2);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, scanY);
      ctx.lineTo(width - padding, scanY);
      ctx.stroke();
      
      // Horizontal laser glow
      ctx.fillStyle = 'rgba(6, 182, 212, 0.03)';
      ctx.fillRect(padding, scanY - 15, width - padding * 2, 15);
    };

    // Quick winner check for mini simulation
    const checkMiniWin = (): boolean => {
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const p = board[r][c];
          if (!p) continue;
          for (const [dr, dc] of dirs) {
            let len = 1;
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === p) {
              len++;
              nr += dr;
              nc += dc;
            }
            if (len >= 5) return true;
          }
        }
      }
      return false;
    };

    const isMiniFull = (): boolean => {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] === null) return false;
        }
      }
      return true;
    };

    // Main animation loop
    const run = () => {
      draw();

      if (!gameOver && Date.now() - lastMoveTime > moveInterval) {
        const moves = getMiniCandidates();
        if (moves.length > 0) {
          const player = isXTurn ? 'X' : 'O';
          
          let selected = moves[0];
          let bestScore = -1;

          // Simple local evaluation for simulation coolness
          moves.forEach(m => {
            let score = 0;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = m.r + dr;
                const nc = m.c + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                  if (board[nr][nc] === player) score += 2;
                  else if (board[nr][nc] !== null) score += 1;
                }
              }
            }
            score += Math.random() * 1.5;
            if (score > bestScore) {
              bestScore = score;
              selected = m;
            }
          });

          board[selected.r][selected.c] = player;

          if (checkMiniWin()) {
            gameOver = true;
            setSimStats(prev => ({
              games: prev.games + 1,
              xWins: player === 'X' ? prev.xWins + 1 : prev.xWins,
              oWins: player === 'O' ? prev.oWins + 1 : prev.oWins,
              avgMoves: Math.round((prev.avgMoves * prev.games + 25) / (prev.games + 1))
            }));
            
            setTimeout(() => {
              board = Array(size).fill(null).map(() => Array(size).fill(null));
              gameOver = false;
              isXTurn = true;
            }, 2500);
          } else if (isMiniFull()) {
            gameOver = true;
            setTimeout(() => {
              board = Array(size).fill(null).map(() => Array(size).fill(null));
              gameOver = false;
              isXTurn = true;
            }, 2500);
          } else {
            isXTurn = !isXTurn;
          }
        }
        lastMoveTime = Date.now();
      }

      animationId = requestAnimationFrame(run);
    };

    run();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameType]);

  // Loop simulation logic for Racing (Mini dynamic track loops)
  useEffect(() => {
    if (gameType !== 'racing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load actual track centerline points
    const track = trackId === 'procedural' ? proceduralTrack : getPresetTrack(trackId);
    const theme = track.theme;

    // Compute bounding box to scale and center on 450x450 canvas
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    track.centerLine.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    const trackW = maxX - minX;
    const trackH = maxY - minY;
    const maxDim = Math.max(trackW, trackH);
    const scale = 320 / (maxDim || 1); // 320px bounding box inside 450px canvas

    const trackCenterX = (minX + maxX) / 2;
    const trackCenterY = (minY + maxY) / 2;
    const canvasCenterX = 225;
    const canvasCenterY = 225;

    let theta1 = 0;
    let theta2 = Math.PI / 3;
    let animationId: number;

    const getTrackPoint = (a: number): { x: number; y: number; angle: number } => {
      const n = track.centerLine.length;
      const normalizedA = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const percent = normalizedA / (2 * Math.PI);
      const indexFloat = percent * n;
      const i1 = Math.floor(indexFloat) % n;
      const i2 = (i1 + 1) % n;
      const t = indexFloat - Math.floor(indexFloat);

      const pt1 = track.centerLine[i1];
      const pt2 = track.centerLine[i2];

      const x = canvasCenterX + (pt1.x + (pt2.x - pt1.x) * t - trackCenterX) * scale;
      const y = canvasCenterY + (pt1.y + (pt2.y - pt1.y) * t - trackCenterY) * scale;

      const dx = pt2.x - pt1.x;
      const dy = pt2.y - pt1.y;
      const angle = Math.atan2(dy, dx) + Math.PI / 2;

      return { x, y, angle };
    };

    const drawMiniTrack = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Grid background (màu theo biome của map)
      ctx.fillStyle = theme?.bg ?? '#0a0d18';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = theme?.grid ?? 'rgba(168, 85, 247, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Lưới ô của bộ sinh — cho thấy đường đua được ghép từ block trên lưới nào
      if (track.grid) {
        const g = track.grid;
        const gx = (i: number) => canvasCenterX + (g.originX + i * g.cell - trackCenterX) * scale;
        const gy = (j: number) => canvasCenterY + (g.originY + j * g.cell - trackCenterY) * scale;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= g.cols; i++) {
          ctx.beginPath(); ctx.moveTo(gx(i), gy(0)); ctx.lineTo(gx(i), gy(g.rows)); ctx.stroke();
        }
        for (let j = 0; j <= g.rows; j++) {
          ctx.beginPath(); ctx.moveTo(gx(0), gy(j)); ctx.lineTo(gx(g.cols), gy(j)); ctx.stroke();
        }
      }

      // Draw mini racetrack curve
      ctx.strokeStyle = theme?.road ?? 'rgba(6, 182, 212, 0.28)';
      ctx.lineWidth = track.grid ? Math.max(7, track.width * scale) : 26;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const steps = track.grid ? track.centerLine.length : 80;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const pt = getTrackPoint(a);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.stroke();

      // Racetrack lane dashes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const pt = getTrackPoint(a);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]); // Reset

      // Render Car 1 (Cyan)
      const pt1 = getTrackPoint(theta1);
      ctx.save();
      ctx.translate(pt1.x, pt1.y);
      ctx.rotate(pt1.angle);
      ctx.fillStyle = theme?.accent ?? '#22d3ee';
      ctx.shadowColor = theme?.accent ?? '#06b6d4';
      ctx.shadowBlur = 6;
      ctx.fillRect(-3.5, -7, 7, 14);
      ctx.restore();

      // Render Car 2 (Purple)
      const pt2 = getTrackPoint(theta2);
      ctx.save();
      ctx.translate(pt2.x, pt2.y);
      ctx.rotate(pt2.angle);
      ctx.fillStyle = theme?.glowRight ?? '#c084fc';
      ctx.shadowColor = theme?.glowRight ?? '#a855f7';
      ctx.shadowBlur = 6;
      ctx.fillRect(-3.5, -7, 7, 14);
      ctx.restore();

      // Radar scanning effect
      const now = Date.now();
      const scanY = 15 + ((now % 2500) / 2500) * (height - 30);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, scanY);
      ctx.lineTo(width - 15, scanY);
      ctx.stroke();

      theta1 += 0.012;
      theta2 += 0.014;
      animationId = requestAnimationFrame(drawMiniTrack);
    };

    drawMiniTrack();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameType, trackId, proceduralTrack]);

  // ── Mô phỏng Flappy Bird trực tiếp ở panel trái (xem AI học theo cấu hình) ──
  useEffect(() => {
    if (gameType !== 'flappy') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const CW = canvas.width, CH = canvas.height;
    // Mô phỏng dùng 1 chim điều khiển bằng quy tắc thông minh → chơi giỏi, hiếm khi chết
    let birds = createPopulation(1);
    let pipes: FlappyPipe[] = [];
    let raf = 0;
    const scale = Math.min(CW / FLAPPY.WIDTH, CH / FLAPPY.HEIGHT);
    const offX = (CW - FLAPPY.WIDTH * scale) / 2;
    const offY = (CH - FLAPPY.HEIGHT * scale) / 2;
    const bottom = FLAPPY.HEIGHT - FLAPPY.GROUND_H;

    const draw = () => {
      const r = stepWorld(birds, pipes, flappyGap, heuristicFlap);
      if (r.aliveCount === 0) {
        birds = createPopulation(1);
        pipes = [];
      }

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, CW, CH);
      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);
      // Giới hạn vẽ trong đúng khung world → ống/đất không tràn ra vùng nền ngoài
      ctx.beginPath();
      ctx.rect(0, 0, FLAPPY.WIDTH, FLAPPY.HEIGHT);
      ctx.clip();

      // trời + đất
      const sky = ctx.createLinearGradient(0, 0, 0, FLAPPY.HEIGHT);
      sky.addColorStop(0, '#4ec0ca');
      sky.addColorStop(1, '#9be7ec');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, FLAPPY.WIDTH, FLAPPY.HEIGHT);

      for (const p of pipes) {
        const gapTop = p.gapY - flappyGap / 2;
        const gapBot = p.gapY + flappyGap / 2;
        ctx.fillStyle = '#74c948';
        ctx.strokeStyle = '#23491a';
        ctx.lineWidth = 3;
        ctx.fillRect(p.x, 0, FLAPPY.PIPE_W, gapTop);
        ctx.strokeRect(p.x, 0, FLAPPY.PIPE_W, gapTop);
        ctx.fillRect(p.x, gapBot, FLAPPY.PIPE_W, bottom - gapBot);
        ctx.strokeRect(p.x, gapBot, FLAPPY.PIPE_W, bottom - gapBot);
      }

      ctx.fillStyle = '#ded895';
      ctx.fillRect(0, bottom, FLAPPY.WIDTH, FLAPPY.GROUND_H);
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, bottom, FLAPPY.WIDTH, 12);

      // Chỉ hiển thị 1 con: con AI đang sống có fitness cao nhất (đại diện)
      const best = birds.find(b => b.alive) ?? null;
      if (best) {
        ctx.fillStyle = '#facc15'; // vàng kiểu Flappy
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(FLAPPY.BIRD_X, best.y, FLAPPY.BIRD_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(FLAPPY.BIRD_X + 5, best.y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameType, flappyGap]);

  const handleLaunch = () => {

    if (gameType === 'racing') {
      const racingConfig: RacingConfig = {
        numCars,
        numSensors,
        mutationRate,
        speed,
        trackId,
        enableFailureAvoidance,
        enablePlayerCar,
        trackSeed,
        trackDifficulty
      };
      onLaunchRacing(racingConfig);
      return;
    }

    if (gameType === 'flappy') {
      onLaunchFlappy({
        populationSize: flappyPopulation,
        mutationRate: flappyMutationRate,
        gapSize: flappyGap,
      });
      return;
    }

    if (gameType === '2048') {
      onLaunch2048({ speed: g2048Speed });
      return;
    }

    if (gameType === 'qmaze') {
      onLaunchQMaze({ size: qSize, speed: qSpeed });
      return;
    }

    if (gameType === 'connect4') {
      onLaunchConnect4({ depth: c4Depth, speed: c4Speed });
      return;
    }

    if (gameType === 'soccer') {
      onLaunchSoccer({ mutationRate: soccerMutation, speed: soccerSpeed });
      return;
    }

    if (gameType === 'tag') {
      onLaunchTag({ mutationRate: tagMutation, speed: tagSpeed, startMapIdx: tagMapIdx, showVision: tagVision });
      return;
    }

    if (gameType === 'cellwar') {
      onLaunchCellWar({ numFactions: cwFactions, mapSize: cwMapSize, growthRate: cwGrowth, speed: cwSpeed });
      return;
    }

    // Both default to start from scratch (Gen 0)
    const baseWeights1 = getZeroWeights();
    const baseWeights2 = getZeroWeights();

    const config1: AIConfig = {
      algorithm: algo1,
      maxDepth: depth1,
      mctsSimulations: sims1,
      explorationConstant: explorationC,
      useTranspositionTable: true,
      weights: baseWeights1
    };

    const config2: AIConfig = {
      algorithm: algo2,
      maxDepth: depth2,
      mctsSimulations: sims2,
      explorationConstant: explorationC,
      useTranspositionTable: true,
      weights: baseWeights2
    };

    onLaunchArena(config1, config2, true, timeLimit);
  };

  if (showTrackBuilder) {
    return (
      <TrackBuilder
        onBack={() => setShowTrackBuilder(false)}
        onLaunchCustomTrack={(customTrackObj) => {
          const racingConfig: RacingConfig = {
            numCars,
            numSensors,
            mutationRate,
            speed,
            trackId: 'custom',
            enableFailureAvoidance,
            enablePlayerCar,
            customTrack: customTrackObj
          };
          onLaunchRacing(racingConfig);
        }}
      />
    );
  }

  return (
    <div className="setup-container flex flex-col w-full">
      {/* Back button */}
      <div className="mb-6 text-left">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-mono cursor-pointer border-none bg-transparent"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>QUAY LẠI CHỌN GAME</span>
        </button>
      </div>

      <div className="setup-grid flex-grow w-full">
        {/* LEFT COLUMN: Looping simulation */}
        <div className="flex flex-col h-full">
          <div className="glass-panel glow-border-cyan p-6 flex flex-col flex-grow relative overflow-hidden min-h-[400px]">
            {/* Visualizer header */}
            <div className="flex justify-between items-center mb-4 relative">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }} />
                <h3 className="text-sm font-mono tracking-widest text-cyan-400 font-bold uppercase">
                  MÔ PHỎNG PHÁT TRIỂN (AUTO LOOPING)
                </h3>
              </div>
              <div className="lock-badge mono">
                <RefreshCw className="w-3.5 h-3.5" style={{ animation: 'spin 2s linear infinite' }} />
                <span>Simulating...</span>
              </div>
            </div>

            {/* Canvas Container (2048 dùng bàn DOM có hoạt ảnh thay cho canvas) */}
            <div className="flex-grow flex items-center justify-center relative p-2">
              {gameType === '2048' ? (
                <Game2048Preview size={360} />
              ) : gameType === 'qmaze' ? (
                <QMazePreview size={380} gridSize={10} />
              ) : gameType === 'connect4' ? (
                <Connect4Preview size={392} />
              ) : gameType === 'soccer' ? (
                <SoccerPreview size={420} mutationRate={soccerMutation} />
              ) : gameType === 'tag' ? (
                <TagMapPreview mapIdx={tagMapIdx} size={420} />
              ) : gameType === 'cellwar' ? (
                <CellWarPreview numFactions={cwFactions} sizeKey={cwMapSize} size={420} />
              ) : (
                <canvas
                  ref={canvasRef}
                  width={450}
                  height={450}
                  className="max-w-full aspect-square border border-slate-900 rounded-xl shadow-2xl"
                />
              )}
            </div>

             {/* Telemetry Stats below canvas */}
             {gameType === 'caro' ? (
               <div className="sim-stats-grid font-mono text-center">
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-slate-500 block mb-1">SỐ VÁN ĐẤU</span>
                   <span className="text-base font-bold text-white">{simStats.games}</span>
                 </div>
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-purple-400 block mb-1">X THẮNG</span>
                   <span className="text-base font-bold text-purple-400">{simStats.xWins}</span>
                 </div>
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-cyan-400 block mb-1">O THẮNG</span>
                   <span className="text-base font-bold text-cyan-400">{simStats.oWins}</span>
                 </div>
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-amber-400 block mb-1">SỐ NƯỚC/VÁN</span>
                   <span className="text-base font-bold text-amber-400">{simStats.avgMoves}</span>
                 </div>
               </div>
             ) : gameType === 'racing' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">KIỂU MẠNG</span>
                    <span className="text-base font-bold text-white">ANN</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">ĐÀO TẠO</span>
                    <span className="text-sm font-bold text-purple-400">Tiến Hóa</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">CẢM BIẾN</span>
                    <span className="text-sm font-bold text-cyan-400">Tia Quét</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">TẦN SỐ</span>
                    <span className="text-base font-bold text-amber-400">60 FPS</span>
                  </div>
                </div>
              ) : gameType === 'flappy' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">KIỂU MẠNG</span>
                    <span className="text-xs font-bold text-white">ANN [4·6·1]</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">ĐÀO TẠO</span>
                    <span className="text-sm font-bold text-purple-400">Tiến Hóa</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">CHỌN LỌC</span>
                    <span className="text-xs font-bold text-cyan-400">Elitism + Lai</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">TẦN SỐ</span>
                    <span className="text-base font-bold text-amber-400">60 FPS</span>
                  </div>
                </div>
              ) : gameType === '2048' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">THUẬT TOÁN</span>
                    <span className="text-sm font-bold text-white">Expectimax</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">LƯỚI</span>
                    <span className="text-base font-bold text-purple-400">4 × 4</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">ĐÁNH GIÁ</span>
                    <span className="text-sm font-bold text-cyan-400">Heuristic</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">ĐẠT 2048</span>
                    <span className="text-base font-bold text-amber-400">~63%</span>
                  </div>
                </div>
              ) : gameType === 'qmaze' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">THUẬT TOÁN</span>
                    <span className="text-sm font-bold text-white">Q-Learning</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">CHIẾN LƯỢC</span>
                    <span className="text-sm font-bold text-purple-400">ε-greedy</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">HỌC</span>
                    <span className="text-sm font-bold text-cyan-400">Bảng Q</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">HỘI TỤ</span>
                    <span className="text-sm font-bold text-amber-400">Tối ưu</span>
                  </div>
                </div>
              ) : gameType === 'soccer' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">THUẬT TOÁN</span>
                    <span className="text-xs font-bold text-white">Neuroevolution</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">ĐỐI KHÁNG</span>
                    <span className="text-base font-bold text-purple-400">2 AI</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">SÂN RỘNG</span>
                    <span className="text-base font-bold text-cyan-400">3D V2</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">NHẢY CAO</span>
                    <span className="text-sm font-bold text-amber-400">CD 90 tick</span>
                  </div>
                </div>
              ) : gameType === 'tag' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">THUẬT TOÁN</span>
                    <span className="text-xs font-bold text-white">Neuroevolution</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-red-400 block mb-1">CHASER</span>
                    <span className="text-sm font-bold text-red-400">Đuổi bắt</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-green-400 block mb-1">EVADER</span>
                    <span className="text-sm font-bold text-green-400">Trốn tránh</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">PHÒNG 3D</span>
                    <span className="text-sm font-bold text-amber-400">{TAG_MAPS.length} phòng</span>
                  </div>
                </div>
              ) : gameType === 'cellwar' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">THUẬT TOÁN</span>
                    <span className="text-xs font-bold text-white">Heuristic CA</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-emerald-400 block mb-1">SỐ PHE</span>
                    <span className="text-base font-bold text-emerald-400">{cwFactions}</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">BẢN ĐỒ</span>
                    <span className="text-sm font-bold text-cyan-400">{MAP_SIZES[cwMapSize].cols}×{MAP_SIZES[cwMapSize].rows}</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">CHIẾN THUẬT</span>
                    <span className="text-sm font-bold text-amber-400">{Math.min(cwFactions, STRATEGIES.length)} kiểu</span>
                  </div>
                </div>
              ) : (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">THUẬT TOÁN</span>
                    <span className="text-sm font-bold text-white">Minimax</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">TỐI ƯU</span>
                    <span className="text-sm font-bold text-purple-400">Alpha-Beta</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">BÀN</span>
                    <span className="text-base font-bold text-cyan-400">7 × 6</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">NỐI</span>
                    <span className="text-sm font-bold text-amber-400">4 quân</span>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* RIGHT COLUMN: Configuration panel */}
        <div className="flex flex-col h-full">
          <div className="glass-panel glow-border-purple p-6 flex flex-col justify-between h-full text-left">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Settings className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-bold text-white">Cấu Hình Đấu Trường AI</h2>
              </div>

            {gameType === 'caro' && (
              <div>
                {/* LỰA CHỌN THUẬT TOÁN ĐỐI ĐẦU (AI 1 VS AI 2) */}
                <div className="mb-4">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Lựa Chọn Thuật Toán Đối Đầu:
                  </label>
                  <div className="brain-mode-grid">
                    {/* AI 1 Card (Black X) */}
                    <div className={`brain-mode-btn ${algo1 === 'MINIMAX' ? 'brain-mode-btn-active-scratch' : 'brain-mode-btn-active-pretrained'}`} style={{ cursor: 'default', flexGrow: 1 }}>
                      <span className="text-xs font-mono text-purple-400 font-bold mb-1 block">AI 1: QUÂN ĐEN (X)</span>
                      <div className="flex gap-2 w-full mt-2 justify-center" style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setAlgo1('MINIMAX')}
                          className={`cyber-btn text-[11px] py-1.5 px-3 font-mono ${algo1 === 'MINIMAX' ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                        >
                          Minimax
                        </button>
                        <button
                          onClick={() => setAlgo1('MCTS')}
                          className={`cyber-btn text-[11px] py-1.5 px-3 font-mono ${algo1 === 'MCTS' ? 'cyber-btn-cyan' : 'cyber-btn-outline'}`}
                        >
                          MCTS
                        </button>
                      </div>
                    </div>

                    {/* AI 2 Card (White O) */}
                    <div className={`brain-mode-btn ${algo2 === 'MCTS' ? 'brain-mode-btn-active-pretrained' : 'brain-mode-btn-active-scratch'}`} style={{ cursor: 'default', flexGrow: 1 }}>
                      <span className="text-xs font-mono text-cyan-400 font-bold mb-1 block">AI 2: QUÂN TRẮNG (O)</span>
                      <div className="flex gap-2 w-full mt-2 justify-center" style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setAlgo2('MINIMAX')}
                          className={`cyber-btn text-[11px] py-1.5 px-3 font-mono ${algo2 === 'MINIMAX' ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                        >
                          Minimax
                        </button>
                        <button
                          onClick={() => setAlgo2('MCTS')}
                          className={`cyber-btn text-[11px] py-1.5 px-3 font-mono ${algo2 === 'MCTS' ? 'cyber-btn-cyan' : 'cyber-btn-outline'}`}
                        >
                          MCTS
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DYNAMIC PARAMETER CONFIG CARD */}
                <div className="config-ai-card mt-4">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-purple-400" />
                    Tùy Chỉnh Bộ Lọc Thuật Toán:
                  </h3>
                  
                  {/* Show Minimax Depth slider if either AI is Minimax */}
                  {(algo1 === 'MINIMAX' || algo2 === 'MINIMAX') && (
                    <div className="setting-slider-group mb-4">
                      <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                        <span>Độ Sâu Tìm Kiếm Minimax:</span>
                        <span className="text-purple-400 font-bold">
                          {algo1 === 'MINIMAX' ? depth1 : depth2} bước
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={algo1 === 'MINIMAX' ? depth1 : depth2}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (algo1 === 'MINIMAX') setDepth1(v);
                          if (algo2 === 'MINIMAX') setDepth2(v);
                        }}
                        className="slider-styled"
                      />
                      <span className="text-[9px] text-slate-500 font-mono block mt-1">
                        * Độ sâu càng cao cờ đi càng chặn hiểm, độ sâu 3 tối ưu tốc độ.
                      </span>
                    </div>
                  )}

                  {/* Show MCTS Simulations slider if either AI is MCTS */}
                  {(algo1 === 'MCTS' || algo2 === 'MCTS') && (
                    <div className="setting-slider-group">
                      <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                        <span>Số Nhánh Mô Phỏng MCTS:</span>
                        <span className="text-cyan-400 font-bold">
                          {algo1 === 'MCTS' ? sims1 : sims2} lần
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="800"
                        step="50"
                        value={algo1 === 'MCTS' ? sims1 : sims2}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (algo1 === 'MCTS') setSims1(v);
                          if (algo2 === 'MCTS') setSims2(v);
                        }}
                        className="slider-styled slider-styled-cyan"
                      />
                    </div>
                  )}
                </div>

                {/* Shared Advanced Hyperparameters */}
                <div className="double-slider-grid mt-4">
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Giới Hạn Phản Hồi:</span>
                      <span className="text-amber-400 font-bold">{timeLimit}ms</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="1000"
                      step="20"
                      value={timeLimit}
                      onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                      className="slider-styled slider-styled-amber"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Hằng Số MCTS C:</span>
                      <span className="text-emerald-400 font-bold">{explorationC}</span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="2.5"
                      step="0.1"
                      value={explorationC}
                      onChange={(e) => setExplorationC(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
                  </div>
                </div>
              </div>
            )}

            {gameType === 'racing' && (
              <div>
                {/* LỰA CHỌN ĐƯỜNG ĐUA */}
                <div className="mb-4 text-left">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Lựa Chọn Đường Đua Huấn Luyện:
                  </label>
                  <div className="flex flex-col gap-2">
                    {/* Row 1 */}
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setTrackId('oval')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'oval' ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                      >
                        Oval Basic
                      </button>
                      <button
                        onClick={() => setTrackId('scurve')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'scurve' ? 'cyber-btn-cyan' : 'cyber-btn-outline'}`}
                      >
                        Chữ S Đèo Tử Thần
                      </button>
                      <button
                        onClick={() => setTrackId('grandprix')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'grandprix' ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                      >
                        F1 Grand Prix
                      </button>
                    </div>
                    {/* Row 2 - F1 Classic Maps (Random Pool) */}
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setTrackId('monza')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'monza' ? 'cyber-btn-cyan' : 'cyber-btn-outline'}`}
                      >
                        Monza (Ý)
                      </button>
                      <button
                        onClick={() => setTrackId('redbull')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'redbull' ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                      >
                        Red Bull (Áo)
                      </button>
                      <button
                        onClick={() => setTrackId('shanghai')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'shanghai' ? 'cyber-btn-cyan' : 'cyber-btn-outline'}`}
                      >
                        Thượng Hải (TQ)
                      </button>
                    </div>
                    {/* Row 3 */}
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setTrackId('singapore')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${trackId === 'singapore' ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                      >
                        Singapore (Singapore)
                      </button>
                    </div>
                    {/* Row 4 - Procedural generation */}
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setTrackId('procedural')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono font-bold ${trackId === 'procedural' ? 'cyber-btn-cyan pulse-glow-cyan' : 'cyber-btn-outline'}`}
                      >
                        🌍 MAP TẠO SINH THỦ TỤC (VÔ HẠN)
                      </button>
                    </div>

                    {/* Bảng điều khiển bộ sinh — chỉ hiện khi đang chọn map thủ tục */}
                    {trackId === 'procedural' && (
                      <div className="rounded-xl border border-cyan-500/25 bg-slate-900/60 p-3 flex flex-col gap-3">
                        {/* Thông tin map vừa sinh */}
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="text-left">
                            <div
                              className="text-[12px] font-mono font-bold"
                              style={{ color: proceduralTrack.theme.accent }}
                            >
                              {proceduralTrack.name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              {proceduralTrack.theme.name} · Lưới {proceduralTrack.grid.cols}×{proceduralTrack.grid.rows}
                              {' '}(ô {proceduralTrack.grid.cell}px) · dùng {proceduralTrack.grid.usedCells}/
                              {proceduralTrack.grid.cols * proceduralTrack.grid.rows} ô
                            </div>
                          </div>
                          <div className="text-right text-[10px] font-mono text-slate-500 leading-relaxed">
                            <div>Chu vi <span className="text-slate-300">{proceduralTrack.lengthPx}px</span></div>
                            <div>Cua gắt nhất <span className="text-slate-300">R{proceduralTrack.minRadius}</span></div>
                            <div>Lòng đường <span className="text-slate-300">{proceduralTrack.width}px</span></div>
                          </div>
                        </div>

                        {/* Các block ghép nên đường đua */}
                        <div className="flex gap-1.5 flex-wrap">
                          {([
                            ['Thẳng', proceduralTrack.blocks.straight, '#22d3ee'],
                            ['Cong nhẹ', proceduralTrack.blocks.sweep, '#4ade80'],
                            ['Cong vừa', proceduralTrack.blocks.medium, '#fbbf24'],
                            ['Cua gấp', proceduralTrack.blocks.hairpin, '#f87171'],
                          ] as const).map(([label, count, color]) => (
                            <span
                              key={label}
                              className="text-[10px] font-mono px-2 py-1 rounded-md border"
                              style={{
                                color: count > 0 ? color : '#475569',
                                borderColor: count > 0 ? `${color}44` : '#33415544',
                                background: count > 0 ? `${color}11` : 'transparent',
                              }}
                            >
                              {label} ×{count}
                            </span>
                          ))}
                          <span className="text-[10px] font-mono px-2 py-1 text-slate-500">
                            thẳng dài nhất {proceduralTrack.blocks.longestStraight}px
                          </span>
                        </div>

                        {/* Seed */}
                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                            <span>SEED (cùng seed → cùng map)</span>
                            <span className="text-cyan-400 font-bold">{seedToString(trackSeed)}</span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={seedInput}
                              placeholder={`vd: 12345 hoặc "monza"`}
                              onChange={(e) => setSeedInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') applySeedInput(); }}
                              className="flex-1 min-w-0 bg-slate-950/80 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-200 outline-none focus:border-cyan-500/60"
                            />
                            <button
                              onClick={applySeedInput}
                              disabled={!seedInput.trim()}
                              className="cyber-btn cyber-btn-outline text-[10px] py-1.5 px-3 font-mono disabled:opacity-30"
                            >
                              Áp dụng
                            </button>
                            <button
                              onClick={rollNewSeed}
                              title="Đổi seed ngẫu nhiên"
                              className="cyber-btn cyber-btn-cyan text-[10px] py-1.5 px-3 font-mono font-bold"
                            >
                              🎲
                            </button>
                          </div>
                        </div>

                        {/* Độ khó địa hình */}
                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                            <span>Độ Khó Địa Hình:</span>
                            <span className="text-purple-400 font-bold">
                              {['Thư Giãn', 'Dễ Thở', 'Cân Bằng', 'Khó Nhằn', 'Ác Mộng'][trackDifficulty - 1]} ({trackDifficulty}/5)
                            </span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="1"
                            value={trackDifficulty}
                            onChange={(e) => setTrackDifficulty(parseInt(e.target.value))}
                            className="slider-styled slider-styled-purple"
                          />
                          <div className="text-[9px] font-mono text-slate-600 mt-1 text-left">
                            Cao hơn = đường hẹp hơn, nhiều khúc cua gắt hơn, bề rộng biến thiên mạnh hơn.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Row 6 - Custom Draw */}
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setShowTrackBuilder(true)}
                        className="flex-grow cyber-btn cyber-btn-outline text-[10px] py-2 px-2.5 font-mono font-bold hover:text-purple-400 hover:border-purple-500/20"
                      >
                        🎨 TỰ THIẾT KẾ ĐƯỜNG ĐUA (TRACK BUILDER)
                      </button>
                    </div>
                  </div>
                </div>

                {/* THAM SỐ TIẾN HÓA XE */}
                <div className="config-ai-card mt-4 flex flex-col gap-4 text-left">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Settings className="w-4 h-4 text-purple-400" />
                    Thiết Lập Bộ Gen Di Truyền:
                  </h3>

                  {/* Number of cars slider */}
                  <div className="setting-slider-group">
                    <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                      <span>Số Lượng Xe Trong 1 Ván:</span>
                      <span className="text-purple-400 font-bold">{numCars} chiếc</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="10"
                      value={numCars}
                      onChange={(e) => setNumCars(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>

                  {/* Number of sensors slider */}
                  <div className="setting-slider-group">
                    <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                      <span>Số Tia Cảm Biến AI (Rays):</span>
                      <span className="text-cyan-400 font-bold">{numSensors} tia</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="9"
                      step="1"
                      value={numSensors}
                      onChange={(e) => setNumSensors(parseInt(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>

                  {/* Mutation Rate slider */}
                  <div className="setting-slider-group">
                    <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                      <span>Hệ Số Đột Biến Gen (Mutation):</span>
                      <span className="text-amber-400 font-bold">{Math.round(mutationRate * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.5"
                      step="0.05"
                      value={mutationRate}
                      onChange={(e) => setMutationRate(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-amber"
                    />
                  </div>

                  {/* Cars Base Speed slider */}
                  <div className="setting-slider-group">
                    <div className="flex justify-between text-xs font-mono text-slate-400 mb-1">
                      <span>Tốc Độ Cơ Bản Của Xe:</span>
                      <span className="text-emerald-400 font-bold">{speed.toFixed(1)} px/frame (≈{Math.round(speed * 10)} km/h)</span>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="5.0"
                      step="0.2"
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
                    <span className="text-[9px] text-slate-500 font-mono block mt-1">
                      * Giai đoạn 1 xe chạy đúng tốc độ này; giai đoạn 2 AI tự điều tốc ±30%. Nhanh hơn = cua gắt khó ôm hơn.
                    </span>
                  </div>

                  {/* Failure Avoidance toggle */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-mono text-slate-400">Tránh Thất Bại (Failure Avoidance):</span>
                      <span className="text-[10px] text-slate-500 font-mono">Xe học cua sớm ở các khu vực tai nạn</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={enableFailureAvoidance} 
                        onChange={(e) => setEnableFailureAvoidance(e.target.checked)} 
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white"></div>
                    </label>
                  </div>

                  {/* Play Along toggle */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-mono text-slate-400">Thi Đấu Cùng Máy (Chơi Thủ Công):</span>
                      <span className="text-[10px] text-slate-500 font-mono">Lái xe của riêng bạn bằng phím WASD</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={enablePlayerCar} 
                        onChange={(e) => setEnablePlayerCar(e.target.checked)} 
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500 peer-checked:after:bg-white"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {gameType === 'flappy' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-amber-400" />
                    Tham Số Tiến Hóa (Neuroevolution):
                  </h3>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Quần Thể (Số Chim/Thế Hệ):</span>
                      <span className="text-amber-400 font-bold">{flappyPopulation} chim</span>
                    </div>
                    <input
                      type="range" min="20" max="500" step="10"
                      value={flappyPopulation}
                      onChange={(e) => setFlappyPopulation(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tỷ Lệ Đột Biến:</span>
                      <span className="text-cyan-400 font-bold">{(flappyMutationRate * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range" min="0.01" max="0.5" step="0.01"
                      value={flappyMutationRate}
                      onChange={(e) => setFlappyMutationRate(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>

                  <div className="setting-slider-group">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Độ Rộng Khe Ống (độ khó):</span>
                      <span className="text-emerald-400 font-bold">{flappyGap}px {flappyGap >= 180 ? '(Dễ)' : flappyGap >= 140 ? '(Vừa)' : '(Khó)'}</span>
                    </div>
                    <input
                      type="range" min="130" max="220" step="10"
                      value={flappyGap}
                      onChange={(e) => setFlappyGap(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  Mỗi chim được điều khiển bởi một mạng nơ-ron riêng. Khi cả đàn chết, thế hệ mới
                  sinh ra từ những con bay xa nhất (giữ tinh hoa + lai ghép + đột biến). Quan sát số
                  thế hệ tăng và đàn chim giỏi dần.
                </p>
              </div>
            )}

            {gameType === '2048' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-orange-400" />
                    Cấu Hình AI (Expectimax):
                  </h3>

                  <div className="setting-slider-group">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc độ AI tự chơi:</span>
                      <span className="text-orange-400 font-bold">{g2048Speed}x</span>
                    </div>
                    <input
                      type="range" min="1" max="8" step="1"
                      value={g2048Speed}
                      onChange={(e) => setG2048Speed(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  AI dùng tìm kiếm <span className="text-orange-400">Expectimax</span> (cây kỳ vọng) với hàm
                  đánh giá heuristic (ô trống, đơn điệu, độ mượt, ô lớn ở góc) để gộp ô đạt 2048 và hơn nữa.
                  Vào game có thể bấm <span className="text-cyan-300">TỰ CHƠI</span> để tự điều khiển bằng phím mũi tên.
                </p>
              </div>
            )}

            {gameType === 'qmaze' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-blue-400" />
                    Cấu Hình Học Tăng Cường:
                  </h3>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Kích thước mê cung:</span>
                      <span className="text-blue-400 font-bold">{qSize} × {qSize}</span>
                    </div>
                    <input
                      type="range" min="6" max="18" step="1"
                      value={qSize}
                      onChange={(e) => setQSize(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>

                  <div className="setting-slider-group">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc độ học (bước/khung):</span>
                      <span className="text-cyan-400 font-bold">{qSpeed}</span>
                    </div>
                    <input
                      type="range" min="1" max="150" step="1"
                      value={qSpeed}
                      onChange={(e) => setQSpeed(parseInt(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  Tác nhân học bằng <span className="text-blue-400">Q-Learning</span> (ε-greedy): khám phá nhiều
                  lúc đầu rồi khai thác dần. Quan sát <span className="text-white">bản đồ nhiệt giá trị Q</span> và
                  <span className="text-white"> mũi tên chính sách</span> hội tụ về đường ngắn nhất tới đích.
                </p>
              </div>
            )}

            {gameType === 'connect4' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-red-400" />
                    Cấu Hình AI (Minimax):
                  </h3>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Độ sâu tìm kiếm (sức mạnh AI):</span>
                      <span className="text-red-400 font-bold">{c4Depth} {c4Depth <= 4 ? '(Dễ)' : c4Depth <= 6 ? '(Khá)' : '(Mạnh)'}</span>
                    </div>
                    <input
                      type="range" min="2" max="8" step="1"
                      value={c4Depth}
                      onChange={(e) => setC4Depth(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>

                  <div className="setting-slider-group">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc độ máy đấu máy:</span>
                      <span className="text-cyan-400 font-bold">{c4Speed}×</span>
                    </div>
                    <input
                      type="range" min="1" max="8" step="1"
                      value={c4Speed}
                      onChange={(e) => setC4Speed(parseInt(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  Thả quân vào cột, nối được <span className="text-white">4 quân thẳng hàng</span> (ngang/dọc/chéo) là thắng.
                  AI tính nước bằng <span className="text-red-400">Minimax + cắt tỉa Alpha-Beta</span>. Vào game bấm
                  <span className="text-cyan-300"> TỰ CHƠI</span> để đấu với máy (bạn cầm quân đỏ).
                </p>
              </div>
            )}

            {gameType === 'soccer' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-emerald-400" />
                    Cấu Hình Tiến Hóa (Neuroevolution):
                  </h3>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tỷ Lệ Đột Biến:</span>
                      <span className="text-emerald-400 font-bold">{(soccerMutation * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range" min="0.02" max="0.4" step="0.02"
                      value={soccerMutation}
                      onChange={(e) => setSoccerMutation(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
                  </div>

                  <div className="setting-slider-group">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc Độ Tua Học (tick/khung):</span>
                      <span className="text-cyan-400 font-bold">{soccerSpeed}×</span>
                    </div>
                    <input
                      type="range" min="1" max="8" step="1"
                      value={soccerSpeed}
                      onChange={(e) => setSoccerSpeed(parseInt(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  Hai AI dạng khối đấu tay đôi trong <span className="text-white">phòng 3D góc rộng</span>. Bản này bổ sung
                  <span className="text-emerald-300"> kỹ năng Nhảy cao (Jump)</span> có cooldown để né tránh và tranh bóng bổng, cùng
                  <span className="text-white"> lưới vát gôn thực tế</span>. Cầu thủ tiến hóa thế hệ liên tục.
                </p>
              </div>
            )}

            {gameType === 'tag' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-red-400" />
                    Cấu Hình Đuổi Bắt (Neuroevolution):
                  </h3>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tỷ Lệ Đột Biến:</span>
                      <span className="text-red-400 font-bold">{(tagMutation * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range" min="0.02" max="0.5" step="0.02"
                      value={tagMutation}
                      onChange={(e) => setTagMutation(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
                  </div>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc Độ Tua Học (tick/khung):</span>
                      <span className="text-cyan-400 font-bold">{tagSpeed}×</span>
                    </div>
                    <input
                      type="range" min="1" max="16" step="1"
                      value={tagSpeed}
                      onChange={(e) => setTagSpeed(parseInt(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>

                  {/* Chọn phòng khởi đầu */}
                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-2">
                      <span>Phòng Khởi Đầu:</span>
                      <span className="text-blue-400 font-bold">{TAG_MAPS[tagMapIdx].durationSec}s / ván</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TAG_MAPS.map((m, i) => (
                        <button
                          key={m.id} type="button" title={m.desc}
                          onClick={() => setTagMapIdx(i)}
                          className={`px-2.5 py-1 text-[10px] font-mono rounded-md font-bold border transition-all ${
                            tagMapIdx === i
                              ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.4)]'
                              : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:text-white hover:border-slate-500'
                          }`}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono mt-2 leading-relaxed">{TAG_MAPS[tagMapIdx].desc}</p>
                  </div>

                  {/* Tầm nhìn AI */}
                  <div className="setting-slider-group">
                    <button
                      type="button"
                      onClick={() => setTagVision(v => !v)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md font-mono text-[11px] font-bold border transition-all ${
                        tagVision
                          ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span>Hiển Thị Tầm Nhìn AI (raycast):</span>
                      <span className={`px-2 py-0.5 rounded ${tagVision ? 'bg-emerald-500/30 text-emerald-200' : 'bg-slate-700 text-slate-400'}`}>
                        {tagVision ? 'BẬT' : 'TẮT'}
                      </span>
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  <span className="text-blue-400">KAI (xanh)</span> tự học đuổi bắt,{' '}
                  <span className="text-orange-400">ALBERT (cam)</span> tự học trốn. Tiến hóa song song — KAI bắt được{' '}
                  <span className="text-amber-300">1 lần</span> là thắng ván; ALBERT sống hết giờ phòng thì thắng.{' '}
                  <span className="text-white">{TAG_MAPS.length} phòng</span> bố cục & thời lượng khác nhau (hộp kéo/đẩy · tường chắn · cột trụ), có thể{' '}
                  <span className="text-white">nhảy lên nóc hộp</span> để né. Đổi phòng trong trận giữ nguyên não đã học.
                </p>
              </div>
            )}

            {gameType === 'cellwar' && (
              <div>
                <div className="config-ai-card">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-emerald-400" />
                    Cấu Hình Cell War (Chiến tranh lãnh thổ):
                  </h3>

                  {/* Số phe */}
                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Số Phe Tham Chiến:</span>
                      <span className="text-emerald-400 font-bold">{cwFactions} phe</span>
                    </div>
                    <input
                      type="range" min="2" max={FACTION_COLORS.length} step="1"
                      value={cwFactions}
                      onChange={(e) => setCwFactions(parseInt(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.from({ length: cwFactions }).map((_, i) => (
                        <span key={i} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: `${FACTION_COLORS[i].hex}22`, color: FACTION_COLORS[i].hex }}>
                          <span className="w-2 h-2 rounded-sm" style={{ background: FACTION_COLORS[i].hex }} />
                          {STRATEGIES[i % STRATEGIES.length].name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Kích thước bản đồ */}
                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-2">
                      <span>Kích Thước Bản Đồ:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(MAP_SIZES) as MapSizeKey[]).map(k => (
                        <button
                          key={k} type="button"
                          onClick={() => setCwMapSize(k)}
                          className={`px-3 py-1 text-[10px] font-mono rounded-md font-bold border transition-all ${
                            cwMapSize === k
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                              : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:text-white hover:border-slate-500'
                          }`}
                        >
                          {MAP_SIZES[k].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tốc độ sinh quân */}
                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc Độ Sinh Quân:</span>
                      <span className="text-amber-400 font-bold">{cwGrowth.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range" min="0.5" max="3" step="0.5"
                      value={cwGrowth}
                      onChange={(e) => setCwGrowth(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
                  </div>

                  {/* Tốc độ mô phỏng */}
                  <div className="setting-slider-group">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tốc Độ Mô Phỏng (tick/khung):</span>
                      <span className="text-cyan-400 font-bold">{cwSpeed}×</span>
                    </div>
                    <input
                      type="range" min="1" max="16" step="1"
                      value={cwSpeed}
                      onChange={(e) => setCwSpeed(parseInt(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-mono mt-4 leading-relaxed">
                  Mỗi phe chiếm ô, <span className="text-emerald-400">sinh quân</span> và đẩy quân qua biên giới để bành trướng.{' '}
                  Mỗi phe theo <span className="text-white">một chiến thuật riêng</span> (hung hãn · bành trướng · cơ hội · phòng thủ · cân bằng) —{' '}
                  phe cuối cùng còn sống thắng. <span className="text-amber-300">Xem chiến thuật nào thống trị bản đồ!</span>
                </p>
              </div>
            )}

          </div>

          {/* Launch CTA */}
          <div className="pt-4 mt-6 text-left" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <button
              onClick={handleLaunch}
              className="w-full cyber-btn cyber-btn-purple text-base py-4 font-bold pulse-glow-purple"
            >
              <Play className="w-5 h-5 fill-current" />
              {gameType === 'caro'
                ? 'TIẾN VÀO ĐẤU TRƯỜNG HUẤN LUYỆN'
                : gameType === 'racing'
                ? 'KHỞI CHẠY ĐUA XE TIẾN HÓA'
                : gameType === 'flappy'
                ? 'KHỞI CHẠY FLAPPY BIRD AI'
                : gameType === '2048'
                ? 'KHỞI CHẠY 2048 AI'
                : gameType === 'qmaze'
                ? 'KHỞI CHẠY MÊ CUNG Q-LEARNING'
                : gameType === 'soccer'
                ? 'KHỞI CHẠY BÓNG ĐÁ AI 3D'
                : gameType === 'tag'
                ? '🎯 KHỞI CHẠY ĐUỔI BẮT AI 3D'
                : gameType === 'cellwar'
                ? '🗺️ KHỞI CHẠY CELL WAR'
                : 'KHỞI CHẠY CONNECT FOUR'}
            </button>
            <p className="text-[10px] text-center text-slate-500 font-mono mt-3">
              {gameType === 'caro'
                ? '* Cả hai bộ não AI luôn được huấn luyện tiến hóa tự động từ con số 0 (Zero Knowledge).'
                : gameType === 'racing'
                ? '* Các xe đua sẽ tự động tiến hóa, học cách né vật cản từ con số 0 dựa trên phản hồi tia quét.'
                : gameType === 'flappy'
                ? '* Đàn chim tự học vượt ống từ con số 0 bằng mạng nơ-ron và tiến hóa di truyền.'
                : gameType === '2048'
                ? '* AI dùng tìm kiếm Expectimax để chơi 2048; bạn cũng có thể tự chơi bằng phím mũi tên.'
                : gameType === 'qmaze'
                ? '* Tác nhân học tăng cường (Q-Learning) tự tìm đường ngắn nhất; xem bản đồ nhiệt Q hội tụ.'
                : gameType === 'soccer'
                ? '* Bản nâng cấp Soccer V2 bổ sung kỹ năng nhảy cao né tránh và tranh bóng bổng có cooldown, cải tiến vật lý lưới vát gôn.'
                : gameType === 'tag'
                ? '* Chaser học đuổi, Evader học trốn — cả hai tiến hóa song song trong phòng 3D với 4 trụ cột chướng ngại.'
                : gameType === 'cellwar'
                ? '* Nhiều phe AI tranh giành lãnh thổ theo kiểu Territorial.io; mỗi phe một chiến thuật — xem ai nuốt trọn bản đồ.'
                : '* AI dùng Minimax + Alpha-Beta để chơi Connect Four; bấm TỰ CHƠI để đấu với máy.'}
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
