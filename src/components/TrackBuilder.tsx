import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Save, Upload, Zap, Trash2, RotateCcw } from 'lucide-react';
import { Point } from '../types/game';
import { RacingTrack, buildTrackBoundaries } from '../utils/racingPhysics';

interface TrackBuilderProps {
  onBack: () => void;
  onLaunchCustomTrack: (track: RacingTrack) => void;
}

type Tool = 'straight' | 'curve';
type Phase = 'idle' | 'p1_set' | 'bending';

interface Segment {
  type: 'straight' | 'curve';
  p1: Point;
  p2: Point;
  cp?: Point;
}

const CW = 880;
const CH = 560;
const SNAP_R = 24;
const TRACK_W = 65;

function ptsBez(p1: Point, p2: Point, cp: Point, n: number): Point[] {
  const r: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    r.push({ x: u*u*p1.x + 2*u*t*cp.x + t*t*p2.x, y: u*u*p1.y + 2*u*t*cp.y + t*t*p2.y });
  }
  return r;
}

function ptsLin(p1: Point, p2: Point, n: number): Point[] {
  const r: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    r.push({ x: p1.x + (p2.x - p1.x)*t, y: p1.y + (p2.y - p1.y)*t });
  }
  return r;
}

function buildCL(segs: Segment[], closed: boolean): Point[] {
  if (!segs.length) return [];

  // Collect Catmull-Rom control points from segment endpoints + curve control points.
  // Using Catmull-Rom (like preset tracks) ensures smooth G1-continuous junctions
  // between all consecutive segments — no sharp kinks at connection points.
  const ctrl: Point[] = [];
  for (const seg of segs) {
    ctrl.push(seg.p1);
    if (seg.type === 'curve' && seg.cp) {
      // Blend cp toward the p1→p2 midpoint slightly to reduce overshoot
      const mid = { x: (seg.p1.x + seg.p2.x) / 2, y: (seg.p1.y + seg.p2.y) / 2 };
      ctrl.push({ x: seg.cp.x * 0.65 + mid.x * 0.35, y: seg.cp.y * 0.65 + mid.y * 0.35 });
    }
  }

  const n = ctrl.length;
  const PPS = 12;
  const path: Point[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    const isLast = i === n - 1;

    for (let s = (i === 0 ? 0 : 1); s <= (isLast && closed ? PPS - 1 : PPS); s++) {
      const t = s / PPS, t2 = t * t, t3 = t2 * t;
      path.push({
        x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
        y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
      });
    }
  }
  return path;
}

function dist(a: Point, b: Point) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

