import React, { useEffect, useRef, useState } from 'react';
import { Play, Settings, ArrowLeft, RefreshCw, Brain } from 'lucide-react';
import { AIConfig, AIAlgorithm, RacingConfig } from '../types/game';
import { FootballConfig, CurriculumStep } from '../types/football';
import { getZeroWeights } from '../utils/trainer';
import { getPresetTrack, generateRandomTrack } from '../utils/racingPhysics';
import TrackBuilder from './TrackBuilder';

interface SetupScreenProps {
  gameType: 'caro' | 'racing' | 'football';
  onBack: () => void;
  onLaunchArena: (config1: AIConfig, config2: AIConfig, initFromScratch: boolean) => void;
  onLaunchRacing: (config: RacingConfig) => void;
  onLaunchFootball: (config: FootballConfig) => void;
}

export default function SetupScreen({ gameType, onBack, onLaunchArena, onLaunchRacing, onLaunchFootball }: SetupScreenProps) {
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
  const [speed, setSpeed] = useState<number>(1.2);
  const [trackId, setTrackId] = useState<string>('oval');
  const [enableFailureAvoidance, setEnableFailureAvoidance] = useState<boolean>(true);
  const [enablePlayerCar, setEnablePlayerCar] = useState<boolean>(false);
  const [showTrackBuilder, setShowTrackBuilder] = useState<boolean>(false);

  // Football Config states
  const [footballPopulation, setFootballPopulation] = useState<number>(5);
  const [footballMutationRate, setFootballMutationRate] = useState<number>(0.1);
  const [footballStep, setFootballStep] = useState<CurriculumStep>(1);

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
    const track = trackId === 'random' ? generateRandomTrack() : getPresetTrack(trackId);

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

      // Grid background
      ctx.fillStyle = '#0a0d18';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Draw mini racetrack curve
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.28)';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      
      const steps = 80;
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
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 6;
      ctx.fillRect(-3.5, -7, 7, 14);
      ctx.restore();

      // Render Car 2 (Purple)
      const pt2 = getTrackPoint(theta2);
      ctx.save();
      ctx.translate(pt2.x, pt2.y);
      ctx.rotate(pt2.angle);
      ctx.fillStyle = '#c084fc';
      ctx.shadowColor = '#a855f7';
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
  }, [gameType, trackId]);

  const handleLaunch = () => {

    if (gameType === 'racing') {
      const racingConfig: RacingConfig = {
        numCars,
        numSensors,
        mutationRate,
        speed,
        trackId,
        enableFailureAvoidance,
        enablePlayerCar
      };
      onLaunchRacing(racingConfig);
      return;
    }

    if (gameType === 'football') {
      const fbConfig: FootballConfig = {
        populationSize: footballPopulation,
        mutationRate: footballMutationRate,
        step: footballStep,
        matchDuration: 800
      };
      onLaunchFootball(fbConfig);
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
      useBoundingBox: true,
      weights: baseWeights1
    };

    const config2: AIConfig = {
      algorithm: algo2,
      maxDepth: depth2,
      mctsSimulations: sims2,
      explorationConstant: explorationC,
      useTranspositionTable: true,
      useBoundingBox: true,
      weights: baseWeights2
    };

    onLaunchArena(config1, config2, true);
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

            {/* Canvas Container */}
            <div className="flex-grow flex items-center justify-center relative p-2">
              <canvas
                ref={canvasRef}
                width={450}
                height={450}
                className="max-w-full aspect-square border border-slate-900 rounded-xl shadow-2xl"
              />
            </div>

             {/* Telemetry Stats below canvas */}
             {gameType === 'football' ? (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">KIỂU MẠNG</span>
                    <span className="text-lg font-bold text-white">ANN</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">ĐÀO TẠO</span>
                    <span className="text-lg font-bold text-purple-400">Curriculum</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">NHÓM</span>
                    <span className="text-lg font-bold text-cyan-400">GA</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">TẦN SỐ</span>
                    <span className="text-lg font-bold text-amber-400">60 FPS</span>
                  </div>
                </div>
             ) : gameType === 'caro' ? (
               <div className="sim-stats-grid font-mono text-center">
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-slate-500 block mb-1">SỐ VÁN ĐẤU</span>
                   <span className="text-lg font-bold text-white">{simStats.games}</span>
                 </div>
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-purple-400 block mb-1">X THẮNG</span>
                   <span className="text-lg font-bold text-purple-400">{simStats.xWins}</span>
                 </div>
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-cyan-400 block mb-1">O THẮNG</span>
                   <span className="text-lg font-bold text-cyan-400">{simStats.oWins}</span>
                 </div>
                 <div className="sim-stat-card">
                   <span className="text-[10px] text-amber-400 block mb-1">SỐ NƯỚC/VÁN</span>
                   <span className="text-lg font-bold text-amber-400">{simStats.avgMoves}</span>
                 </div>
               </div>
             ) : (
                <div className="sim-stats-grid font-mono text-center">
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-slate-500 block mb-1">KIỂU MẠNG</span>
                    <span className="text-lg font-bold text-white">ANN</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-purple-400 block mb-1">ĐÀO TẠO</span>
                    <span className="text-lg font-bold text-purple-400">Tiến Hóa</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-cyan-400 block mb-1">CẢM BIẾN</span>
                    <span className="text-lg font-bold text-cyan-400">Tia Quét</span>
                  </div>
                  <div className="sim-stat-card">
                    <span className="text-[10px] text-amber-400 block mb-1">TẦN SỐ</span>
                    <span className="text-lg font-bold text-amber-400">60 FPS</span>
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
                    {/* Row 4 - Random */}
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setTrackId('random')}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono font-bold ${trackId === 'random' ? 'cyber-btn-cyan pulse-glow-cyan' : 'cyber-btn-outline'}`}
                      >
                        🎲 Map Ngẫu Nhiên (9 F1 Maps)
                      </button>
                    </div>
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
                      <span>Tốc Độ Chạy Cố Định Của Xe:</span>
                      <span className="text-emerald-400 font-bold">{speed.toFixed(1)} px/frame</span>
                    </div>
                    <input
                      type="range"
                      min="0.6"
                      max="3.0"
                      step="0.2"
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-emerald"
                    />
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

            {gameType === 'football' && (
              <div>
                <div className="mb-4 text-left">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                    Lựa Chọn Bước Khởi Tạo:
                  </label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setFootballStep(1)}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${footballStep === 1 ? 'cyber-btn-purple' : 'cyber-btn-outline'}`}
                      >
                        Bước 1: Tìm Bóng
                      </button>
                      <button
                        onClick={() => setFootballStep(2)}
                        className={`flex-grow cyber-btn text-[10px] py-2 px-2.5 font-mono ${footballStep === 2 ? 'cyber-btn-cyan' : 'cyber-btn-outline'}`}
                      >
                        Bước 2: Ghi Bàn
                      </button>
                    </div>
                  </div>
                </div>

                <div className="config-ai-card mt-4">
                  <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-purple-400" />
                    Tham Số Tiến Hóa (GA):
                  </h3>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Quần Thể (Số Lượng AI):</span>
                      <span className="text-purple-400 font-bold">{footballPopulation} Player</span>
                    </div>
                    <input
                      type="range" min="3" max="20" step="1"
                      value={footballPopulation}
                      onChange={(e) => setFootballPopulation(parseInt(e.target.value))}
                      className="slider-styled"
                    />
                  </div>

                  <div className="setting-slider-group mb-4">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Tỷ Lệ Đột Biến:</span>
                      <span className="text-cyan-400 font-bold">{(footballMutationRate * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range" min="0.01" max="0.5" step="0.01"
                      value={footballMutationRate}
                      onChange={(e) => setFootballMutationRate(parseFloat(e.target.value))}
                      className="slider-styled slider-styled-cyan"
                    />
                  </div>
                </div>
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
                : 'HUẤN LUYỆN BÓNG ĐÁ ANN'}
            </button>
            <p className="text-[10px] text-center text-slate-500 font-mono mt-3">
              {gameType === 'caro' 
                ? '* Cả hai bộ não AI luôn được huấn luyện tiến hóa tự động từ con số 0 (Zero Knowledge).'
                : gameType === 'racing'
                ? '* Các xe đua sẽ tự động tiến hóa, học cách né vật cản từ con số 0 dựa trên phản hồi tia quét.'
                : '* Đào tạo AI theo lộ trình tìm bóng, sút bóng và đối kháng tiến hóa di truyền.'}
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
