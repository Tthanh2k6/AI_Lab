import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Hash, Trophy, Activity, Compass, Cpu } from 'lucide-react';
import { QMazeConfig } from '../types/game';
import { generateMaze, createAgent, qStep, successRate, QMaze, QAgent } from '../utils/qmaze';
import { drawQMaze } from '../utils/renderQMaze';

interface Props {
  config: QMazeConfig;
  onBack: () => void;
}

const SPEEDS = [1, 5, 25, 150, 800];

export default function QMazeScreen({ config, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mazeRef = useRef<QMaze>(generateMaze(config.size));
  const agentRef = useRef<QAgent>(createAgent(mazeRef.current));
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(true);
  const speedRef = useRef(config.speed || 25);
  const frameRef = useRef(0);

  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(config.speed || 25);
  const [px, setPx] = useState(520);
  const [stats, setStats] = useState({ episode: 1, steps: 0, epsilon: 1, rate: 0, best: 0, optimal: mazeRef.current.optimal });

  useEffect(() => {
    const measure = () => {
      const maxW = window.innerWidth - 32;
      setPx(Math.max(280, Math.min(maxW, 620, Math.floor(window.innerHeight * 0.6))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const loop = () => {
      if (runningRef.current) {
        const steps = speedRef.current;
        for (let i = 0; i < steps; i++) qStep(agentRef.current, mazeRef.current);
      }
      drawQMaze(ctx, mazeRef.current, agentRef.current, canvas.width);

      frameRef.current++;
      if (frameRef.current % 4 === 0) {
        const a = agentRef.current;
        setStats({
          episode: a.episode,
          steps: a.steps,
          epsilon: a.epsilon,
          rate: successRate(a),
          best: a.bestSteps === Infinity ? 0 : a.bestSteps,
          optimal: mazeRef.current.optimal,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const toggleRun = () => { runningRef.current = !runningRef.current; setIsRunning(runningRef.current); };
  const handleSpeed = (s: number) => { speedRef.current = s; setSimSpeed(s); };
  const newMaze = () => {
    mazeRef.current = generateMaze(config.size);
    agentRef.current = createAgent(mazeRef.current);
  };
  const resetQ = () => { agentRef.current = createAgent(mazeRef.current); };

  return (
    <div className="arena-container flex flex-col h-screen w-full">
      <header className="arena-header flex items-center justify-between p-4 glass-panel border-b border-slate-800/50 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-2 px-3 text-xs flex gap-2">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-xl font-bold font-mono text-white tracking-wider flex items-center gap-2">
              <Compass className="w-5 h-5 text-blue-400" /> MÊ CUNG Q-LEARNING
            </h1>
            <span className="text-[10px] text-blue-400/70 uppercase tracking-widest font-mono">
              REINFORCEMENT LEARNING • BẢNG Q
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center stats-container-scrollable">
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-blue-500/10">
            <Hash className="w-3.5 h-3.5 text-blue-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">TẬP</span>
              <span className="text-xs font-bold text-white font-mono">{stats.episode}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-rose-500/10">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">KHÁM PHÁ (ε)</span>
              <span className="text-xs font-bold text-rose-400 font-mono">{Math.round(stats.epsilon * 100)}%</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-emerald-500/10">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">TỚI ĐÍCH (50 TẬP)</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">{Math.round(stats.rate * 100)}%</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-amber-500/10">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">NGẮN NHẤT / TỐI ƯU</span>
              <span className="text-xs font-bold text-amber-400 font-mono">{stats.best || '—'} / {stats.optimal}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 header-controls-container">
          <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-lg p-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold pl-1.5">TỐC ĐỘ:</span>
            <div className="flex gap-0.5">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSpeed(s)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                    simSpeed === s ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(59,130,246,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {s === 800 ? '⚡' : `${s}×`}
                </button>
              ))}
            </div>
          </div>
          <button onClick={resetQ} className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-rose-400 border-rose-900/50 hover:bg-rose-900/20">
            <RefreshCw className="w-3.5 h-3.5" /> ĐẶT LẠI Q
          </button>
          <button onClick={newMaze} className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-amber-400 border-amber-900/50 hover:bg-amber-900/20">
            <Compass className="w-3.5 h-3.5" /> MÊ CUNG MỚI
          </button>
          <button
            onClick={toggleRun}
            className={`cyber-btn py-2 px-3.5 flex items-center gap-1.5 text-xs ${isRunning ? 'cyber-btn-outline text-rose-400 border-rose-900/50 hover:bg-rose-900/20' : 'cyber-btn-emerald'}`}
          >
            {isRunning ? <><Square className="w-3.5 h-3.5" /> DỪNG</> : <><Play className="w-3.5 h-3.5" /> CHẠY</>}
          </button>
        </div>
      </header>

      <div className="flex-grow flex items-center justify-center gap-6 p-4 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={px}
          height={px}
          className="rounded-xl border border-slate-700/50 shadow-2xl"
          style={{ width: px, height: px, background: '#0b1220' }}
        />
        {/* Chú giải */}
        <div className="hidden lg:flex flex-col gap-3 glass-panel p-4 w-56 text-[11px] font-mono text-slate-300">
          <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">Chú giải</span>
          <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span> Tác nhân (agent)</div>
          <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-amber-400 flex items-center justify-center text-[10px] text-orange-900">★</span> Đích đến</div>
          <div className="flex items-center gap-2"><span className="w-4 h-4 rounded border-2 border-sky-400"></span> Xuất phát</div>
          <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-[#0b1220] border border-slate-700"></span> Tường</div>
          <div className="mt-2 leading-relaxed text-slate-400">
            <p className="mb-2"><b className="text-white">Bản đồ nhiệt</b>: giá trị Q của mỗi ô — <span className="text-blue-400">xanh</span> (thấp) → <span className="text-red-400">đỏ</span> (cao, gần đích).</p>
            <p className="mb-2"><b className="text-white">Mũi tên</b>: hành động tốt nhất đã học tại ô đó (chính sách).</p>
            <p>Agent dùng <b className="text-white">ε-greedy</b>: khám phá nhiều lúc đầu (ε cao) rồi khai thác dần. Xem heatmap & mũi tên hội tụ về đường ngắn nhất.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
