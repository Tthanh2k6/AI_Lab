import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, RefreshCw, Hash, Trophy, Gamepad2, Cpu } from 'lucide-react';
import { Game2048Config } from '../types/game';
import Board2048 from './Board2048';
import { newGame, planMove, spawnTile, movesAvailable, moveScores, bestDirFromScores, DirScores, Tile, Dir } from '../utils/game2048';

interface Props {
  config: Game2048Config;
  onBack: () => void;
}

const TICK = 40;
const stepFor = (s: number) => Math.max(110, Math.round(360 / s)); // ms giữa các nước
const animFor = (s: number) => Math.min(110, Math.max(60, stepFor(s) - 40));

// Panel hiển thị "AI đang nghĩ": điểm Expectimax của 4 hướng
function AIThinkPanel({ scores }: { scores: DirScores }) {
  const entries: { dir: Dir; label: string; v: number | null }[] = [
    { dir: 'up', label: '↑ Lên', v: scores.up },
    { dir: 'down', label: '↓ Xuống', v: scores.down },
    { dir: 'left', label: '← Trái', v: scores.left },
    { dir: 'right', label: '→ Phải', v: scores.right },
  ];
  const valid = entries.map(e => e.v).filter((v): v is number => v != null);
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 1;
  const span = max - min || 1;
  const best = bestDirFromScores(scores);
  return (
    <div className="hidden lg:flex flex-col gap-3 glass-panel p-4 w-64 shrink-0">
      <span className="text-sm font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
        <Cpu className="w-4 h-4" /> AI Đang Nghĩ
      </span>
      <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
        Điểm <span className="text-white">Expectimax</span> của mỗi hướng (càng cao càng tốt). Hướng AI chọn được tô cam.
      </p>
      <div className="flex flex-col gap-2 mt-1">
        {entries.map(e => {
          const t = e.v == null ? 0 : (e.v - min) / span;
          const chosen = e.dir === best && e.v != null;
          return (
            <div key={e.dir} className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[10px] font-mono">
                <span className={chosen ? 'text-orange-300 font-bold' : 'text-slate-400'}>{e.label}{chosen ? ' ✓' : ''}</span>
                <span className="text-slate-500">{e.v == null ? '✕' : Math.round(e.v)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${e.v == null ? 0 : 8 + t * 92}%`, background: chosen ? '#f97316' : '#64748b' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Game2048Screen({ config, onBack }: Props) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [hud, setHud] = useState({ score: 0, best: 0, max: 0 });
  const [isRunning, setIsRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState(config.speed || 2);
  const [playerMode, setPlayerMode] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [aiScores, setAiScores] = useState<DirScores>({ up: null, down: null, left: null, right: null });

  const tilesRef = useRef<Tile[]>([]);
  const busyRef = useRef(false);
  const runningRef = useRef(true);
  const playerModeRef = useRef(false);
  const gameOverRef = useRef(false);
  const speedRef = useRef(config.speed || 2);
  const scoreRef = useRef(0);
  const bestRef = useRef(0);
  const sinceRef = useRef(0);

  const [boardSize, setBoardSize] = useState(480);

  const restart = () => {
    tilesRef.current = newGame();
    scoreRef.current = 0;
    gameOverRef.current = false;
    busyRef.current = false;
    sinceRef.current = 0;
    setGameOver(false);
    setTiles(tilesRef.current);
    setHud(h => ({ score: 0, best: h.best, max: 0 }));
  };

  const doMove = (dir: Dir) => {
    if (busyRef.current || gameOverRef.current) return;
    const plan = planMove(tilesRef.current, dir);
    if (!plan.moved) return;
    busyRef.current = true;
    scoreRef.current += plan.gained;
    setTiles(plan.slid);
    window.setTimeout(() => {
      const settled = plan.settled.map(t => ({ ...t }));
      spawnTile(settled);
      tilesRef.current = settled;
      setTiles(settled);
      const maxv = settled.reduce((m, t) => Math.max(m, t.value), 0);
      if (scoreRef.current > bestRef.current) bestRef.current = scoreRef.current;
      setHud({ score: scoreRef.current, best: bestRef.current, max: maxv });
      busyRef.current = false;
      if (!movesAvailable(settled)) {
        gameOverRef.current = true;
        if (playerModeRef.current) setGameOver(true);
        else window.setTimeout(() => { if (!playerModeRef.current) restart(); }, 1600);
      } else if (playerModeRef.current) {
        // Tự chơi: hiển thị AI "đọc" thế cờ mới (gợi ý)
        setAiScores(moveScores(settled));
      }
    }, animFor(speedRef.current));
  };
  const doMoveRef = useRef(doMove);
  doMoveRef.current = doMove;

  // Đo kích thước bàn theo cửa sổ
  useEffect(() => {
    const measure = () => setBoardSize(Math.max(300, Math.min(560, Math.floor(window.innerHeight * 0.62))));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Khởi tạo + vòng lặp AI tự chơi
  useEffect(() => {
    restart();
    const id = window.setInterval(() => {
      if (busyRef.current || playerModeRef.current || !runningRef.current || gameOverRef.current) return;
      sinceRef.current += TICK;
      if (sinceRef.current < stepFor(speedRef.current)) return;
      sinceRef.current = 0;
      const sc = moveScores(tilesRef.current);
      setAiScores(sc);
      const dir = bestDirFromScores(sc);
      if (dir) doMoveRef.current(dir);
    }, TICK);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự chơi bằng phím mũi tên / WASD
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!playerModeRef.current) return;
      const map: Record<string, Dir> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
      };
      const dir = map[e.code];
      if (dir) { e.preventDefault(); doMoveRef.current(dir); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleRun = () => { runningRef.current = !runningRef.current; setIsRunning(runningRef.current); };
  const handleSpeed = (s: number) => { speedRef.current = s; setSimSpeed(s); };
  const togglePlayer = () => {
    const on = !playerModeRef.current;
    playerModeRef.current = on;
    setPlayerMode(on);
    restart();
  };

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
              <Gamepad2 className="w-5 h-5 text-orange-400" /> 2048 AI
            </h1>
            <span className="text-[10px] text-orange-400/70 uppercase tracking-widest font-mono">
              EXPECTIMAX SEARCH
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-orange-500/10">
            <Hash className="w-3.5 h-3.5 text-orange-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">ĐIỂM</span>
              <span className="text-xs font-bold text-white font-mono">{hud.score}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-amber-500/10">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">TỐT NHẤT</span>
              <span className="text-xs font-bold text-amber-400 font-mono">{hud.best}</span>
            </div>
          </div>
          <div className="stat-pill glass-panel px-3 py-1.5 flex items-center gap-2 border border-cyan-500/10">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <div>
              <span className="text-[8px] text-slate-500 block leading-none font-semibold uppercase">Ô LỚN NHẤT</span>
              <span className="text-xs font-bold text-cyan-400 font-mono">{hud.max}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-lg p-1 ${playerMode ? 'opacity-40' : ''}`}>
            <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold pl-1.5">TỐC ĐỘ:</span>
            <div className="flex gap-0.5">
              {[1, 2, 4, 8].map(s => (
                <button
                  key={s}
                  disabled={playerMode}
                  onClick={() => handleSpeed(s)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all font-bold ${
                    playerMode ? 'text-slate-700 cursor-not-allowed' : simSpeed === s ? 'bg-orange-600 text-white shadow-[0_0_8px_rgba(249,115,22,0.4)]' : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
            <Gamepad2 className="w-3.5 h-3.5" /> {playerMode ? 'ĐANG TỰ CHƠI' : 'TỰ CHƠI'}
          </button>
          <button onClick={restart} className="cyber-btn cyber-btn-outline py-2 px-2.5 flex items-center gap-1.5 text-xs text-amber-400 border-amber-900/50 hover:bg-amber-900/20">
            <RefreshCw className="w-3.5 h-3.5" /> LÀM LẠI
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

      {/* BOARD + panel AI */}
      <div className="flex-grow flex items-center justify-center gap-6 p-4 overflow-hidden">
        <AIThinkPanel scores={aiScores} />
        <div className="relative" style={{ width: boardSize, height: boardSize }}>
          <Board2048 tiles={tiles} size={boardSize} />

          {playerMode && !gameOver && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[11px] font-mono text-cyan-300/80 whitespace-nowrap">
              Dùng phím ← ↑ ↓ → (hoặc WASD)
            </div>
          )}

          {gameOver && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(238,228,218,0.55)' }}>
              <div className="bg-slate-900/95 border border-orange-500/30 rounded-2xl px-8 py-6 text-center flex flex-col items-center gap-3 shadow-2xl">
                <span className="text-lg font-bold font-mono text-white tracking-wider">HẾT NƯỚC ĐI!</span>
                <span className="text-sm font-mono text-slate-400">
                  Điểm: <span className="text-orange-300 font-bold">{hud.score}</span> · Ô lớn nhất: <span className="text-cyan-300 font-bold">{hud.max}</span>
                </span>
                <button onClick={restart} className="cyber-btn cyber-btn-emerald py-2 px-5 text-xs mt-1 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> CHƠI LẠI
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
