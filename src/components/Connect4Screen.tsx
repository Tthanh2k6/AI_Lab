import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Gamepad2, Cpu, Trophy } from 'lucide-react';
import { Connect4Config } from '../types/game';
import { newBoard, dropRow, findWin, isFull, validCols, columnScores, bestColFromScores, COLS, ROWS, Board } from '../utils/connect4';
import { drawConnect4, landingY, colFromX } from '../utils/renderConnect4';

interface Props {
  config: Connect4Config;
  onBack: () => void;
}

type Falling = { col: number; player: number; y: number; vy: number; targetY: number; row: number } | null;

const SPEED_DELAY: Record<number, number> = { 1: 60, 2: 32, 4: 14, 8: 5 };

export default function Connect4Screen({ config, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState(440);

  const boardRef = useRef<Board>(newBoard());
  const playerRef = useRef(1);
  const statusRef = useRef<'play' | 'over'>('play');
  const winRef = useRef<[number, number][] | null>(null);
  const winnerRef = useRef(0); // 0 hòa/đang chơi, 1 đỏ, 2 vàng
  const fallingRef = useRef<Falling>(null);
  const moveAccumRef = useRef(0);
  const overAccumRef = useRef(0);
  const hoverColRef = useRef<number>(-1);

  const playerModeRef = useRef(false);
  const runningRef = useRef(true);
  const speedRef = useRef(config.speed || 2);
  const depthRef = useRef(config.depth || 6);

  const [playerMode, setPlayerMode] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(config.speed || 2);
  const [tally, setTally] = useState({ red: 0, yellow: 0, draw: 0 });
  const [statusText, setStatusText] = useState('');
  const [colScores, setColScores] = useState<(number | null)[]>(new Array(COLS).fill(null));

  useEffect(() => {
    const measure = () => setSize(Math.max(280, Math.min(520, Math.floor(window.innerHeight * 0.6))));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const reset = () => {
    boardRef.current = newBoard();
    playerRef.current = 1;
    statusRef.current = 'play';
    winRef.current = null;
    winnerRef.current = 0;
    fallingRef.current = null;
    moveAccumRef.current = 0;
    overAccumRef.current = 0;
    setStatusText('');
  };

  const startMove = (col: number) => {
    const board = boardRef.current;
    const row = dropRow(board, col);
    if (row < 0) return;
    const cell = size / COLS;
    fallingRef.current = { col, player: playerRef.current, y: cell / 2, vy: cell * 0.08, targetY: landingY(size, row), row };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    const loop = () => {
      const cell = size / COLS;
      const grav = cell * 0.05;
      const f = fallingRef.current;

      if (f) {
        f.vy += grav;
        f.y += f.vy;
        if (f.y >= f.targetY) {
          boardRef.current[f.row][f.col] = f.player;
          const placed = f.player;
          fallingRef.current = null;
          const w = findWin(boardRef.current);
          if (w) {
            statusRef.current = 'over'; winRef.current = w.cells; winnerRef.current = w.player;
            setTally(t => ({ ...t, red: t.red + (w.player === 1 ? 1 : 0), yellow: t.yellow + (w.player === 2 ? 1 : 0) }));
            setStatusText(w.player === 1 ? '🔴 ĐỎ THẮNG!' : '🟡 VÀNG THẮNG!');
            overAccumRef.current = 0;
          } else if (isFull(boardRef.current)) {
            statusRef.current = 'over'; winRef.current = null; winnerRef.current = 0;
            setTally(t => ({ ...t, draw: t.draw + 1 }));
            setStatusText('HÒA!');
            overAccumRef.current = 0;
          } else {
            playerRef.current = placed === 1 ? 2 : 1;
          }
        }
      } else if (statusRef.current === 'play') {
        const isAITurn = playerModeRef.current ? playerRef.current === 2 : true;
        const allowed = playerModeRef.current ? true : runningRef.current; // máy-đấu-máy theo nút CHẠY; AI luôn đáp khi tự chơi
        if (isAITurn && allowed) {
          if (moveAccumRef.current > 0) moveAccumRef.current--;
          else {
            if (validCols(boardRef.current).length) {
              const sc = columnScores(boardRef.current, playerRef.current, depthRef.current);
              setColScores(sc);
              const col = bestColFromScores(sc);
              if (col >= 0) startMove(col);
            }
            moveAccumRef.current = playerModeRef.current ? 18 : SPEED_DELAY[speedRef.current];
          }
        }
      } else {
        // over
        if (!playerModeRef.current && runningRef.current) {
          if (overAccumRef.current < 120) overAccumRef.current++;
          else reset();
        }
      }

      const hover = playerModeRef.current && statusRef.current === 'play' && playerRef.current === 1 && !fallingRef.current
        ? hoverColRef.current : -1;
      drawConnect4(ctx, boardRef.current, size, {
        falling: fallingRef.current ? { col: fallingRef.current.col, player: fallingRef.current.player, y: fallingRef.current.y } : null,
        winCells: winRef.current,
        hoverCol: hover,
        hoverPlayer: 1,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!playerModeRef.current) return;
    if (statusRef.current !== 'play' || playerRef.current !== 1 || fallingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (size / rect.width);
    const col = colFromX(size, x);
    if (col >= 0 && dropRow(boardRef.current, col) >= 0) startMove(col);
  };

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (size / rect.width);
    hoverColRef.current = colFromX(size, x);
  };

  const toggleRun = () => { runningRef.current = !runningRef.current; setIsRunning(runningRef.current); };
  const handleSpeed = (s: number) => { speedRef.current = s; setSimSpeed(s); };
  const togglePlayer = () => {
    const on = !playerModeRef.current;
    playerModeRef.current = on;
    setPlayerMode(on);
    setTally({ red: 0, yellow: 0, draw: 0 });
    reset();
  };

  const cell = size / COLS;
  const canvasH = (ROWS + 1) * cell;

  return (
    <div className="arena-container flex flex-col h-screen w-full">
      <header className="arena-header flex items-center justify-between p-4 glass-panel border-b border-slate-800/50 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-2 px-3 text-xs flex gap-2">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-xl font-bold font-mono text-white tracking-wider flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-red-400" /> CONNECT FOUR
            </h1>
            <span className="text-[10px] text-red-400/70 uppercase tracking-widest font-mono">
              MINIMAX + ALPHA-BETA · CỜ THẢ 4 QUÂN
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-red-500/10">
            <Trophy className="w-3.5 h-3.5 text-red-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">{playerMode ? 'BẠN (ĐỎ)' : 'ĐỎ THẮNG'}</span>
              <span className="text-xs font-bold text-red-400 font-mono">{tally.red}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-amber-500/10">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">{playerMode ? 'MÁY (VÀNG)' : 'VÀNG THẮNG'}</span>
              <span className="text-xs font-bold text-amber-400 font-mono">{tally.yellow}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-slate-500/10">
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">HÒA</span>
              <span className="text-xs font-bold text-slate-300 font-mono">{tally.draw}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!playerMode && (
            <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-lg p-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold pl-1.5">TỐC ĐỘ:</span>
              <div className="flex gap-0.5">
                {[1, 2, 4, 8].map(s => (
                  <button
                    key={s}
                    onClick={() => handleSpeed(s)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                      simSpeed === s ? 'bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={togglePlayer}
            className={`cyber-btn py-2 px-3 flex items-center gap-1.5 text-xs font-bold ${
              playerMode ? 'cyber-btn-emerald shadow-[0_0_12px_rgba(34,211,238,0.4)]' : 'cyber-btn-outline text-cyan-300 border-cyan-900/50 hover:bg-cyan-900/20'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" /> {playerMode ? 'ĐANG TỰ CHƠI' : 'TỰ CHƠI'}
          </button>
          <button onClick={reset} className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-amber-400 border-amber-900/50 hover:bg-amber-900/20">
            <RefreshCw className="w-3.5 h-3.5" /> VÁN MỚI
          </button>
          {!playerMode && (
            <button
              onClick={toggleRun}
              className={`cyber-btn py-2 px-3.5 flex items-center gap-1.5 text-xs ${isRunning ? 'cyber-btn-outline text-rose-400 border-rose-900/50 hover:bg-rose-900/20' : 'cyber-btn-emerald'}`}
            >
              {isRunning ? <><Square className="w-3.5 h-3.5" /> DỪNG</> : <><Play className="w-3.5 h-3.5" /> CHẠY</>}
            </button>
          )}
        </div>
      </header>

      <div className="flex-grow flex items-center justify-center gap-6 p-4 overflow-hidden">
        <C4ThinkPanel scores={colScores} />
        <div className="flex flex-col items-center justify-center gap-3">
        <div className="text-sm font-mono font-bold h-5 text-white">
          {statusText || (playerMode ? 'Bạn cầm quân ĐỎ — bấm vào cột để thả' : 'Máy đấu máy (Minimax)')}
        </div>
        <canvas
          ref={canvasRef}
          width={size}
          height={canvasH}
          onClick={onCanvasClick}
          onMouseMove={onCanvasMove}
          className={`rounded-xl border border-slate-700/50 shadow-2xl ${playerMode ? 'cursor-pointer' : ''}`}
          style={{ width: size, height: canvasH, background: '#0b1220' }}
        />
        {statusRef.current === 'over' && playerMode && (
          <button onClick={reset} className="cyber-btn cyber-btn-emerald py-2 px-5 text-xs flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> VÁN MỚI
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

// Panel "AI đang nghĩ": điểm Minimax của từng cột
function C4ThinkPanel({ scores }: { scores: (number | null)[] }) {
  const valid = scores.filter((v): v is number => v != null);
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 1;
  const span = max - min || 1;
  let bestC = -1, bv = -Infinity;
  scores.forEach((v, c) => { if (v != null && v > bv) { bv = v; bestC = c; } });
  return (
    <div className="hidden lg:flex flex-col gap-3 glass-panel p-4 w-60 shrink-0">
      <span className="text-sm font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
        <Cpu className="w-4 h-4" /> AI Đang Nghĩ
      </span>
      <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
        Điểm <span className="text-white">Minimax</span> của mỗi cột (cao = lợi cho AI). Cột AI chọn được tô đỏ.
      </p>
      <div className="flex flex-col gap-1.5 mt-1">
        {scores.map((v, c) => {
          const t = v == null ? 0 : (v - min) / span;
          const chosen = c === bestC;
          return (
            <div key={c} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-500 w-4">{c + 1}</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${v == null ? 0 : 8 + t * 92}%`, background: chosen ? '#ef4444' : '#64748b' }} />
              </div>
              <span className="text-[9px] font-mono text-slate-500 w-10 text-right">{v == null ? '✕' : (Math.abs(v) >= 100000 ? (v > 0 ? 'WIN' : 'LOSE') : Math.round(v))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
