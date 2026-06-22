import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, FastForward, Activity, Brain, Trophy, ChevronRight, Hash, Upload } from 'lucide-react';
import { FootballConfig, SimulationState, CurriculumStep } from '../types/football';

interface FootballScreenProps {
  config: FootballConfig;
  onBack: () => void;
}

export default function FootballScreen({ config: initialConfig, onBack }: FootballScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [step, setStep] = useState<CurriculumStep>(initialConfig.step);
  const [speed, setSpeed] = useState<number>(1);
  const [stats, setStats] = useState({
    generation: 1,
    bestFitness: 0,
    time: 0,
    scoreA: 0,
    scoreB: 0,
    evenA: 0,
    evenB: 0,
    oddA: 0,
    oddB: 0
  });
  const [allTimeBest, setAllTimeBest] = useState(0);
  // Curriculum difficulty display (step 2 & 3)
  const [curriculum, setCurriculum] = useState({ atkGoalsAvg: 0, defStunAvg: 0, defPhase: 1, atkGoals: 0, defClearances: 0 });

  const stepRef = useRef(step);
  const genRef = useRef(stats.generation);

  const [isBgMode, setIsBgMode] = useState(false);
  const isBgModeRef = useRef(isBgMode);

  useEffect(() => {
    isBgModeRef.current = isBgMode;
  }, [isBgMode]);

  // Sync refs
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    genRef.current = stats.generation;
  }, [stats.generation]);

  useEffect(() => {
    // Initialize Web Worker exactly ONCE
    const worker = new Worker(new URL('../workers/football.worker.ts', import.meta.url), {
      type: 'module'
    });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'UPDATE') {
        const state: SimulationState = e.data.state;
        renderState(state);
        // Throttle React HUD state updates to once every 20 ticks (3 times per second)
        // to completely eliminate React virtual DOM reconciliation lag
        if (state.ticks % 20 === 0 || state.ticks === 1 || state.ticks >= 3990) {
          const roundedBest = Math.round(state.bestFitness);
          setAllTimeBest(prev => Math.max(prev, roundedBest));
          setStats({
            generation: state.generation,
            bestFitness: roundedBest,
            time: state.ticks,
            scoreA: state.scores?.A ?? 0,
            scoreB: state.scores?.B ?? 0,
            evenA: state.scores?.even?.A ?? 0,
            evenB: state.scores?.even?.B ?? 0,
            oddA: state.scores?.odd?.A ?? 0,
            oddB: state.scores?.odd?.B ?? 0
          });
          // Update curriculum stats if provided
          if (e.data.curriculum) {
            setCurriculum(e.data.curriculum);
          }
        }
      } else if (e.data.type === 'EXPORTED_BRAINS') {
        const brainsData = e.data.brains;
        const blob = new Blob([JSON.stringify(brainsData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `football_ai_brains_step${stepRef.current}_gen${genRef.current}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };

    worker.postMessage({ type: 'INIT', payload: { ...initialConfig, keepBrains: false } });
    worker.postMessage({ type: 'SET_SPEED', payload: speed });
    worker.postMessage({ type: 'SET_BACKGROUND_MODE', payload: isBgModeRef.current });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [initialConfig]); // Only recreate worker if initialConfig changes

  const handleSaveBrains = () => {
    workerRef.current?.postMessage({ type: 'EXPORT_BRAINS' });
  };

  const handleToggleBgMode = () => {
    const newVal = !isBgMode;
    setIsBgMode(newVal);
    workerRef.current?.postMessage({ type: 'SET_BACKGROUND_MODE', payload: newVal });
  };

  const handleLoadBrains = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (Array.isArray(json)) {
          workerRef.current?.postMessage({ type: 'IMPORT_BRAINS', payload: json });
          alert("Nạp bộ não AI thành công! AI sẽ bắt đầu học tiếp từ tệp tin đã nạp.");
        } else {
          alert("Lỗi: Định dạng tệp JSON bộ não không chính xác.");
        }
      } catch (err) {
        alert("Lỗi khi đọc tệp bộ não JSON.");
      }
    };
    reader.readAsText(file);
    // Reset file input value to allow uploading the same file again
    event.target.value = '';
  };

  const canvasRef2 = useRef<HTMLCanvasElement>(null);

  const SPRINT_COOLDOWN = 360;
  const DASH_COOLDOWN = 420;
  const STUN_COOLDOWN = 900;
  const KICKAWAY_COOLDOWN = 420;

  const drawCanvas = (canvas: HTMLCanvasElement, state: SimulationState, pairFilter: 'even' | 'odd' | number | null) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw pitch
    ctx.clearRect(0, 0, state.pitch.width, state.pitch.height);
    
    // Grass pattern / background
    ctx.fillStyle = '#0f172a'; // dark slate
    ctx.fillRect(0, 0, state.pitch.width, state.pitch.height);

    // Pitch lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(state.pitch.width / 2, 10);
    ctx.lineTo(state.pitch.width / 2, state.pitch.height - 10); // Center line
    ctx.stroke();
    
    // Center circle
    ctx.beginPath();
    ctx.arc(state.pitch.width / 2, state.pitch.height / 2, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Goals (Premium Goal Cage with white posts and net pattern)
    state.goals.forEach(goal => {
      ctx.save();
      // Draw Goal Area Background
      ctx.fillStyle = goal.team === 'A' ? 'rgba(192, 132, 252, 0.1)' : 'rgba(34, 211, 238, 0.1)';
      ctx.fillRect(goal.x, goal.y, goal.width, goal.height);

      // Draw Net Pattern (grid cross-hatching)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      for (let ny = goal.y + 10; ny < goal.y + goal.height; ny += 10) {
        ctx.beginPath();
        ctx.moveTo(goal.x, ny);
        ctx.lineTo(goal.x + goal.width, ny);
        ctx.stroke();
      }
      for (let nx = goal.x + 8; nx < goal.x + goal.width; nx += 8) {
        ctx.beginPath();
        ctx.moveTo(nx, goal.y);
        ctx.lineTo(nx, goal.y + goal.height);
        ctx.stroke();
      }

      // Draw Solid White Goalposts (cột dọc, xà ngang)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (goal.x < 100) {
        // Left Goal (team B): Open side on the right (x = goal.x + goal.width)
        ctx.moveTo(goal.x + goal.width, goal.y);
        ctx.lineTo(goal.x, goal.y);
        ctx.lineTo(goal.x, goal.y + goal.height);
        ctx.lineTo(goal.x + goal.width, goal.y + goal.height);
      } else {
        // Right Goal (team A): Open side on the left (x = goal.x)
        ctx.moveTo(goal.x, goal.y);
        ctx.lineTo(goal.x + goal.width, goal.y);
        ctx.lineTo(goal.x + goal.width, goal.y + goal.height);
        ctx.lineTo(goal.x, goal.y + goal.height);
      }
      ctx.stroke();

      // Draw red goal line
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (goal.x < 100) {
        ctx.moveTo(goal.x + goal.width, goal.y);
        ctx.lineTo(goal.x + goal.width, goal.y + goal.height);
      } else {
        ctx.moveTo(goal.x, goal.y);
        ctx.lineTo(goal.x, goal.y + goal.height);
      }
      ctx.stroke();

      ctx.restore();
    });



    // 1. Vẽ Vùng Giảm Tốc (Mud Slow-down Zones)
    if (state.slipperyZones) {
      state.slipperyZones.forEach(zone => {
        ctx.save();
        const grad = ctx.createRadialGradient(zone.x, zone.y, zone.radius * 0.2, zone.x, zone.y, zone.radius);
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
        grad.addColorStop(0.8, 'rgba(245, 158, 11, 0.08)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }

    // 2. Vẽ Obstacles
    if (state.obstacles) {
      state.obstacles.forEach(obs => {
        ctx.save();
        ctx.shadowColor = 'rgba(244, 63, 94, 0.4)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(obs.x, obs.y, obs.width, obs.height, 4);
        } else {
          ctx.rect(obs.x, obs.y, obs.width, obs.height);
        }
        ctx.fill();
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let offset = 10; offset < obs.width + obs.height; offset += 15) {
          ctx.moveTo(obs.x + Math.max(0, offset - obs.height), obs.y + Math.min(obs.height, offset));
          ctx.lineTo(obs.x + Math.min(obs.width, offset), obs.y + Math.max(0, offset - obs.width));
        }
        ctx.stroke();
        ctx.restore();
      });
    }


    // Draw Players
    state.players.forEach((player, idx) => {
      // Pair filter for steps 2 & 3
      if ((stepRef.current === 2 || stepRef.current === 3) && pairFilter !== null) {
        const pIdx = (player as any).pairIdx ?? 0;
        if (pairFilter === 'even' && pIdx % 2 !== 0) return;
        if (pairFilter === 'odd' && pIdx % 2 !== 1) return;
        if (typeof pairFilter === 'number' && pIdx !== pairFilter) return;
      }

      // Draw Clearance Kick Ring Effect (Emerald Shockwave)
      if ((player as any).showKickEffect && (player as any).showKickEffect > 0) {
        ctx.save();
        const kickAlpha = ((player as any).showKickEffect / 20) * 0.85;
        ctx.strokeStyle = `rgba(16, 185, 129, ${kickAlpha})`; // premium neon emerald green
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        const radius = player.radius + (20 - (player as any).showKickEffect) * 3;
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Draw Sprint / Dash active visual effects
      if (player.dashStunTimer && player.dashStunTimer > 0) {
        ctx.save();
        const stunAlpha = (player.dashStunTimer / 25) * 0.7;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 80, 80, ${stunAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 160, 50, ${stunAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else if (player.isSprinting) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      } else if (player.isDashing) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(player.x - player.vx * 1.5, player.y - player.vy * 1.5, player.radius - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      if (player.stealSpeedBoostTimer && player.stealSpeedBoostTimer > 0) {
        ctx.save();
        const boostAlpha = Math.min(1, player.stealSpeedBoostTimer / 30) * 0.5;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(52, 211, 153, ${boostAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);

      ctx.fillStyle = player.color;
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(player.radius - 4, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      if (player.personality) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + player.personality.aggression * 0.7})`;
        ctx.lineWidth = 1.5 + player.personality.aggression * 2;
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      
      const isStep3Match = state.goals.length === 2 && state.players.length === 2;
      if (!isStep3Match && player.isElite !== undefined) {
        ctx.fillStyle = player.isElite ? '#fbbf24' : '#22d3ee';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(player.isElite ? 'TINH HOA' : 'DÒ TÌM', player.x, player.y - player.radius - 8);
      }
      
      if (player.role) {
        ctx.fillStyle = player.role === 'attacker' ? '#f472b6' : '#22d3ee';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(player.role.toUpperCase(), player.x, player.y + player.radius + 10);
      }
      
      if (player.isHofChampion) {
        ctx.font = '12px sans-serif';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('⭐', player.x, player.y - player.radius - 22);
        
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('CHAMPION', player.x, player.y - player.radius - 14);
      }
      ctx.restore();

      // Render cooldown bars for skills and stamina (Steps 2+)
      if (stepRef.current >= 2) {
        ctx.save();
        const barW = 28;
        const barH = 3;
        const startX = player.x - barW / 2;
        let currentY = player.y - player.radius - 12;

        if (player.role === 'attacker') {
          // Sprint Cooldown Bar (Pink/Rose)
          const sprintCd = (player as any).sprintCooldown || 0;
          if (sprintCd > 0) {
            const progress = (SPRINT_COOLDOWN - sprintCd) / SPRINT_COOLDOWN;
            ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
            ctx.fillRect(startX, currentY, barW, barH);
            ctx.fillStyle = '#fb7185';
            ctx.fillRect(startX, currentY, barW * progress, barH);
            currentY += 5;
          }

          // Dash Cooldown Bar (Cyan)
          const dashCd = player.dashCooldown || 0;
          if (dashCd > 0) {
            const progress = (DASH_COOLDOWN - dashCd) / DASH_COOLDOWN;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
            ctx.fillRect(startX, currentY, barW, barH);
            ctx.fillStyle = '#67e8f9';
            ctx.fillRect(startX, currentY, barW * progress, barH);
            currentY += 5;
          }
        } else if (player.role === 'defender') {
          // Stun Cooldown Bar (Red)
          const stunCd = (player as any).stunCooldown || 0;
          if (stunCd > 0) {
            const progress = (STUN_COOLDOWN - stunCd) / STUN_COOLDOWN;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
            ctx.fillRect(startX, currentY, barW, barH);
            ctx.fillStyle = '#f87171';
            ctx.fillRect(startX, currentY, barW * progress, barH);
            currentY += 5;
          }

          // Kick Cooldown Bar (Emerald/Green)
          const kickCd = (player as any).kickCooldown || 0;
          if (kickCd > 0) {
            const progress = (KICKAWAY_COOLDOWN - kickCd) / KICKAWAY_COOLDOWN;
            ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            ctx.fillRect(startX, currentY, barW, barH);
            ctx.fillStyle = '#34d399';
            ctx.fillRect(startX, currentY, barW * progress, barH);
            currentY += 5;
          }
        }

        // Stamina Bar
        const stamina = (player as any).stamina ?? 100;
        ctx.fillStyle = 'rgba(100, 100, 0, 0.15)';
        ctx.fillRect(startX, currentY, barW, barH);
        const staminaColor = stamina > 50 ? '#a3e635' : stamina > 20 ? '#facc15' : '#f87171';
        ctx.fillStyle = staminaColor;
        ctx.fillRect(startX, currentY, barW * (stamina / 100), barH);

        ctx.restore();
      }
    });

    // Draw Balls
    state.balls.forEach((ball, idx) => {
      if (ball.isActive === false) return;
      // Pair filter for steps 2 & 3
      if ((stepRef.current === 2 || stepRef.current === 3) && pairFilter !== null) {
        if (pairFilter === 'even' && idx % 2 !== 0) return;
        if (pairFilter === 'odd' && idx % 2 !== 1) return;
        if (typeof pairFilter === 'number' && idx !== pairFilter) return;
      }

      const ballSpeed = Math.sqrt(ball.vx**2 + ball.vy**2);
      if (ballSpeed > 2 && ball.ownerId === null) {
        for (let t = 1; t <= 3; t++) {
          const trailX = ball.x - ball.vx * t * 0.7;
          const trailY = ball.y - ball.vy * t * 0.7;
          ctx.save();
          ctx.globalAlpha = 0.15 / t;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(trailX, trailY, ball.radius * (1 - t * 0.2), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.fillStyle = ball.ownerId === null ? '#ffffff' : '#ffe066';
      ctx.shadowColor = ball.ownerId === null ? '#ffffff' : '#ffe066';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  };

  const renderState = (state: SimulationState) => {
    if (isBgModeRef.current) return; // Skip rendering in background mode
    const canvas1 = canvasRef.current;
    const canvas2 = canvasRef2.current;

    if (stepRef.current === 2) {
      if (canvas1) drawCanvas(canvas1, state, 'even');
      if (canvas2) drawCanvas(canvas2, state, 'odd');
    } else {
      if (canvas1) drawCanvas(canvas1, state, null);
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      workerRef.current?.postMessage({ type: 'STOP' });
    } else {
      workerRef.current?.postMessage({ type: 'START' });
    }
    setIsPlaying(!isPlaying);
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    workerRef.current?.postMessage({ type: 'SET_SPEED', payload: newSpeed });
  };

  const handleChangeStep = (newStep: CurriculumStep) => {
    setAllTimeBest(0);
    setStep(newStep);
    workerRef.current?.postMessage({ type: 'SET_STEP', payload: newStep });
    if (!isPlaying) {
      setIsPlaying(true);
      workerRef.current?.postMessage({ type: 'START' });
    }
  };

  return (
    <div className="arena-container flex flex-col h-screen w-full">
      {/* HEADER */}
      <header className="arena-header flex items-center justify-between p-4 glass-panel border-b border-slate-800/50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-2 px-3 text-xs flex gap-2">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-xl font-bold font-mono text-white tracking-wider flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" /> FOOTBALL AI ARENA
            </h1>
            <span className="text-[10px] text-emerald-400/70 uppercase tracking-widest font-mono">
              CURRICULUM LEARNING MODULE
            </span>
          </div>
        </div>

        <div className="flex gap-4 items-center">
        </div>

        <div className="flex flex-wrap gap-4 items-center justify-end">
          {/* Main stats counters / Averages */}
          {step === 1 ? (
            <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-lime-500/30 rounded-xl px-4 py-2 shadow-lg shadow-lime-950/20">
              <span className="text-[10px] text-lime-400 font-bold font-mono tracking-wider uppercase">BÓNG NHẶT/TRẬN:</span>
              <span className="text-lg font-bold font-mono text-lime-400 min-w-[40px] text-center">
                {stats.generation > 1 ? (stats.scoreA / stats.generation).toFixed(1) : stats.scoreA}
              </span>
            </div>
          ) : step === 3 ? (
            <div className="flex flex-col gap-1.5">
              {/* Scoreboard: ATK bàn vs DEF cản phá */}
              <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur border border-purple-500/20 rounded-xl px-4 py-2 shadow-lg">
                <span className="text-[10px] text-slate-400 font-mono font-semibold uppercase tracking-wider">TỈ SỐ:</span>
                <span className="text-base font-bold font-mono">
                  <span className="text-purple-300">{curriculum.atkGoals}</span>
                  <span className="text-slate-500 mx-1.5">vs</span>
                  <span className="text-cyan-300">{curriculum.defClearances}</span>
                </span>
                <span className="text-[9px] text-slate-600 font-mono">(⚽ bàn / 🛡 cản phá)</span>
                <span className="text-slate-700 font-mono">|</span>
                <span className="text-[10px] text-slate-400 font-mono" title="Trung bình số bàn ATK ghi mỗi cặp 1v1 mỗi thế hệ (EMA)">TB/TRẬN:</span>
                <span className="text-xs font-bold font-mono text-purple-300" title="EMA của s3AtkGoals / popSize">{curriculum.atkGoalsAvg.toFixed(2)}</span>
              </div>
              {/* 4-phase progression bar */}
              <div className="flex items-center gap-1 px-1">
                {([
                  { p: 1, label: 'TUẦN TRA', sub: '<3', color: '#60a5fa', bg: 'rgba(59,130,246,' },
                  { p: 2, label: 'ĐỐI ĐẦU',  sub: '3-8', color: '#34d399', bg: 'rgba(52,211,153,' },
                  { p: 3, label: 'PHỤC KÍCH', sub: '8-15', color: '#fbbf24', bg: 'rgba(251,191,36,' },
                  { p: 4, label: 'TRÍ TUỆ',  sub: '>15', color: '#f87171', bg: 'rgba(239,68,68,' },
                ] as const).map((ph, idx) => {
                  const active = (curriculum.defPhase ?? 1) === ph.p;
                  const done   = (curriculum.defPhase ?? 1) > ph.p;
                  return (
                    <React.Fragment key={ph.p}>
                      <div
                        className="flex flex-col items-center px-2 py-0.5 rounded text-[8px] font-mono font-bold transition-all"
                        style={{
                          background: active ? ph.bg + '0.25)' : done ? ph.bg + '0.08)' : 'rgba(15,23,42,0.6)',
                          color: active ? ph.color : done ? ph.color + '99' : '#475569',
                          border: `1px solid ${active ? ph.color : done ? ph.color + '44' : '#1e293b'}`,
                          minWidth: '52px',
                          opacity: done ? 0.65 : 1,
                        }}
                      >
                        <span>{active ? '▶ ' : done ? '✓ ' : ''}{ph.label}</span>
                        <span style={{ opacity: 0.7 }}>{ph.sub} bàn</span>
                      </div>
                      {idx < 3 && <span className="text-slate-700 font-mono text-[9px]">→</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {/* ATK + DEF averages row */}
              <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur border border-purple-500/20 rounded-xl px-4 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-purple-400 font-bold font-mono tracking-wider uppercase">⚽ ATK BÀN/TRẬN:</span>
                  <span className="text-sm font-bold font-mono text-purple-300 bg-purple-950/40 border border-purple-900/50 px-2 py-0.5 rounded min-w-[36px] text-center">
                    {curriculum.atkGoalsAvg.toFixed(1)}
                  </span>
                </div>
                <span className="text-slate-700 font-mono">|</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-cyan-400 font-bold font-mono tracking-wider uppercase">🛡 DEF CẢN PHÁ/TRẬN:</span>
                  <span className="text-sm font-bold font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-900/50 px-2 py-0.5 rounded min-w-[36px] text-center">
                    {curriculum.defStunAvg.toFixed(1)}
                  </span>
                </div>
              </div>
              {/* Curriculum difficulty labels */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[9px] text-purple-400/70 font-mono font-semibold">ATK SPAWN:</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{
                  background: curriculum.atkGoalsAvg < 5 ? 'rgba(52,211,153,0.15)' : curriculum.atkGoalsAvg < 10 ? 'rgba(251,191,36,0.15)' : curriculum.atkGoalsAvg < 15 ? 'rgba(249,115,22,0.15)' : curriculum.atkGoalsAvg < 20 ? 'rgba(239,68,68,0.15)' : 'rgba(168,85,247,0.15)',
                  color: curriculum.atkGoalsAvg < 5 ? '#34d399' : curriculum.atkGoalsAvg < 10 ? '#fbbf24' : curriculum.atkGoalsAvg < 15 ? '#f97316' : curriculum.atkGoalsAvg < 20 ? '#ef4444' : '#c084fc',
                  border: '1px solid currentColor'
                }}>
                  {curriculum.atkGoalsAvg < 5 ? 'SÁT KHUNG THÀNH' : curriculum.atkGoalsAvg < 10 ? '1/8 SÂN' : curriculum.atkGoalsAvg < 15 ? '1/4 SÂN' : curriculum.atkGoalsAvg < 20 ? '1/2 SÂN' : 'CẢ SÂN 🔥'}
                </span>
                <span className="text-slate-700 font-mono text-[9px]">|</span>
                <span className="text-[9px] text-cyan-400/70 font-mono font-semibold">HÌNH NỘM:</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{
                  background: curriculum.defStunAvg < 7
                    ? 'rgba(59, 130, 246, 0.15)'
                    : curriculum.defStunAvg < 8
                    ? 'rgba(251, 191, 36, 0.15)'
                    : curriculum.defStunAvg < 15
                    ? 'rgba(249, 115, 22, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                  color: curriculum.defStunAvg < 7
                    ? '#3b82f6'
                    : curriculum.defStunAvg < 8
                    ? '#fbbf24'
                    : curriculum.defStunAvg < 15
                    ? '#f97316'
                    : '#ef4444',
                  border: '1px solid currentColor'
                }}>
                  {curriculum.defStunAvg < 7
                    ? `ĐUỔI THEO (50% TỐC - ${curriculum.defStunAvg.toFixed(1)}/7)`
                    : curriculum.defStunAvg < 8
                    ? 'ĐI CHẬM (40% TỐC)'
                    : curriculum.defStunAvg < 15
                    ? 'CHẠY BỘ (65% TỐC)'
                    : 'TOÀN TỐC 💀'}
                </span>
              </div>
            </div>
          )}


          {/* Generation pill */}
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-purple-500/10">
            <Hash className="w-3.5 h-3.5 text-purple-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">THẾ HỆ</span>
              <span className="text-xs font-bold text-white font-mono">{stats.generation}</span>
            </div>
          </div>

          {/* Fitness pill */}
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-amber-500/10">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">ĐIỂM (HIỆN TẠI / TỐT NHẤT)</span>
              <span className="text-xs font-bold text-amber-400 font-mono">{stats.bestFitness} / {allTimeBest}</span>
            </div>
          </div>
        </div>

        {/* Action Controls & Speed Row */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          {/* Speed settings */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-lg p-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold pl-1.5">TỐC ĐỘ:</span>
            <div className="flex gap-0.5">
              {[1, 2, 4, 8, 15].map(s => (
                <button
                  key={s}
                  disabled={isBgMode}
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                    isBgMode
                      ? 'text-slate-700 cursor-not-allowed'
                      : speed === s
                      ? 'bg-purple-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Fast Training Glow Toggle */}
          <button
            onClick={handleToggleBgMode}
            className={`py-2 px-3 flex items-center gap-2 text-xs font-bold font-mono rounded-lg transition-all border ${
              isBgMode
                ? 'bg-rose-500/20 text-rose-400 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
            }`}
          >
            <Activity className={`w-4 h-4 ${isBgMode ? 'text-rose-400' : 'text-slate-500'}`} />
            {isBgMode ? '🔴 CHẠY NGẦM ACTIVE' : '⚪ BẬT CHẠY NGẦM'}
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            style={{ display: 'none' }}
          />

          <button
            onClick={handleLoadBrains}
            className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-emerald-400 border-emerald-900/50 hover:bg-emerald-900/20"
          >
            <Upload className="w-3.5 h-3.5" /> NẠP NÃO
          </button>

          <button
            onClick={handleSaveBrains}
            className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-purple-400 border-purple-900/50 hover:bg-purple-900/20"
          >
            <Brain className="w-3.5 h-3.5" /> LƯU NÃO
          </button>

          <button
            onClick={handleTogglePlay}
            className={`cyber-btn py-2 px-3.5 flex items-center gap-1.5 text-xs ${isPlaying ? 'cyber-btn-outline text-rose-400 border-rose-900/50 hover:bg-rose-900/20' : 'cyber-btn-emerald'}`}
          >
            {isPlaying ? <><Square className="w-3.5 h-3.5" /> DỪNG</> : <><Play className="w-3.5 h-3.5" /> CHẠY</>}
          </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-grow flex p-4 gap-4 overflow-hidden">
        
        {/* LEFT: CURRICULUM PANEL */}
        <div className="w-64 glass-panel p-4 flex flex-col h-full">
          <h2 className="text-sm font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" /> Lộ Trình Huấn Luyện
          </h2>
          
          <div className="flex flex-col gap-3">
            {[
              { s: 1, title: 'Bước 1: Lấy Bóng', desc: 'AI học cách tìm và nhặt bóng.' },
              { s: 2, title: 'Bước 2: Sút Bóng', desc: 'AI học cách đưa bóng vào khung thành.' },
              { s: 3, title: 'Bước 3: Đối đầu 1vs1', desc: 'Sử dụng kỹ năng lướt & chạy nước rút để cướp và bảo vệ bóng.' },
              { s: 4, title: 'Bước 4: Phối hợp 3vs3', desc: 'Sắp ra mắt: Kỹ năng phối hợp nhóm.' }
            ].map(item => (
              <button
                key={item.s}
                disabled={item.s > 3} // Temporarily disable only 4 (Step 3 is now unlocked!)
                onClick={() => handleChangeStep(item.s as CurriculumStep)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  step === item.s 
                    ? 'bg-purple-900/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                    : item.s > 3 
                      ? 'bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs font-bold font-mono ${step === item.s ? 'text-purple-400' : 'text-slate-300'}`}>
                    {item.title}
                  </span>
                  {step === item.s && <Activity className="w-3 h-3 text-purple-400" />}
                </div>
                <p className="text-[10px] text-slate-500">{item.desc}</p>
                {step === item.s && (
                  <div className="mt-2 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Đang huấn luyện
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3">
            {step >= 2 && (
              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 flex flex-col gap-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest border-b border-slate-850 pb-1 flex items-center gap-1.5">
                  🔥 HỆ THỐNG KỸ NĂNG AI
                </span>
                
                <div className="flex flex-col gap-1.5 text-[10px] font-mono">
                  <span className="text-pink-400 font-bold">🔺 TIỀN ĐẠO (ATTACKER):</span>
                  <div className="flex items-center gap-1.5 pl-2 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                    <span>Sprint: 1.8x Tốc độ (6s CD)</span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-2 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span>Dash: 2.5x & Né tránh (7s CD)</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-[10px] font-mono mt-1">
                  <span className="text-cyan-400 font-bold">🛡️ HẬU VỆ (DEFENDER):</span>
                  <div className="flex items-center gap-1.5 pl-2 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    <span>Stun: Choáng ATK (15s CD)</span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-2 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>Clearance: Sút xa giải vây (7s CD)</span>
                  </div>
                </div>
              </div>
            )}

            <div className="text-[10px] text-slate-500 font-mono p-3 bg-black/20 rounded border border-slate-800/50">
              * Nhấn để chuyển bước. Bộ não AI sẽ được lưu giữ và tiếp tục học hỏi trong môi trường mới.
            </div>
          </div>
        </div>

        {/* RIGHT: SIMULATION CANVAS */}
        <div className="flex-grow glass-panel relative flex flex-col overflow-hidden p-2">
          {isBgMode && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-slate-900/90 border border-purple-500/20 max-w-md p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 relative overflow-hidden">
                <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-lime-500/10 rounded-full blur-2xl"></div>
                
                <div className="relative">
                  <span className="flex h-4 w-4 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
                  </span>
                </div>

                <h3 className="text-lg font-bold font-mono text-white tracking-wider uppercase mt-2">
                  Đang Huấn Luyện Nhanh (Chạy Ngầm)
                </h3>
                <p className="text-xs text-slate-400 font-mono leading-relaxed">
                  Bỏ qua hoàn toàn render đồ họa Canvas để tối ưu hiệu năng. AI đang tự động thi đấu và học tập với tốc độ siêu nhanh (~180x).
                </p>

                <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 font-mono text-left text-xs mt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thế hệ hiện tại:</span>
                    <span className="text-purple-400 font-bold">{stats.generation}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Điểm số tốt nhất:</span>
                    <span className="text-amber-400 font-bold">{stats.bestFitness}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tiến độ trận đấu:</span>
                    <span className="text-slate-300">{stats.time} / 4000 ticks</span>
                  </div>
                </div>

                <button
                  onClick={handleToggleBgMode}
                  className="cyber-btn cyber-btn-emerald py-2 px-5 text-xs mt-3 flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" /> QUAY LẠI CHẾ ĐỘ QUAN SÁT
                </button>
              </div>
            </div>
          )}

          {step === 2 ? (
            <div className="flex-1 min-h-0 flex flex-col gap-2 w-full">
              {/* Canvas 1 — ATK training */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between w-full px-1 mb-0.5 shrink-0">
                  <span className="text-[9px] font-mono text-purple-400 font-bold uppercase tracking-wider">
                    ⚽ TRẬN 1 — TIỀN ĐẠO HỌC SÚT (KHÔNG CÓ HẬU VỆ)
                  </span>
                  <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 font-mono text-[9px] text-white shrink-0 ml-2">
                    <span className="text-purple-400 font-bold">A: {stats.evenA}</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-sky-400 font-bold">B: {stats.evenB}</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={1120}
                    height={700}
                    className="rounded-lg shadow-2xl border border-slate-700/50"
                    style={{
                      background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      aspectRatio: '1120 / 700',
                    }}
                  />
                </div>
              </div>
              {/* Canvas 2 — DEF training */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between w-full px-1 mb-0.5 shrink-0">
                  <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                    🛡️ TRẬN 2 — HẬU VỆ HỌC CẢN PHÁ (TIỀN ĐẠO HỒNG VS HẬU VỆ XANH LÁ)
                  </span>
                  <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 font-mono text-[9px] text-white shrink-0 ml-2">
                    <span className="text-pink-400 font-bold">A: {stats.oddA}</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-emerald-400 font-bold">B: {stats.oddB}</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                  <canvas
                    ref={canvasRef2}
                    width={1120}
                    height={700}
                    className="rounded-lg shadow-2xl border border-slate-700/50"
                    style={{
                      background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      aspectRatio: '1120 / 700',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Step 1, 3, 4+: single canvas */
            <div className="flex-1 min-h-0 flex flex-col">
              {step === 3 && (
                <div className="flex items-center justify-between w-full px-1 mb-0.5 shrink-0">
                  <span className="text-[9px] font-mono text-purple-400 font-bold uppercase tracking-wider">
                    ⚽ 1v1 — TIỀN ĐẠO TÍM vs HẬU VỆ XANH NHẠT
                  </span>
                  <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 font-mono text-[9px] text-white shrink-0 ml-2">
                    <span className="text-purple-400 font-bold">⚽ ATK: {curriculum.atkGoals}</span>
                    <span className="text-slate-600 font-bold mx-1">vs</span>
                    <span className="text-cyan-400 font-bold">🛡 DEF: {curriculum.defClearances}</span>
                  </div>
                </div>
              )}
              <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={1120}
                  height={700}
                  className="rounded-xl shadow-2xl border border-slate-700/50"
                  style={{
                    background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    aspectRatio: '1120 / 700',
                  }}
                />
              </div>
            </div>
          )}
          
          {/* Simulation Time Overlay */}
          <div className="absolute top-2 right-3 font-mono text-[9px] text-slate-600 pointer-events-none">
            TIME: {stats.time} / 4000
          </div>
        </div>

      </div>
    </div>
  );
}
