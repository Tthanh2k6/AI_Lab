import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Crown, Cpu, Map as MapIcon, Swords } from 'lucide-react';
import { CellWarConfig } from '../types/game';
import {
  createCellWar, stepCellWar, resetCellWar, secondsLeftCellWar,
  CellWarWorld, CW, STRATEGIES,
} from '../utils/cellwar';

interface Props {
  config: CellWarConfig;
  onBack: () => void;
}

const SPEEDS = [1, 2, 4, 8, 16];

const stratName = (id: string) => STRATEGIES.find(s => s.id === id)?.name ?? id;

export default function CellWarScreen({ config, onBack }: Props) {
  const wrapRef    = useRef<HTMLDivElement | null>(null);
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const offRef     = useRef<HTMLCanvasElement | null>(null);
  const worldRef   = useRef<CellWarWorld>(createCellWar(config.numFactions, config.mapSize, config.growthRate));
  const rafRef     = useRef<number | null>(null);
  const runningRef = useRef(true);
  const speedRef   = useRef(config.speed ?? 4);
  const frameRef   = useRef(0);

  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed]   = useState(config.speed ?? 4);
  const [stats, setStats] = useState(() => snapshot(worldRef.current));

  function snapshot(w: CellWarWorld) {
    const total = w.startTiles;
    return {
      time: secondsLeftCellWar(w),
      winner: w.winner,
      factions: w.factions.map(f => ({
        id: f.id, name: f.name, color: f.colorHex, strategy: f.strategy,
        alive: f.alive, tiles: f.tiles,
        pct: total > 0 ? (f.tiles / total) * 100 : 0,
        troops: Math.round(f.troops),
      })),
    };
  }

  // Vẽ bản đồ ô (offscreen cols×rows → scale lên canvas hiển thị, pixel sắc nét)
  function draw() {
    const w = worldRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let off = offRef.current;
    if (!off || off.width !== w.cols || off.height !== w.rows) {
      off = document.createElement('canvas');
      off.width = w.cols; off.height = w.rows;
      offRef.current = off;
    }
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(w.cols, w.rows);
    const data = img.data;
    for (let i = 0; i < w.n; i++) {
      const o = w.owner[i];
      let r: number, g: number, b: number;
      if (o === 0) {
        // Trung lập — xám tối, hơi sáng theo garrison còn lại
        const t = Math.min(1, w.troops[i] / CW.NEUTRAL_DEF);
        r = 28 + t * 18; g = 33 + t * 20; b = 45 + t * 22;
      } else {
        const f = w.factions[o - 1];
        const bri = 0.42 + 0.58 * Math.min(1, w.troops[i] / CW.MAX_TROOPS);
        r = f.rgb[0] * bri; g = f.rgb[1] * bri; b = f.rgb[2] * bri;
      }
      const p = i * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
    octx.putImageData(img, 0, 0);

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, w.cols, w.rows, 0, 0, canvas.width, canvas.height);
  }

  function fitCanvas() {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const w = worldRef.current;
    const aspect = w.cols / w.rows;
    const bw = wrap.clientWidth, bh = wrap.clientHeight;
    let cw = bw, ch = bw / aspect;
    if (ch > bh) { ch = bh; cw = bh * aspect; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${Math.floor(cw)}px`;
    canvas.style.height = `${Math.floor(ch)}px`;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    draw();
  }

  useEffect(() => {
    fitCanvas();
    const loop = () => {
      const w = worldRef.current;
      if (runningRef.current && w.winner === null) {
        stepCellWar(w, speedRef.current);
      }
      draw();
      frameRef.current++;
      if (frameRef.current % 4 === 0) setStats(snapshot(w));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => fitCanvas());
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRun   = () => { runningRef.current = !runningRef.current; setIsRunning(runningRef.current); };
  const handleSpeed = (s: number) => { speedRef.current = s; setSimSpeed(s); };
  const handleReset = () => { resetCellWar(worldRef.current); runningRef.current = true; setIsRunning(true); setStats(snapshot(worldRef.current)); };

  const ranked = [...stats.factions].sort((a, b) => b.tiles - a.tiles);
  const winnerF = stats.winner ? stats.factions.find(f => f.id === stats.winner) : null;

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
              <MapIcon className="w-4 h-4 text-emerald-400" />
              CELL WAR
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-400 ml-1">CHIẾM LÃNH THỔ</span>
            </h1>
            <span className="text-[9px] text-emerald-400/60 uppercase tracking-widest font-mono block">
              {stats.factions.length} PHE • CHIẾN THUẬT ĐỐI KHÁNG • THỜI GIAN THỰC
            </span>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-1 shadow-[0_0_10px_rgba(148,163,184,0.12)]">
            <Swords className="w-3.5 h-3.5 text-slate-200" />
            <div>
              <span className="text-[8px] text-slate-300 block leading-none font-bold uppercase tracking-wide">CÒN</span>
              <span className="text-base font-extrabold text-white font-mono" style={{ textShadow: '0 0 8px rgba(255,255,255,.4)' }}>{stats.time}s</span>
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
                    simSpeed === s ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
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

      {/* Territory share bar */}
      <div className="h-2 w-full flex bg-slate-900">
        {stats.factions.map(f => (
          <div key={f.id} className="h-full transition-[width] duration-200"
            style={{ width: `${f.pct}%`, background: f.color }} />
        ))}
      </div>

      {/* Main content */}
      <div className="game-arena-container">
        {/* Canvas */}
        <div ref={wrapRef} style={{
          flex: '1 1 0', minWidth: 0, height: '100%', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(16,185,129,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7), inset 0 0 40px rgba(16,185,129,0.04)',
          background: '#0a0f1c',
        }}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', borderRadius: 6 }} />
          {winnerF && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(7,9,16,0.55)' }}>
              <div className="flex flex-col items-center gap-2 px-8 py-6 rounded-2xl border animate-fade-in"
                style={{ background: 'rgba(10,14,28,0.92)', borderColor: winnerF.color }}>
                <Crown className="w-10 h-10" style={{ color: winnerF.color }} />
                <span className="text-2xl font-extrabold font-mono" style={{ color: winnerF.color }}>{winnerF.name} THẮNG!</span>
                <span className="text-xs text-slate-300 font-mono">Chiến thuật: {stratName(winnerF.strategy)} · {winnerF.pct.toFixed(0)}% lãnh thổ</span>
                <button onClick={handleReset} className="cyber-btn cyber-btn-emerald mt-2 py-2 px-4 text-xs flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" /> CHƠI LẠI
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="glass-panel p-3 font-mono text-slate-300 scrollbar-styled game-sidebar">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> BẢNG CHIẾN
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning && !stats.winner ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[9px] text-slate-500 font-semibold">{stats.winner ? 'KẾT THÚC' : isRunning ? 'RUNNING' : 'PAUSED'}</span>
            </span>
          </div>

          {/* Faction leaderboard */}
          <div className="flex flex-col gap-2 mt-1">
            {ranked.map((f, i) => (
              <div key={f.id} className="rounded-xl p-2.5 border flex flex-col gap-1.5"
                style={{
                  background: f.alive ? `${f.color}14` : 'rgba(30,41,59,0.3)',
                  borderColor: f.alive ? `${f.color}55` : 'rgba(71,85,105,0.3)',
                  opacity: f.alive ? 1 : 0.5,
                }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: f.color }} />
                    <span className="font-bold text-white text-[12px]">{i === 0 && f.alive ? '👑 ' : ''}{f.name}</span>
                    {!f.alive && <span className="text-[8px] text-rose-400 font-bold">BỊ DIỆT</span>}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: `${f.color}22`, color: f.color }}>{stratName(f.strategy)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Lãnh thổ: <span className="font-bold" style={{ color: f.color }}>{f.pct.toFixed(1)}%</span></span>
                  <span>Quân: <span className="text-slate-200 font-bold">{f.troops}</span></span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full transition-all duration-200" style={{ width: `${f.pct}%`, background: f.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Help */}
          <details className="group mt-auto border border-slate-800 rounded-lg overflow-hidden bg-slate-900/20">
            <summary className="flex items-center gap-1.5 p-2 font-semibold text-white cursor-pointer select-none hover:bg-slate-900/60 list-none justify-between">
              <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-emerald-400" /> Cách hoạt động</span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform text-[9px]">▼</span>
            </summary>
            <div className="p-3 leading-relaxed text-slate-400 border-t border-slate-800 flex flex-col gap-2 text-[10px]">
              <p>Mỗi phe chiếm các ô, ô có chủ <b className="text-emerald-400">sinh quân</b> theo thời gian (trần {CW.MAX_TROOPS}).</p>
              <p>Ô biên giới <b className="text-white">đẩy quân</b> sang ô láng giềng để chiếm: <span className="text-amber-300">quân tấn công &gt; quân thủ</span> thì chiếm được ô.</p>
              <p>Quân nội địa tự <b className="text-emerald-400">khuếch tán</b> ra biên (dồn về tiền tuyến).</p>
              <p>Mỗi phe theo MỘT <b className="text-white">chiến thuật</b> khác nhau — xem chiến thuật nào thống trị!</p>
              <p>Phe cuối cùng còn sống → thắng. Hết giờ → phe nhiều đất nhất thắng.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
