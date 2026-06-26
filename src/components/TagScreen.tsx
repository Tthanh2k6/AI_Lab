import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Activity, Timer, Cpu, Target, Zap, Eye } from 'lucide-react';
import { TagConfig } from '../types/game';
import { createTagWorld, stepTagWorld, resetTagWorld, secondsLeftTag, TagWorld, TAG } from '../utils/tagGame';
import { TagRenderer } from '../utils/renderTag';

interface Props {
  config: TagConfig;
  onBack: () => void;
}

const SPEEDS = [1, 2, 4, 8, 16, 50];

export default function TagScreen({ config, onBack }: Props) {
  const wrapRef     = useRef<HTMLDivElement | null>(null);
  const worldRef    = useRef<TagWorld>(createTagWorld());
  const rendererRef = useRef<TagRenderer | null>(null);
  const rafRef      = useRef<number | null>(null);
  const runningRef  = useRef(true);
  const speedRef    = useRef(config.speed ?? 2);
  const mutRef      = useRef(config.mutationRate ?? 0.12);
  const frameRef    = useRef(0);

  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed,  setSimSpeed]  = useState(config.speed ?? 2);
  const [stats, setStats] = useState({
    generation: 0,
    time: Math.ceil(TAG.MATCH_TICKS / 60),
    matchTagCount: 0,
    chaserWins: 0, evaderWins: 0,
    chaserFit: 0, evaderFit: 0,
    chaserBest: 0, evaderBest: 0,
    dist: 0,
    tagFlashing: false,
    chaserZ: 0, evaderZ: 0,
    chaserCd: 0, evaderCd: 0,
    avgDist: 0,
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cw = wrap.clientWidth  || 960;
    const ch = wrap.clientHeight || 600;
    const renderer = new TagRenderer(wrap, cw, ch);
    rendererRef.current = renderer;

    const loop = () => {
      const w = worldRef.current;
      if (runningRef.current) {
        const steps = speedRef.current;
        for (let i = 0; i < steps; i++) stepTagWorld(w, mutRef.current);
      }
      renderer.render(w);
      frameRef.current++;
      if (frameRef.current % 4 === 0) {
        const dx = w.chaser.x - w.evader.x;
        const dy = w.chaser.y - w.evader.y;
        setStats({
          generation:    w.generation,
          time:          secondsLeftTag(w),
          matchTagCount: w.matchTagCount,
          chaserWins:    w.chaserWins,
          evaderWins:    w.evaderWins,
          chaserFit:     isFinite(w.chaser.fitness) ? Math.round(w.chaser.fitness) : 0,
          evaderFit:     isFinite(w.evader.fitness) ? Math.round(w.evader.fitness) : 0,
          chaserBest:    isFinite(w.chaser.bestFitness) ? Math.round(w.chaser.bestFitness) : 0,
          evaderBest:    isFinite(w.evader.bestFitness) ? Math.round(w.evader.bestFitness) : 0,
          dist:          isFinite(dx) && isFinite(dy) ? Math.round(Math.sqrt(dx * dx + dy * dy)) : 0,
          tagFlashing:   w.tagFlashTicks > 0,
          chaserZ:       isFinite(w.chaser.z) ? parseFloat(w.chaser.z.toFixed(1)) : 0,
          evaderZ:       isFinite(w.evader.z) ? parseFloat(w.evader.z.toFixed(1)) : 0,
          chaserCd:      w.chaser.tagCooldown,
          evaderCd:      w.evader.tagCooldown,
          avgDist:       isFinite(w.avgChaserDist) ? Math.round(w.avgChaserDist) : 0,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w > 0 && h > 0) rendererRef.current?.resize(w, h);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const toggleRun   = () => { runningRef.current = !runningRef.current; setIsRunning(runningRef.current); };
  const handleSpeed = (s: number) => { speedRef.current = s; setSimSpeed(s); };
  const handleReset = () => { resetTagWorld(worldRef.current); };

  const timePct = (stats.time / Math.ceil(TAG.MATCH_TICKS / 60)) * 100;
  const tagPct  = (stats.matchTagCount / TAG.MAX_TAGS) * 100;
  const winTotal = stats.chaserWins + stats.evaderWins;
  const kaiWinRate = winTotal > 0 ? Math.round(stats.chaserWins / winTotal * 100) : 50;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden" style={{ background: '#070910' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2 border-b border-slate-800 flex-wrap gap-2"
        style={{ background: 'rgba(7,9,16,0.9)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-1.5 px-3 text-xs flex gap-1.5">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-base font-bold font-mono text-white tracking-widest flex items-center gap-2 leading-tight">
              <Target className="w-4 h-4 text-blue-400" />
              ĐUỔI BẮT AI 3D
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-blue-500/40 text-blue-400 ml-1">KAI vs ALBERT</span>
            </h1>
            <span className="text-[9px] text-blue-400/60 uppercase tracking-widest font-mono block">
              NEUROEVOLUTION • RAYCASTS • CUBES • JUMPING
            </span>
          </div>
        </div>

        {/* Scoreboard */}
        <div className="flex items-center gap-2.5">
          {/* KAI (Chaser) score */}
          <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 border"
            style={{ background: 'rgba(37,99,235,0.1)', borderColor: 'rgba(37,99,235,0.35)' }}>
            <div className="w-3 h-3 rounded-sm" style={{ background: '#2563eb' }} />
            <span className="text-[10px] font-mono text-blue-400 font-bold">KAI</span>
            <span className="text-2xl font-extrabold font-mono"
              style={{ color: '#60a5fa', textShadow: '0 0 12px rgba(96,165,250,.5)' }}>
              {stats.chaserWins}
            </span>
          </div>

          <span className="text-slate-600 font-bold text-lg">:</span>

          {/* ALBERT (Evader) score */}
          <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 border"
            style={{ background: 'rgba(248,250,252,0.06)', borderColor: 'rgba(248,250,252,0.2)' }}>
            <span className="text-2xl font-extrabold font-mono"
              style={{ color: '#f1f5f9', textShadow: '0 0 12px rgba(248,250,252,.3)' }}>
              {stats.evaderWins}
            </span>
            <span className="text-[10px] font-mono text-slate-300 font-bold">ALBERT</span>
            <div className="w-3 h-3 rounded-sm" style={{ background: '#f8fafc' }} />
          </div>

          {/* Tag progress */}
          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-amber-500/20 rounded-lg px-2.5 py-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">BẮT ĐỰC</span>
              <span className="text-sm font-bold text-amber-400 font-mono">{stats.matchTagCount}/{TAG.MAX_TAGS}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1">
            <Timer className="w-3.5 h-3.5 text-slate-300" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">CÒN</span>
              <span className="text-sm font-bold text-white font-mono">{stats.time}s</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-indigo-500/20 rounded-lg px-2.5 py-1">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">THẾ HỆ</span>
              <span className="text-sm font-bold text-indigo-400 font-mono">#{stats.generation}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase pl-1">TUA:</span>
            <div className="flex gap-0.5">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => handleSpeed(s)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                    simSpeed === s ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleReset}
            className="cyber-btn cyber-btn-outline py-1.5 px-2.5 flex items-center gap-1 text-xs text-rose-400 border-rose-900/40">
            <RefreshCw className="w-3.5 h-3.5" /> RESET
          </button>
          <button onClick={toggleRun}
            className={`cyber-btn py-1.5 px-3 flex items-center gap-1 text-xs ${
              isRunning ? 'cyber-btn-outline text-rose-400 border-rose-900/40' : 'cyber-btn-emerald'
            }`}>
            {isRunning ? <><Square className="w-3.5 h-3.5" /> DỪNG</> : <><Play className="w-3.5 h-3.5" /> CHẠY</>}
          </button>
        </div>
      </header>

      {/* Progress bars */}
      <div className="h-1 w-full bg-slate-900">
        <div className="h-full bg-gradient-to-r from-indigo-600 to-blue-400 transition-[width] duration-200"
          style={{ width: `${timePct}%` }} />
      </div>
      <div className="h-0.5 w-full bg-slate-900">
        <div className="h-full bg-gradient-to-r from-red-600 to-amber-400 transition-[width] duration-100"
          style={{ width: `${tagPct}%` }} />
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', height: 'calc(100vh - 94px)', gap: 10, padding: 10, overflow: 'hidden', background: '#06070d' }}>
        {/* 3D Canvas */}
        <div ref={wrapRef} style={{
          flex: '1 1 0', minWidth: 0, height: '100%', position: 'relative',
          borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(37,99,235,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7), inset 0 0 40px rgba(37,99,235,0.04)',
        }} />

        {/* Side panel */}
        <div className="glass-panel p-3 font-mono text-slate-300 scrollbar-styled"
          style={{ width: 275, flexShrink: 0, height: '100%', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 9, fontSize: 11 }}>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> BẢNG AI
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[9px] text-slate-500 font-semibold">{isRunning ? 'RUNNING' : 'PAUSED'}</span>
            </span>
          </div>

          {/* TAG ALERT */}
          {stats.tagFlashing && (
            <div className="rounded-xl p-2.5 text-center font-bold border animate-pulse"
              style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24' }}>
              🎯 KAI BẮT ĐƯỢC ALBERT!
            </div>
          )}

          {/* KAI (Chaser) Card */}
          <div className="rounded-xl p-3 border flex flex-col gap-2"
            style={{ background: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.25)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-4 rounded" style={{ background: '#2563eb', display: 'block' }} />
                <span className="font-bold text-white text-[12px]">🔵 KAI (Đuổi)</span>
              </div>
              <div className="flex items-center gap-1">
                {stats.chaserCd === 0
                  ? <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded animate-pulse">READY</span>
                  : <span className="text-[9px] text-slate-500">{stats.chaserCd}t cd</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block">VÁN NÀY</span>
                <span className="text-sm font-extrabold text-blue-400 font-mono">{stats.chaserFit}</span>
              </div>
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block">KỶ LỤC</span>
                <span className="text-sm font-extrabold text-slate-300 font-mono">{stats.chaserBest}</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>Độ cao: <span className="text-blue-300 font-mono">{stats.chaserZ}m</span></span>
              <span>Thắng: <span className="text-blue-300 font-bold">{stats.chaserWins}</span></span>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-200"
                style={{ width: `${Math.min(100, stats.chaserBest > 0 ? (stats.chaserFit / stats.chaserBest) * 100 : 50)}%` }} />
            </div>
          </div>

          {/* ALBERT (Evader) Card */}
          <div className="rounded-xl p-3 border flex flex-col gap-2"
            style={{ background: 'rgba(248,250,252,0.04)', borderColor: 'rgba(248,250,252,0.15)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-4 rounded" style={{ background: '#f8fafc', display: 'block' }} />
                <span className="font-bold text-white text-[12px]">⬜ ALBERT (Trốn)</span>
              </div>
              <div className="flex items-center gap-1">
                {stats.evaderCd === 0
                  ? <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded animate-pulse">READY</span>
                  : <span className="text-[9px] text-slate-500">{stats.evaderCd}t cd</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block">VÁN NÀY</span>
                <span className="text-sm font-extrabold text-slate-200 font-mono">{stats.evaderFit}</span>
              </div>
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block">KỶ LỤC</span>
                <span className="text-sm font-extrabold text-slate-300 font-mono">{stats.evaderBest}</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>Độ cao: <span className="text-slate-200 font-mono">{stats.evaderZ}m</span></span>
              <span>Thắng: <span className="text-slate-200 font-bold">{stats.evaderWins}</span></span>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-slate-500 to-slate-300 transition-all duration-200"
                style={{ width: `${Math.min(100, stats.evaderBest > 0 ? (stats.evaderFit / stats.evaderBest) * 100 : 50)}%` }} />
            </div>
          </div>

          {/* Khoảng cách */}
          <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/60 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Khoảng cách</span>
              <span className="font-mono font-bold text-[11px]"
                style={{ color: stats.dist < TAG.TAG_DIST * 2 ? '#ef4444' : stats.dist < 40 ? '#f59e0b' : '#22c55e' }}>
                {stats.dist}u
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
              <div className="h-full transition-all duration-150"
                style={{
                  width: `${Math.min(100, (1 - stats.dist / 130) * 100)}%`,
                  background: stats.dist < TAG.TAG_DIST * 2 ? 'linear-gradient(to right, #ef4444, #f87171)'
                    : stats.dist < 40 ? 'linear-gradient(to right, #f59e0b, #fbbf24)'
                    : 'linear-gradient(to right, #22c55e, #4ade80)',
                }} />
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>Trung bình: <span className="text-slate-200 font-mono">{stats.avgDist}</span></span>
              <span>Tag dist: <span className="text-amber-400">{TAG.TAG_DIST}</span></span>
            </div>
          </div>

          {/* Win rate bar */}
          <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/60 flex flex-col gap-2">
            <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">
              Thống kê ({stats.chaserWins + stats.evaderWins} ván)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-blue-400 w-8">KAI</span>
              <div className="flex-1 bg-slate-950 rounded-full h-2.5 overflow-hidden flex">
                <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                  style={{ width: `${kaiWinRate}%` }} />
              </div>
              <span className="text-[9px] text-slate-400 w-8 text-right">ALB</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-blue-400 font-bold">{kaiWinRate}%</span>
              <span className="text-slate-400 font-bold">{100 - kaiWinRate}%</span>
            </div>
          </div>

          {/* Hướng dẫn */}
          <details className="group mt-auto border border-slate-800 rounded-lg overflow-hidden bg-slate-900/20">
            <summary className="flex items-center gap-1.5 p-2 font-semibold text-white cursor-pointer select-none hover:bg-slate-900/60 list-none justify-between">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-400" /> Cách hoạt động
              </span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform text-[9px]">▼</span>
            </summary>
            <div className="p-3 leading-relaxed text-slate-400 border-t border-slate-800 flex flex-col gap-2 text-[10px]">
              <p><b className="text-blue-400">KAI (xanh)</b> = Chaser — tự học đuổi Albert. Bắt đủ <b className="text-amber-400">{TAG.MAX_TAGS} lần</b> → thắng ván.</p>
              <p><b className="text-white">ALBERT (trắng)</b> = Evader — tự học trốn Kai. Sống đủ <b className="text-amber-400">60s</b> → thắng ván.</p>
              <p>Mỗi AI có <b className="text-indigo-400">8 tia raycast</b> (mắt nhìn) phát hiện tường, hộp, và đối thủ.</p>
              <p><b className="text-purple-400">5 hộp màu</b> trong phòng là chướng ngại — AI học cách đẩy chúng để chặn/trốn.</p>
              <p>Cả hai có thể <b className="text-emerald-400">nhảy</b> (cooldown {TAG.JUMP_COOLDOWN} tick).</p>
              <p>Tiến hóa: não tốt nhất được giữ lại, não kém bị đột biến ngẫu nhiên.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
