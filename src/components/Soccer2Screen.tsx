import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Trophy, Activity, Timer, Cpu } from 'lucide-react';
import { Soccer2Config } from '../types/game';
import { createWorld2, stepWorld2, resetWorld2, secondsLeft2, Soccer2World, SOCCER2 } from '../utils/soccer2';
import { Soccer2Renderer } from '../utils/renderSoccer2';

interface Props {
  config: Soccer2Config;
  onBack: () => void;
}

const SPEEDS = [1, 2, 4, 8, 50, 100];

export default function Soccer2Screen({ config, onBack }: Props) {
  const wrapRef    = useRef<HTMLDivElement | null>(null);
  const worldRef   = useRef<Soccer2World>(createWorld2());
  const rendererRef = useRef<Soccer2Renderer | null>(null);
  const rafRef     = useRef<number | null>(null);
  const runningRef = useRef(true);
  const speedRef   = useRef(config.speed || 2);
  const mutationRef = useRef(config.mutationRate || 0.1);
  const frameRef   = useRef(0);

  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed,  setSimSpeed]  = useState(config.speed || 2);
  const [stats, setStats] = useState({
    generation: 1, time: secondsLeft2(worldRef.current),
    scoreOrange: 0, scoreBlue: 0,
    fitO: 0, fitB: 0,   // best fitness (kỷ lục)
    curO: 0, curB: 0,   // fitness ván hiện tại
    orangeKickCd: 0,
    orangeJumpCd: 0,
    orangeZ: 0,
    orangeJumpIntent: false,
    orangeKickIntent: false,
    blueKickCd: 0,
    blueJumpCd: 0,
    blueZ: 0,
    blueJumpIntent: false,
    blueKickIntent: false,
    lastTouched: null as 'orange' | 'blue' | null,
    ballZ: 0,
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cw = wrap.clientWidth  || 960;
    const ch = wrap.clientHeight || 600;
    const renderer = new Soccer2Renderer(wrap, cw, ch);
    rendererRef.current = renderer;

    const loop = () => {
      const w = worldRef.current;
      if (runningRef.current) {
        const steps = speedRef.current;
        for (let i = 0; i < steps; i++) stepWorld2(w, mutationRef.current, steps);
      }
      renderer.render(w);
      frameRef.current++;
      if (frameRef.current % 4 === 0) {
        setStats({
          generation: w.generation,
          time: secondsLeft2(w),
          scoreOrange: w.scoreOrange,
          scoreBlue: w.scoreBlue,
          fitO: Math.round(w.orange.bestFitness === -Infinity ? 0 : w.orange.bestFitness),
          fitB: Math.round(w.blue.bestFitness   === -Infinity ? 0 : w.blue.bestFitness),
          curO: Math.round(w.orange.fitness),
          curB: Math.round(w.blue.fitness),
          orangeKickCd: w.orange.kickCooldown,
          orangeJumpCd: w.orange.jumpCooldown,
          orangeZ: w.orange.z,
          orangeJumpIntent: w.orange.jumpIntent,
          orangeKickIntent: w.orange.kickIntent,
          blueKickCd: w.blue.kickCooldown,
          blueJumpCd: w.blue.jumpCooldown,
          blueZ: w.blue.z,
          blueJumpIntent: w.blue.jumpIntent,
          blueKickIntent: w.blue.kickIntent,
          lastTouched: w.lastTouched,
          ballZ: w.ball.z,
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

  const toggleRun  = () => { runningRef.current = !runningRef.current; setIsRunning(runningRef.current); };
  const handleSpeed = (s: number) => { speedRef.current = s; setSimSpeed(s); };
  const resetBrains = () => { resetWorld2(worldRef.current); };

  const timePct = (stats.time / Math.ceil(SOCCER2.MATCH_TICKS / 60)) * 100;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-slate-950">
      <header className="flex items-center justify-between px-6 py-2.5 bg-slate-950/80 backdrop-blur border-b border-slate-800 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-1.5 px-3 text-xs flex gap-2">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-lg font-bold font-mono text-white tracking-wider flex items-center gap-2 leading-tight">
              <Trophy className="w-4 h-4 text-violet-400" /> ĐẤU TRƯỜNG BÓNG ĐÁ AI V2
            </h1>
            <span className="text-[9px] text-violet-400/70 uppercase tracking-widest font-mono block">
              DẪN BÓNG • SÚT THẲNG • VA CHẠM CỨNG • NHẢY CAO
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-4 py-1.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
            <span className="text-2xl font-extrabold font-mono" style={{ color: '#ff7a18', textShadow: '0 0 12px rgba(255,122,24,.5)' }}>{stats.scoreOrange}</span>
            <span className="text-slate-600 font-bold">:</span>
            <span className="text-2xl font-extrabold font-mono" style={{ color: '#2f86ff', textShadow: '0 0 12px rgba(47,134,255,.5)' }}>{stats.scoreBlue}</span>
          </div>
          <div className="stat-pill bg-slate-900/60 border border-slate-800 px-3 py-1 flex items-center gap-2 rounded-lg">
            <Timer className="w-3.5 h-3.5 text-slate-300" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">CÒN LẠI</span>
              <span className="text-sm font-bold text-white font-mono">{stats.time}s</span>
            </div>
          </div>
          <div className="stat-pill bg-slate-900/60 border border-slate-800 px-3 py-1 flex items-center gap-2 rounded-lg">
            <Activity className="w-3.5 h-3.5 text-violet-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">THẾ HỆ</span>
              <span className="text-sm font-bold text-violet-400 font-mono">{stats.generation}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold pl-1.5">TUA:</span>
            <div className="flex gap-0.5">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSpeed(s)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                    simSpeed === s ? 'bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {`${s}×`}
                </button>
              ))}
            </div>
          </div>
          <button onClick={resetBrains} className="cyber-btn cyber-btn-outline py-1.5 px-2.5 flex items-center gap-1.5 text-xs text-rose-400 border-rose-900/50 hover:bg-rose-900/20">
            <RefreshCw className="w-3.5 h-3.5" /> HỌC LẠI
          </button>
          <button
            onClick={toggleRun}
            className={`cyber-btn py-1.5 px-3.5 flex items-center gap-1.5 text-xs ${isRunning ? 'cyber-btn-outline text-rose-400 border-rose-900/50 hover:bg-rose-900/20' : 'cyber-btn-emerald'}`}
          >
            {isRunning ? <><Square className="w-3.5 h-3.5" /> DỪNG</> : <><Play className="w-3.5 h-3.5" /> CHẠY</>}
          </button>
        </div>
      </header>

      {/* Thanh thời gian */}
      <div className="h-1 w-full bg-slate-900">
        <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width] duration-200" style={{ width: `${timePct}%` }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: 12, height: 'calc(100vh - 90px)', overflow: 'hidden', backgroundColor: '#06070d' }}>
        {/* Sân 3D */}
        <div
          ref={wrapRef}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            height: '100%',
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            background: '#f0f4f8',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}
        />

        {/* Bảng thông tin */}
        <div
          className="glass-panel p-3 font-mono text-slate-300 scrollbar-styled"
          style={{ width: 280, flexShrink: 0, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11 }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-violet-400" /> BẢNG THÔNG SỐ AI
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[9px] text-slate-500 font-semibold">{isRunning ? 'RUNNING' : 'PAUSED'}</span>
            </span>
          </div>

          {/* Card Đội Cam (AI 1) */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-orange-500/20 flex flex-col gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-4 rounded bg-[#ff7a18] block" />
                <span className="font-bold text-white text-[12px] tracking-wide">AI CAM (Đội 1)</span>
              </div>
              <span className="text-[10px] text-orange-400/80 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded">FITNESS</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block leading-none">VÁN NÀY</span>
                <span className="text-sm font-extrabold text-orange-400 font-mono">{stats.curO}</span>
              </div>
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block leading-none">KỶ LỤC</span>
                <span className="text-sm font-extrabold text-slate-300 font-mono">{stats.fitO}</span>
              </div>
            </div>

            {/* Cooldown sút */}
            <div className="flex flex-col gap-1 mt-1 text-[10px]">
              <div className="flex justify-between items-center text-slate-400">
                <span>Kỹ năng Sút:</span>
                {stats.orangeKickCd === 0 ? (
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded text-[9px] animate-pulse">SẴN SÀNG</span>
                ) : (
                  <span className="text-slate-500 font-semibold">{stats.orangeKickCd} tick</span>
                )}
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-100"
                  style={{ width: `${stats.orangeKickCd === 0 ? 100 : ((35 - stats.orangeKickCd) / 35) * 100}%`, opacity: stats.orangeKickCd === 0 ? 0.3 : 1 }}
                />
              </div>
            </div>

            {/* Cooldown nhảy */}
            <div className="flex flex-col gap-1 text-[10px]">
              <div className="flex justify-between items-center text-slate-400">
                <span>Nhảy cao:</span>
                {stats.orangeZ > 0.05 ? (
                  <span className="text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.2 rounded text-[9px]">ĐANG BAY ({stats.orangeZ.toFixed(1)}m)</span>
                ) : stats.orangeJumpCd === 0 ? (
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded text-[9px] animate-pulse">SẴN SÀNG</span>
                ) : (
                  <span className="text-slate-500 font-semibold">Chờ {stats.orangeJumpCd} tick</span>
                )}
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-100"
                  style={{
                    width: stats.orangeZ > 0.05 ? '100%' : stats.orangeJumpCd === 0 ? 100 : ((90 - stats.orangeJumpCd) / 90) * 100 + '%',
                    opacity: stats.orangeJumpCd === 0 && stats.orangeZ <= 0.05 ? 0.3 : 1
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card Đội Xanh (AI 2) */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-blue-500/20 flex flex-col gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-4 rounded bg-[#2f86ff] block" />
                <span className="font-bold text-white text-[12px] tracking-wide">AI XANH (Đội 2)</span>
              </div>
              <span className="text-[10px] text-blue-400/80 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded">FITNESS</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block leading-none">VÁN NÀY</span>
                <span className="text-sm font-extrabold text-blue-400 font-mono">{stats.curB}</span>
              </div>
              <div className="bg-slate-950/40 rounded p-1.5 border border-slate-800/40">
                <span className="text-[8px] text-slate-500 block leading-none">KỶ LỤC</span>
                <span className="text-sm font-extrabold text-slate-300 font-mono">{stats.fitB}</span>
              </div>
            </div>

            {/* Cooldown sút */}
            <div className="flex flex-col gap-1 mt-1 text-[10px]">
              <div className="flex justify-between items-center text-slate-400">
                <span>Kỹ năng Sút:</span>
                {stats.blueKickCd === 0 ? (
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded text-[9px] animate-pulse">SẴN SÀNG</span>
                ) : (
                  <span className="text-slate-500 font-semibold">{stats.blueKickCd} tick</span>
                )}
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-100"
                  style={{ width: `${stats.blueKickCd === 0 ? 100 : ((35 - stats.blueKickCd) / 35) * 100}%`, opacity: stats.blueKickCd === 0 ? 0.3 : 1 }}
                />
              </div>
            </div>

            {/* Cooldown nhảy */}
            <div className="flex flex-col gap-1 text-[10px]">
              <div className="flex justify-between items-center text-slate-400">
                <span>Nhảy cao:</span>
                {stats.blueZ > 0.05 ? (
                  <span className="text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.2 rounded text-[9px]">ĐANG BAY ({stats.blueZ.toFixed(1)}m)</span>
                ) : stats.blueJumpCd === 0 ? (
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded text-[9px] animate-pulse">SẴN SÀNG</span>
                ) : (
                  <span className="text-slate-500 font-semibold">Chờ {stats.blueJumpCd} tick</span>
                )}
              </div>
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-100"
                  style={{
                    width: stats.blueZ > 0.05 ? '100%' : stats.blueJumpCd === 0 ? 100 : ((90 - stats.blueJumpCd) / 90) * 100 + '%',
                    opacity: stats.blueJumpCd === 0 && stats.blueZ <= 0.05 ? 0.3 : 1
                  }}
                />
              </div>
            </div>
          </div>

          {/* Thông số trận đấu */}
          <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/60 flex flex-col gap-2">
            <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Thông số trận đấu</span>
            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Chạm bóng cuối:</span>
              {stats.lastTouched ? (
                <span
                  className="font-bold px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: stats.lastTouched === 'orange' ? 'rgba(255, 122, 24, 0.2)' : 'rgba(47, 134, 255, 0.2)', color: stats.lastTouched === 'orange' ? '#ff7a18' : '#2f86ff' }}
                >
                  {stats.lastTouched === 'orange' ? 'CAM' : 'XANH'}
                </span>
              ) : (
                <span className="text-slate-600 font-semibold">CHƯA AI CHẠM</span>
              )}
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Độ cao quả bóng:</span>
              <span className="font-mono text-white font-bold">{stats.ballZ.toFixed(1)}m</span>
            </div>
          </div>

          {/* Hướng dẫn cách chơi */}
          <details className="group mt-auto border border-slate-800 rounded-lg overflow-hidden bg-slate-900/20">
            <summary className="flex items-center gap-1.5 p-2 font-semibold text-white cursor-pointer select-none hover:bg-slate-900/60 list-none justify-between">
              <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-violet-400" /> Cách hoạt động v2</span>
              <span className="text-slate-500 group-open:rotate-180 transition-transform font-mono text-[9px]">▼</span>
            </summary>
            <div className="p-3 leading-relaxed text-slate-400 border-t border-slate-800 flex flex-col gap-2 text-[10px]">
              <p>Khi bóng <b className="text-white">phía trước mặt</b>, cầu thủ tự động <b className="text-green-400">dẫn bóng</b> — bóng chạy cùng tốc độ, hào quang sáng lên.</p>
              <p>Output thứ 3 của mạng = <b className="text-white">lệnh sút</b>. Bóng sát sàn → sút phẳng. Bóng đang nảy → sút <b className="text-white">bổng</b> (cooldown 35 ticks).</p>
              <p>Output thứ 4 của mạng = <b className="text-white">nhảy</b>. Cản bóng bổng. Cooldown 90 ticks tính từ lúc chạm đất.</p>
              <p>Hai cầu thủ <b className="text-white">va chạm cứng</b>: vận tốc phản chiếu, không đi xuyên nhau.</p>
              <p>Phạt <b className="text-rose-400">−30</b> khi hết giờ chưa ghi bàn. Phạt <b className="text-rose-400">−120</b> khi phản lưới. Thưởng thêm khi ghi bàn <b className="text-yellow-300">sớm</b>.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