export default function TrackBuilder({ onBack, onLaunchCustomTrack }: TrackBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('straight');
  const [segs, setSegs] = useState<Segment[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [p1, setP1] = useState<Point | null>(null);
  const [p2, setP2] = useState<Point | null>(null);
  const [mouse, setMouse] = useState<Point>({ x: CW/2, y: CH/2 });
  const [closed, setClosed] = useState(false);

  const firstPt = useMemo(
    () => segs.length > 0 ? segs[0].p1 : (phase !== 'idle' ? p1 : null),
    [segs, phase, p1]
  );

  const snap = useMemo(
    () => (firstPt && segs.length >= 2 && dist(mouse, firstPt) < SNAP_R) ? firstPt : null,
    [firstPt, segs.length, mouse]
  );

  const cl = useMemo(() => buildCL(segs, closed), [segs, closed]);

  const previewW = useMemo(() => {
    if (cl.length <= 1) return 28;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of cl) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const scale = Math.min(1300 / ((maxX-minX) || 1), 850 / ((maxY-minY) || 1));
    return Math.max(6, Math.round(TRACK_W / scale));
  }, [cl]);

  const getPt = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (CW / r.width), y: (e.clientY - r.top) * (CH / r.height) };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => setMouse(getPt(e));

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (closed) return;
    const raw = getPt(e);
    const target = snap ?? raw;

    if (phase === 'idle') {
      setP1(target); setPhase('p1_set');
    } else if (phase === 'p1_set') {
      if (snap) {
        setSegs(prev => [...prev, { type: 'straight', p1: p1!, p2: target }]);
        setClosed(true); setPhase('idle'); setP1(null);
      } else if (tool === 'straight') {
        setSegs(prev => [...prev, { type: 'straight', p1: p1!, p2: target }]);
        setP1(target);
      } else {
        setP2(target); setPhase('bending');
      }
    } else if (phase === 'bending') {
      const newSeg: Segment = { type: 'curve', p1: p1!, p2: p2!, cp: mouse };
      const newSegs = [...segs, newSeg];
      setSegs(newSegs);
      if (firstPt && dist(p2!, firstPt) < SNAP_R && newSegs.length >= 2) {
        setClosed(true); setPhase('idle'); setP1(null); setP2(null);
      } else {
        setP1(p2!); setP2(null); setPhase('p1_set');
      }
    }
  };

  const handleUndo = useCallback(() => {
    if (phase === 'bending') { setPhase('p1_set'); setP2(null); return; }
    if (segs.length > 0 || closed) {
      const last = segs[segs.length - 1];
      setSegs(segs.slice(0, -1));
      setClosed(false);
      setP1(last ? last.p1 : null);
      setPhase(last ? 'p1_set' : 'idle');
    } else if (phase === 'p1_set') {
      setPhase('idle'); setP1(null);
    }
  }, [phase, segs, closed]);

  const handleClear = () => {
    setSegs([]); setPhase('idle'); setP1(null); setP2(null); setClosed(false);
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [handleUndo]);

  // ── Canvas render ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, CW, CH);

    // grid
    ctx.strokeStyle = 'rgba(148,85,247,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CH); ctx.stroke(); }
    for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CW,y); ctx.stroke(); }

    // ── Finalized track ──
    if (cl.length > 1) {
      // road body
      ctx.strokeStyle = '#0c2030'; ctx.lineWidth = previewW + 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); cl.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      if (closed) ctx.closePath(); ctx.stroke();

      ctx.strokeStyle = '#163650'; ctx.lineWidth = previewW;
      ctx.beginPath(); cl.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      if (closed) ctx.closePath(); ctx.stroke();

      // center dashes
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5; ctx.setLineDash([8,14]);
      ctx.beginPath(); cl.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      if (closed) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);

      // walls only when closed (expensive)
      if (closed) {
        const { leftWall, rightWall, checkpoints } = buildTrackBoundaries(cl, previewW, true);
        ctx.strokeStyle = 'rgba(168,85,247,0.8)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); leftWall.forEach(s => { ctx.moveTo(s.p1.x,s.p1.y); ctx.lineTo(s.p2.x,s.p2.y); }); ctx.stroke();
        ctx.strokeStyle = 'rgba(236,72,153,0.8)';
        ctx.beginPath(); rightWall.forEach(s => { ctx.moveTo(s.p1.x,s.p1.y); ctx.lineTo(s.p2.x,s.p2.y); }); ctx.stroke();
        if (checkpoints.length > 0) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([5,5]);
          ctx.beginPath(); ctx.moveTo(checkpoints[0].p1.x, checkpoints[0].p1.y); ctx.lineTo(checkpoints[0].p2.x, checkpoints[0].p2.y);
          ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }

    // ── Preview segment ──
    if (!closed && p1 && phase !== 'idle') {
      const endPt = snap ?? mouse;

      if (phase === 'p1_set') {
        ctx.strokeStyle = tool === 'straight' ? 'rgba(6,182,212,0.6)' : 'rgba(251,191,36,0.6)';
        ctx.lineWidth = 2; ctx.setLineDash([6,7]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(endPt.x, endPt.y);
        ctx.stroke(); ctx.setLineDash([]);
      } else if (phase === 'bending' && p2) {
        // live bezier with mouse as control point
        const bezPts = ptsBez(p1, p2, mouse, 32);
        ctx.strokeStyle = 'rgba(251,191,36,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
        ctx.beginPath(); bezPts.forEach((pt,i) => i===0 ? ctx.moveTo(pt.x,pt.y) : ctx.lineTo(pt.x,pt.y)); ctx.stroke();
        // control handle line
        const mid = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
        ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3,4]);
        ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); ctx.setLineDash([]);
        // control point dot
        ctx.fillStyle = 'rgba(251,191,36,0.9)';
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 5, 0, Math.PI*2); ctx.fill();
        // p2 ring
        ctx.strokeStyle = 'rgba(251,191,36,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p2.x, p2.y, 5, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ── Anchor dots on finalized segments ──
    segs.forEach((s, i) => {
      const isFirst = i === 0;
      ctx.fillStyle = isFirst ? '#22d3ee' : 'rgba(100,160,220,0.55)';
      ctx.beginPath(); ctx.arc(s.p1.x, s.p1.y, isFirst ? 6 : 4, 0, Math.PI*2); ctx.fill();
    });
    // current p1 cursor
    if (p1 && !closed) {
      ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p1.x, p1.y, 6, 0, Math.PI*2); ctx.stroke();
    }

    // ── Snap ring ──
    if (snap) {
      ctx.strokeStyle = 'rgba(34,211,238,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(snap.x, snap.y, SNAP_R, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = 'rgba(34,211,238,0.1)'; ctx.fill();
      ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('ĐÓNG VÒNG', snap.x, snap.y - SNAP_R - 6);
    }

  }, [cl, segs, phase, p1, p2, mouse, closed, snap, tool, previewW]);

  // ── Build global RacingTrack ──
  const buildGlobal = (): RacingTrack => {
    const localCL = buildCL(segs, true);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of localCL) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const scale = Math.min(1300/((maxX-minX)||1), 850/((maxY-minY)||1));
    const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
    const globalCL = localCL.map(p => ({ x: 1100+(p.x-cx)*scale, y: 900+(p.y-cy)*scale }));
    const { leftWall, rightWall, checkpoints } = buildTrackBoundaries(globalCL, TRACK_W, true);
    return {
      id: 'custom', name: 'Đường Đua Tự Thiết Kế',
      centerLine: globalCL, leftWall, rightWall, checkpoints,
      startPoint: globalCL[0],
      startAngle: Math.atan2(globalCL[1].y - globalCL[0].y, globalCL[1].x - globalCL[0].x),
      width: TRACK_W,
    };
  };

  const handleSave = () => {
    if (!closed) return;
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(buildGlobal(), null, 2));
    a.download = 'custom_track.json'; document.body.appendChild(a); a.click(); a.remove();
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target?.result as string) as RacingTrack;
        if (!Array.isArray(parsed.centerLine) || parsed.centerLine.length < 4) return;
        const pts = parsed.centerLine;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        const scale = Math.min(720/((maxX-minX)||1), 450/((maxY-minY)||1));
        const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
        const local = pts.map(p => ({ x: CW/2+(p.x-cx)*scale, y: CH/2+(p.y-cy)*scale }));
        const STEP = Math.max(1, Math.floor(local.length / 36));
        const sampled: Point[] = [];
        for (let i = 0; i < local.length; i += STEP) sampled.push(local[i]);
        setSegs(sampled.map((pt, i) => ({
          type: 'straight' as const, p1: pt, p2: sampled[(i+1) % sampled.length]
        })));
        setPhase('idle'); setP1(null); setP2(null); setClosed(true);
      } catch { /* ignore malformed files */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const statusMsg = closed
    ? '✓ Đường đua đã đóng vòng — sẵn sàng khởi động'
    : phase === 'bending'
      ? '⟳ Di chuyển chuột để uốn cong • Click để xác nhận'
      : phase === 'p1_set'
        ? tool === 'straight'
          ? '→ Click để đặt điểm tiếp theo • Đến gần điểm đầu để đóng vòng'
          : '→ Click để đặt điểm cuối • Rồi di chuột để uốn cong'
        : '⊕ Click trên canvas để bắt đầu vẽ đường đua';

  const toolBtn = (t: Tool, svg: React.ReactNode, label: string) => (
    <button
      onClick={() => { if (!closed) setTool(t); }}
      disabled={closed}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
        tool === t && !closed
          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
          : 'bg-transparent text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed'
      }`}
    >
      {svg}<span>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col w-full gap-3" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-mono bg-transparent border-none cursor-pointer transition-colors">
          <ArrowLeft className="w-4 h-4" />QUAY LẠI
        </button>
        <span className="text-[10px] font-mono tracking-widest text-slate-600 uppercase">Track Designer</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800/60 shrink-0 flex-wrap">
        <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mr-1 hidden sm:inline">Nét vẽ</span>

        {toolBtn('straight',
          <svg width="14" height="14" viewBox="0 0 14 14">
            <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>,
          'Thẳng'
        )}
        {toolBtn('curve',
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M2 11 C5 2, 9 2, 12 11" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          </svg>,
          'Cong'
        )}

        <div className="w-px h-5 bg-slate-700/60 mx-0.5" />

        <button onClick={handleUndo} title="Ctrl+Z"
          disabled={segs.length === 0 && phase === 'idle' && !closed}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 border border-slate-700/50 hover:text-white hover:border-slate-500 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />Undo
        </button>
        <button onClick={handleClear}
          disabled={segs.length === 0 && phase === 'idle'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 border border-slate-700/50 hover:text-red-400 hover:border-red-500/40 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <Trash2 className="w-3.5 h-3.5" />Xóa
        </button>

        <div className="w-px h-5 bg-slate-700/60 mx-0.5" />

        <button onClick={handleSave} disabled={!closed}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 border border-slate-700/50 hover:text-white hover:border-slate-500 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <Save className="w-3.5 h-3.5" />Lưu
        </button>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 border border-slate-700/50 hover:text-white hover:border-slate-500 cursor-pointer transition-colors">
          <Upload className="w-3.5 h-3.5" />Nạp
          <input type="file" accept=".json" onChange={handleLoad} className="hidden" />
        </label>

        <div className="flex-1" />

        <span className="text-[10px] font-mono text-slate-600">{segs.length} đoạn</span>

        <button onClick={() => closed && onLaunchCustomTrack(buildGlobal())} disabled={!closed}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
            closed
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 hover:bg-purple-500/35 cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.2)]'
              : 'opacity-25 cursor-not-allowed text-slate-500 border-slate-700/50 bg-transparent'
          }`}>
          <Zap className="w-3.5 h-3.5" />ĐUA NGAY
        </button>
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800/50 bg-slate-950 flex-1" style={{ minHeight: 420 }}>
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          className="w-full h-full block"
          style={{ cursor: closed ? 'default' : 'crosshair', touchAction: 'none' }}
        />
        {/* Status bar */}
        <div className="absolute bottom-0 inset-x-0 px-4 py-1.5 bg-slate-950/85 border-t border-slate-800/40 backdrop-blur-sm flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-400">{statusMsg}</span>
          {phase === 'bending' && (
            <span className="text-[10px] font-mono text-amber-500/70">Nét cong — đang uốn</span>
          )}
          {!closed && phase !== 'idle' && segs.length >= 2 && (
            <span className="text-[10px] font-mono text-cyan-600/70">Đến gần điểm đầu để đóng vòng</span>
          )}
        </div>
      </div>
    </div>
  );
}
