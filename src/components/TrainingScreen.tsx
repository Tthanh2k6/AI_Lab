import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RefreshCw, Save, Download, ArrowLeft, Brain, User, Zap, Sparkles } from 'lucide-react';
import { Board, Player, Move, AIConfig, SearchMetrics, TrainingMetrics, HeuristicWeights } from '../types/game';
import { useAIWorker } from '../hooks/useAIWorker';
import { checkWinner, isBoardFull } from '../utils/evaluator';
import { computeBoardHash, updateHash } from '../utils/zobrist';
import { evolveWeights, reinforceWeights, getZeroWeights, getMasterWeights, mutateWeights } from '../utils/trainer';
import { getCandidateMoves } from '../utils/minimax';

interface TrainingScreenProps {
  initialConfigX: AIConfig;
  initialConfigO: AIConfig;
  initFromScratch: boolean;
  onBack: () => void;
}

export default function TrainingScreen({
  initialConfigX,
  initialConfigO,
  initFromScratch,
  onBack
}: TrainingScreenProps) {
  // Game states
  const [board, setBoard] = useState<Board>(() => Array(20).fill(null).map(() => Array(20).fill(null)));
  const [turn, setTurn] = useState<Player>('X');
  const [gameStatus, setGameStatus] = useState<'PLAYING' | 'WON' | 'DRAW'>('PLAYING');
  const [winner, setWinner] = useState<Player | 'DRAW' | null>(null);
  const [latestMove, setLatestMove] = useState<Move | null>(null);
  
  // Zobrist hash
  const hashRef = useRef<number>(0);

  // Guard ref for async search loop execution
  const searchingRef = useRef<boolean>(false);

  // AI Configurations & Evolutionary weights
  const [configX, setConfigX] = useState<AIConfig>(initialConfigX);
  const [configO, setConfigO] = useState<AIConfig>(initialConfigO);
  
  // Human vs AI overrides
  const [humanPlayer, setHumanPlayer] = useState<Player | null>(null); // 'X' or 'O' or null (AI vs AI)

  // Training loop controllers
  const [isTrainingPaused, setIsTrainingPaused] = useState(false);
  const [moveDelay, setMoveDelay] = useState<number>(100); // speed control (ms between turns)
  const [timeLimitMs, setTimeLimitMs] = useState<number>(100); // worker depth time out

  // Training Metrics
  const [metrics, setMetrics] = useState<TrainingMetrics>({
    gamesPlayed: 0,
    ai1Wins: 0,
    ai2Wins: 0,
    draws: 0,
    winRateHistory50: [],
    generation: 0
  });

  // Track win-loss array for the last 50 games specifically
  const [rollingOutcomes, setRollingOutcomes] = useState<(Player | 'DRAW')[]>([]);

  // Tab selected to show weights in the visualizer card
  const [weightTab, setWeightTab] = useState<'X' | 'O'>('X');

  // Ref to track who starts the current game luân phiên
  const starterPlayerRef = useRef<Player>('X');

  // Search Telemetry for display
  const [searchMetricsX, setSearchMetricsX] = useState<SearchMetrics | null>(null);
  const [searchMetricsO, setSearchMetricsO] = useState<SearchMetrics | null>(null);

  // Web Worker hook
  const { getBestMove, isSearching, searchMetrics, terminateActiveSearch } = useAIWorker();

  // Canvas ref for drawing the board
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Board Hash on start or reset
  useEffect(() => {
    hashRef.current = computeBoardHash(board, turn);
  }, []);

  // Update rolling search metrics when search completes
  useEffect(() => {
    if (searchMetrics) {
      if (turn === 'X') {
        setSearchMetricsX(searchMetrics);
      } else {
        setSearchMetricsO(searchMetrics);
      }
    }
  }, [searchMetrics]);

  // RESET Game Board
  const resetBoard = useCallback(() => {
    terminateActiveSearch();
    searchingRef.current = false; // Reset search guard ref
    const newBoard = Array(20).fill(null).map(() => Array(20).fill(null));
    setBoard(newBoard);
    
    // Luân phiên alternate starting player to eliminate first-player advantage!
    const nextStarter = starterPlayerRef.current === 'X' ? 'O' : 'X';
    starterPlayerRef.current = nextStarter;
    setTurn(nextStarter);
    
    setGameStatus('PLAYING');
    setWinner(null);
    setLatestMove(null);
    hashRef.current = computeBoardHash(newBoard, nextStarter);
  }, [terminateActiveSearch]);

  // COMPLETE RESET: Reset board AND AI weights back to zero
  const handleFullReset = () => {
    starterPlayerRef.current = 'O'; // Set to O so that the immediate resetBoard() call will flip it to X (X goes first on Gen 0)
    resetBoard();
    const cleanWeights = initFromScratch ? getZeroWeights() : getMasterWeights();
    
    setConfigX(prev => ({ ...prev, weights: { ...cleanWeights } }));
    setConfigO(prev => ({ ...prev, weights: { ...cleanWeights } }));
    
    setMetrics({
      gamesPlayed: 0,
      ai1Wins: 0,
      ai2Wins: 0,
      draws: 0,
      winRateHistory50: [],
      generation: 0
    });
    setRollingOutcomes([]);
    setSearchMetricsX(null);
    setSearchMetricsO(null);
  };

  // AI WATERMARK/SEARCH TREE GRAPHICS FOR CANVAS
  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const size = 20;
    const padding = 20;
    const cellSize = (width - padding * 2) / size;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Tech grid background
    ctx.fillStyle = '#06070c';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Lines (Neon styling)
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      const pos = padding + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, padding);
      ctx.lineTo(pos, height - padding);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding, pos);
      ctx.lineTo(width - padding, pos);
      ctx.stroke();
    }

    // 2. Draw search candidate bounding box dots
    const activeCandidates = getCandidateMoves(board, 1);
    if (gameStatus === 'PLAYING' && activeCandidates.length > 1) {
      ctx.fillStyle = turn === 'X' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(6, 182, 212, 0.08)';
      activeCandidates.forEach(m => {
        const cx = padding + m.c * cellSize + cellSize / 2;
        const cy = padding + m.r * cellSize + cellSize / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.15, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 3. Highlight Latest Move with Neon Pulse Ring
    if (latestMove) {
      const cx = padding + latestMove.c * cellSize + cellSize / 2;
      const cy = padding + latestMove.r * cellSize + cellSize / 2;
      
      ctx.shadowColor = turn === 'X' ? '#06b6d4' : '#a855f7';
      ctx.shadowBlur = 15;
      ctx.strokeStyle = turn === 'X' ? 'rgba(6, 182, 212, 0.6)' : 'rgba(168, 85, 247, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Draw placed stones
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
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#c084fc';
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.strokeStyle = '#06070c';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx - radius * 0.45, cy - radius * 0.45);
          ctx.lineTo(cx + radius * 0.45, cy + radius * 0.45);
          ctx.moveTo(cx + radius * 0.45, cy - radius * 0.45);
          ctx.lineTo(cx - radius * 0.45, cy + radius * 0.45);
          ctx.stroke();
        } else {
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#22d3ee';
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.strokeStyle = '#06070c';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }, [board, latestMove, turn, gameStatus]);

  useEffect(() => {
    drawBoard();
  }, [drawBoard]);

  const handleGameOver = useCallback((gameWinner: Player | 'DRAW') => {
    setWinner(gameWinner);
    setGameStatus(gameWinner === 'DRAW' ? 'DRAW' : 'WON');

    let newWeightsX = { ...configX.weights };
    let newWeightsO = { ...configO.weights };

    // Check if there is a human player involved
    const isHumanVsAI = humanPlayer !== null;

    if (isHumanVsAI) {
      // Human vs AI mode: The AI learns from human play!
      const aiPlayer = humanPlayer === 'X' ? 'O' : 'X';
      
      if (gameWinner === humanPlayer) {
        // AI lost: AI needs to reinforce its defenses and mutate to adapt
        if (aiPlayer === 'X') {
          // AI X lost to human O: reinforce X's defense against O
          const reinforced = reinforceWeights('O', newWeightsX, newWeightsO);
          newWeightsX = mutateWeights(reinforced.newWeightsX, 0.25);
        } else {
          // AI O lost to human X: reinforce O's defense against X
          const reinforced = reinforceWeights('X', newWeightsX, newWeightsO);
          newWeightsO = mutateWeights(reinforced.newWeightsO, 0.25);
        }
      } else if (gameWinner === aiPlayer) {
        // AI won against human: Keep the successful brain exactly as is!
        // No mutation, or just a tiny reward if needed. The human's AI weights are ignored.
      } else {
        // Draw: Mutate the active AI slightly to find a new strategic path
        if (aiPlayer === 'X') {
          newWeightsX = mutateWeights(newWeightsX, 0.12);
        } else {
          newWeightsO = mutateWeights(newWeightsO, 0.12);
        }
      }
    } else {
      // Pure AI vs AI mode: Standard genetic evolution (tournament selection)
      const evolved = evolveWeights(gameWinner, configX.weights, configO.weights, 0.22);
      const reinforced = reinforceWeights(gameWinner, evolved.newWeightsX, evolved.newWeightsO);
      newWeightsX = reinforced.newWeightsX;
      newWeightsO = reinforced.newWeightsO;
    }

    setConfigX(prev => ({ ...prev, weights: newWeightsX }));
    setConfigO(prev => ({ ...prev, weights: newWeightsO }));

    setRollingOutcomes(prev => {
      const next = [...prev, gameWinner];
      if (next.length > 50) next.shift();
      return next;
    });

    setMetrics(prev => {
      const nextGamesPlayed = prev.gamesPlayed + 1;
      const nextXWins = gameWinner === 'X' ? prev.ai1Wins + 1 : prev.ai1Wins;
      const nextOWins = gameWinner === 'O' ? prev.ai2Wins + 1 : prev.ai2Wins;
      const nextDraws = gameWinner === 'DRAW' ? prev.draws + 1 : prev.draws;
      
      const outcomes = [...rollingOutcomes, gameWinner];
      if (outcomes.length > 50) outcomes.shift();
      const xWinsInWindow = outcomes.filter(o => o === 'X').length;
      const winRate = outcomes.length > 0 ? Math.round((xWinsInWindow / outcomes.length) * 100) : 0;

      const nextHistory = [...prev.winRateHistory50, winRate];
      if (nextHistory.length > 25) nextHistory.shift();

      return {
        gamesPlayed: nextGamesPlayed,
        ai1Wins: nextXWins,
        ai2Wins: nextOWins,
        draws: nextDraws,
        winRateHistory50: nextHistory,
        generation: prev.generation + 1
      };
    });

    if (!isTrainingPaused) {
      setTimeout(() => {
        resetBoard();
      }, 1500);
    }
  }, [configX.weights, configO.weights, rollingOutcomes, isTrainingPaused, resetBoard, humanPlayer]);

  const makeMove = useCallback((r: number, c: number, player: Player) => {
    // strict check to ensure the moving player matches the active turn to prevent async race condition overlaps!
    if (board[r][c] !== null || gameStatus !== 'PLAYING' || player !== turn) return;

    setBoard(prev => {
      const copy = prev.map(row => [...row]);
      copy[r][c] = player;
      return copy;
    });

    setLatestMove({ r, c });
    hashRef.current = updateHash(hashRef.current, r, c, player);

    const copyBoard = board.map(row => [...row]);
    copyBoard[r][c] = player;
    
    const winResult = checkWinner(copyBoard);
    if (winResult) {
      handleGameOver(winResult);
    } else if (isBoardFull(copyBoard)) {
      handleGameOver('DRAW');
    } else {
      setTurn(player === 'X' ? 'O' : 'X');
    }
  }, [board, turn, gameStatus, handleGameOver]);

  useEffect(() => {
    if (gameStatus !== 'PLAYING' || isTrainingPaused) return;
    if (searchingRef.current) return;

    // Check if it's Human vs AI and human's turn
    const isHumanTurn = (turn === 'X' && humanPlayer === 'X') || (turn === 'O' && humanPlayer === 'O');
    if (isHumanTurn) return;

    const activeConfig = turn === 'X' ? configX : configO;

    let timeoutId: number;

    const runWorkerSearch = async () => {
      try {
        searchingRef.current = true;
        const result = await getBestMove(
          board,
          turn,
          activeConfig,
          hashRef.current,
          timeLimitMs
        );
        
        timeoutId = window.setTimeout(() => {
          searchingRef.current = false;
          makeMove(result.move.r, result.move.c, turn);
        }, moveDelay);
      } catch (err) {
        searchingRef.current = false;
        console.error('Worker search failed:', err);
      }
    };

    runWorkerSearch();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [board, turn, gameStatus, isTrainingPaused, configX, configO, getBestMove, makeMove, moveDelay, timeLimitMs, humanPlayer]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameStatus !== 'PLAYING') return;

    const isHumanTurn = (turn === 'X' && humanPlayer === 'X') || (turn === 'O' && humanPlayer === 'O');
    if (!isHumanTurn) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = 20;
    const cellSize = (canvas.width - padding * 2) / 20;

    const col = Math.floor((x - padding) / cellSize);
    const row = Math.floor((y - padding) / cellSize);

    if (row >= 0 && row < 20 && col >= 0 && col < 20 && board[row][col] === null) {
      makeMove(row, col, turn);
    }
  };

  const toggleTrainingPause = () => {
    setIsTrainingPaused(prev => !prev);
  };

  const handleToggleHumanOverride = (player: Player) => {
    setHumanPlayer(prev => (prev === player ? null : player));
  };

  const exportBrain = (player: Player) => {
    const weights = player === 'X' ? configX.weights : configO.weights;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(weights, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `caro_brain_gen_${metrics.generation}_ai_${player.toLowerCase()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importBrain = (player: Player, e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsedWeights = JSON.parse(event.target?.result as string) as HeuristicWeights;
          if (parsedWeights && typeof parsedWeights.live4 === 'number') {
            if (player === 'X') {
              setConfigX(prev => ({ ...prev, weights: parsedWeights }));
            } else {
              setConfigO(prev => ({ ...prev, weights: parsedWeights }));
            }
            alert('Đã nạp bộ não AI thành công!');
          } else {
            alert('Định dạng tệp không khớp Gomoku weights.');
          }
        } catch (err) {
          alert('Không thể đọc tệp cấu hình.');
        }
      };
    }
  };

  const getRollingWinRate = () => {
    const total = rollingOutcomes.length;
    if (total === 0) return 0;
    const winsX = rollingOutcomes.filter(o => o === 'X').length;
    return Math.round((winsX / total) * 100);
  };

  return (
    <div className="arena-container flex flex-col w-full text-left">
      {/* Top Navigation */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-mono cursor-pointer border-none bg-transparent"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>QUAY LẠI CÀI ĐẶT</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="glow-badge-purple pulse-glow-purple" style={{ padding: '6px 16px', margin: 0, fontSize: '11px', fontFamily: 'monospace' }}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>Thế hệ Gen: {metrics.generation}</span>
          </div>

          <button
            onClick={resetBoard}
            className="telemetry-btn-btn"
            style={{ padding: '8px' }}
            title="Lập lại ván cờ hiện tại"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: 3 columns */}
      {/* Main Grid: 3 columns */}
      <div className="arena-grid flex-grow w-full">
        {/* LEFT COLUMN: AI Telemetry & System Controls (3/12) */}
        <div className="flex flex-col gap-6">
          {/* Card 1: BẢNG ĐỐI CHIẾU THÔNG SỐ AI */}
          <div className="glass-panel glow-border-purple p-5 flex flex-col justify-between relative overflow-hidden">
            <h3 className="text-xs font-mono tracking-widest text-slate-400 font-bold uppercase mb-4 text-center">
              ĐỐI CHIẾU THÔNG SỐ AI
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              {/* AI 1: QUÂN ĐEN (X) */}
              <div className="flex flex-col justify-between relative" style={{ borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '12px' }}>
                {humanPlayer === 'X' && (
                  <div className="absolute font-mono text-amber-400" style={{ top: '-16px', right: '4px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1px 4px', borderRadius: '3px', fontSize: '8px' }}>
                    Ghi Đè
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${turn === 'X' && gameStatus === 'PLAYING' ? 'bg-purple-500 animate-pulse' : 'bg-slate-700'}`} style={turn === 'X' && gameStatus === 'PLAYING' ? { background: 'var(--neon-purple)', boxShadow: '0 0 6px var(--neon-purple)' } : {}} />
                    <span className="text-[11px] font-mono font-bold text-purple-400">AI 1 (X)</span>
                  </div>
                  
                  <div className="space-y-2.5 font-mono text-[10px]">
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Độ sâu:</span>
                      <span className="text-slate-200 font-bold">{searchMetricsX ? `${searchMetricsX.maxDepthReached} bước` : '-'}</span>
                    </div>
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Số nút cờ:</span>
                      <span className="text-slate-200 font-bold">{searchMetricsX ? searchMetricsX.nodesEvaluated.toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Thời gian:</span>
                      <span className="text-slate-200 font-bold">{searchMetricsX ? `${searchMetricsX.timeSpentMs}ms` : '-'}</span>
                    </div>
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Băm TT:</span>
                      <span className="text-purple-400 font-bold">{searchMetricsX ? searchMetricsX.transpositionHits.toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-500 text-[9px]">Điểm Eval:</span>
                      <span className={`font-bold ${searchMetricsX && searchMetricsX.evaluationScore > 0 ? 'text-emerald-400' : searchMetricsX && searchMetricsX.evaluationScore < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {searchMetricsX ? searchMetricsX.evaluationScore.toLocaleString() : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex flex-col gap-1.5 border-t border-white/5">
                  <button
                    onClick={() => handleToggleHumanOverride('X')}
                    className={`telemetry-btn-btn font-bold font-mono text-[9px] py-1 px-1.5 justify-center gap-1 w-full ${
                      humanPlayer === 'X' ? 'telemetry-btn-btn-active' : ''
                    }`}
                  >
                    <User className="w-3 h-3" />
                    <span>{humanPlayer === 'X' ? 'Đã Ghi Đè' : 'Tự Đi'}</span>
                  </button>
                  
                  <div className="flex gap-1.5 w-full">
                    <button
                      onClick={() => exportBrain('X')}
                      className="telemetry-btn-btn flex-grow py-1"
                      title="Tải bộ não xuống PC"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                    <label className="telemetry-btn-btn flex-grow py-1 cursor-pointer">
                      <Download className="w-3 h-3" />
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => importBrain('X', e)}
                        className="d-none"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* AI 2: QUÂN TRẮNG (O) */}
              <div className="flex flex-col justify-between relative" style={{ paddingLeft: '4px' }}>
                {humanPlayer === 'O' && (
                  <div className="absolute font-mono text-amber-400" style={{ top: '-16px', right: '4px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1px 4px', borderRadius: '3px', fontSize: '8px' }}>
                    Ghi Đè
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${turn === 'O' && gameStatus === 'PLAYING' ? 'bg-cyan-500 animate-pulse' : 'bg-slate-700'}`} style={turn === 'O' && gameStatus === 'PLAYING' ? { background: 'var(--neon-cyan)', boxShadow: '0 0 6px var(--neon-cyan)' } : {}} />
                    <span className="text-[11px] font-mono font-bold text-cyan-400">AI 2 (O)</span>
                  </div>
                  
                  <div className="space-y-2.5 font-mono text-[10px]">
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Độ sâu:</span>
                      <span className="text-slate-200 font-bold">{searchMetricsO ? `${searchMetricsO.maxDepthReached} bước` : '-'}</span>
                    </div>
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Số nút cờ:</span>
                      <span className="text-slate-200 font-bold">{searchMetricsO ? searchMetricsO.nodesEvaluated.toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Thời gian:</span>
                      <span className="text-slate-200 font-bold">{searchMetricsO ? `${searchMetricsO.timeSpentMs}ms` : '-'}</span>
                    </div>
                    <div className="flex flex-col border-b border-white/5 pb-1">
                      <span className="text-slate-500 text-[9px]">Băm TT:</span>
                      <span className="text-cyan-400 font-bold">{searchMetricsO ? searchMetricsO.transpositionHits.toLocaleString() : '-'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-500 text-[9px]">Điểm Eval:</span>
                      <span className={`font-bold ${searchMetricsO && searchMetricsO.evaluationScore < 0 ? 'text-emerald-400' : searchMetricsO && searchMetricsO.evaluationScore > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {searchMetricsO ? (-searchMetricsO.evaluationScore).toLocaleString() : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 flex flex-col gap-1.5 border-t border-white/5">
                  <button
                    onClick={() => handleToggleHumanOverride('O')}
                    className={`telemetry-btn-btn font-bold font-mono text-[9px] py-1 px-1.5 justify-center gap-1 w-full ${
                      humanPlayer === 'O' ? 'telemetry-btn-btn-active' : ''
                    }`}
                  >
                    <User className="w-3 h-3" />
                    <span>{humanPlayer === 'O' ? 'Đã Ghi Đè' : 'Tự Đi'}</span>
                  </button>
                  
                  <div className="flex gap-1.5 w-full">
                    <button
                      onClick={() => exportBrain('O')}
                      className="telemetry-btn-btn flex-grow py-1"
                      title="Tải bộ não xuống PC"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                    <label className="telemetry-btn-btn flex-grow py-1 cursor-pointer">
                      <Download className="w-3 h-3" />
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => importBrain('O', e)}
                        className="d-none"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: ĐIỀU KHIỂN HỆ THỐNG */}
          <div className="glass-panel glow-border-purple p-4 flex flex-col gap-4">
            <h3 className="text-xs font-mono tracking-widest text-slate-400 font-bold uppercase text-center mb-1">
              ĐIỀU KHIỂN HỆ THỐNG
            </h3>

            <button
              onClick={toggleTrainingPause}
              className={`cyber-btn text-xs font-mono py-2 px-4 font-bold flex items-center justify-center gap-1.5 w-full ${
                isTrainingPaused 
                  ? 'cyber-btn-cyan pulse-glow-cyan' 
                  : 'cyber-btn-outline'
              }`}
              style={{ borderRadius: '10px' }}
            >
              {isTrainingPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  TIẾP TỤC HUẤN LUYỆN
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  TẠM DỪNG HUẤN LUYỆN
                </>
              )}
            </button>

            {/* Turn Delay speed slider */}
            <div className="w-full">
              <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                <span>TỐC ĐỘ BƯỚC ĐI:</span>
                <span className="text-slate-300 font-bold">{moveDelay === 0 ? 'Tối đa (0ms)' : `${moveDelay}ms`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="800"
                step="50"
                value={moveDelay}
                onChange={(e) => setMoveDelay(parseInt(e.target.value))}
                className="slider-styled slider-styled-cyan"
              />
            </div>

            {/* Time budget slider */}
            <div className="w-full">
              <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                <span>GIỚI HẠN SUY NGHĨ:</span>
                <span className="text-slate-300 font-bold">{timeLimitMs}ms</span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={timeLimitMs}
                onChange={(e) => setTimeLimitMs(parseInt(e.target.value))}
                className="slider-styled slider-styled-purple"
              />
            </div>

            {/* Reset Brain Button */}
            <div className="pt-2 border-t border-white/5">
              <button
                onClick={handleFullReset}
                className="w-full py-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-800 text-red-400 transition-colors font-mono text-[10px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                KHỞI TẠO NÃO VỀ VÁN 0
              </button>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: The Game Board (6/12) */}
        <div className="flex flex-col justify-center items-center h-full">
          <div className="glass-panel p-4 flex flex-col justify-center items-center w-full relative overflow-hidden bg-slate-950/20">
            {/* Board Canvas */}
            <canvas
              ref={canvasRef}
              width={520}
              height={520}
              onClick={handleCanvasClick}
              className={`max-w-full aspect-square border border-slate-900 rounded-xl shadow-2xl ${
                (turn === 'X' && humanPlayer === 'X') || (turn === 'O' && humanPlayer === 'O')
                  ? 'cursor-crosshair'
                  : 'cursor-not-allowed'
              }`}
            />

            {/* Center Status Indicators */}
            <div className="mt-4 flex justify-between items-center w-full px-4">
              <div className="text-xs font-mono text-slate-500">
                {latestMove ? `Đặt quân cuối: Hàng ${latestMove.r + 1}, Cột ${latestMove.c + 1}` : 'Ván cờ chưa bắt đầu'}
              </div>

              {gameStatus !== 'PLAYING' && (
                <div className="animate-bounce px-4 py-1.5 rounded-lg border text-sm font-bold shadow-lg font-mono uppercase bg-purple-500/10 border-purple-500 text-purple-400">
                  {gameStatus === 'DRAW' ? 'Ván Đấu Hòa!' : winner === 'X' ? 'Quân Đen X Thắng!' : 'Quân Trắng O Thắng!'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Visual Analytics (3/12) */}
        <div className="flex flex-col gap-6">
          {/* Win rate in the last 50 games & stats */}
          <div className="glass-panel p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-mono tracking-widest text-slate-400 font-bold uppercase mb-4">
                TỈ LỆ THẮNG (50 TRẬN GẦN NHẤT)
              </h3>

              {/* Progress and spark chart */}
              <div className="winrate-radial-container">
                <div>
                  <span className="text-2xl font-bold text-purple-400 block leading-none">
                    {getRollingWinRate()}%
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono block mt-1">
                    Win Rate Quân Đen X
                  </span>
                </div>

                <div className="flex items-center justify-center w-12 h-12 rounded-full border border-slate-800 bg-slate-900/60 relative">
                  <svg className="w-10 h-10 transform -rotate-90">
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      stroke="rgba(255,255,255,0.03)"
                      strokeWidth="3"
                      fill="transparent"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      stroke="var(--neon-purple)"
                      strokeWidth="3.5"
                      fill="transparent"
                      strokeDasharray={100}
                      strokeDashoffset={100 - getRollingWinRate()}
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>
                </div>
              </div>

              {/* Sparkline Rolling Win Rate Chart */}
              <div className="sparkline-chart-card flex flex-col justify-between relative overflow-hidden mb-4">
                <span className="text-[9px] font-mono text-slate-500 block">BIỂU ĐỒ DIỄN BIẾN THẮNG CUỘC</span>
                
                {metrics.winRateHistory50.length > 1 ? (
                  <svg className="w-full h-12" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                      d={metrics.winRateHistory50
                        .map((rate, i) => {
                          const x = (i / (metrics.winRateHistory50.length - 1)) * 100;
                          const y = 100 - rate;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        })
                        .join(' ')}
                      fill="none"
                      stroke="var(--neon-pink)"
                      strokeWidth="2.5"
                    />
                  </svg>
                ) : (
                  <div className="text-[10px] font-mono text-slate-500 text-center py-4">Đang thu thập dữ liệu ván...</div>
                )}
              </div>

              {/* Textual outcomes counts */}
              <div className="win-loss-draw-counter-grid font-mono text-center text-xs">
                <div className="counter-box-stat">
                  <span className="text-[9px] text-purple-400 block mb-0.5">X THẮNG</span>
                  <span className="font-bold text-white">{metrics.ai1Wins}</span>
                </div>
                <div className="counter-box-stat">
                  <span className="text-[9px] text-cyan-400 block mb-0.5">O THẮNG</span>
                  <span className="font-bold text-white">{metrics.ai2Wins}</span>
                </div>
                <div className="counter-box-stat">
                  <span className="text-[9px] text-slate-500 block mb-0.5">HÒA</span>
                  <span className="font-bold text-white">{metrics.draws}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 flex justify-between text-[11px] font-mono text-slate-500" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span>Đã chơi: {metrics.gamesPlayed} ván</span>
              <span>Lịch sử: {rollingOutcomes.length}/50</span>
            </div>
          </div>

          {/* Genetic Weights Visualizer (Animated Bars with Tab Switcher) */}
          <div className="weights-visualizer-card flex flex-col justify-between flex-grow max-h-[360px]">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-mono tracking-widest text-slate-400 font-bold uppercase flex items-center gap-1">
                  <Brain className="w-4 h-4 text-purple-400" />
                  TRỌNG SỐ TIẾN HÓA
                </h3>
                
                {/* Premium Tab controls */}
                <div className="flex gap-1 bg-slate-900/60 p-0.5 rounded-lg border border-slate-800/80">
                  <button
                    onClick={() => setWeightTab('X')}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-mono font-bold cursor-pointer transition-all duration-200 ${
                      weightTab === 'X'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'text-slate-400 border border-transparent hover:text-white'
                    }`}
                  >
                    AI 1 (X)
                  </button>
                  <button
                    onClick={() => setWeightTab('O')}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-mono font-bold cursor-pointer transition-all duration-200 ${
                      weightTab === 'O'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-slate-400 border border-transparent hover:text-white'
                    }`}
                  >
                    AI 2 (O)
                  </button>
                </div>
              </div>

              {/* Render selected weights dynamically */}
              {(() => {
                const activeWeights = weightTab === 'X' ? configX.weights : configO.weights;
                const isXTab = weightTab === 'X';
                
                const themeColorClass = isXTab ? 'text-purple-400' : 'text-cyan-400';
                
                // Calculate maxWeightVal in active weights dynamically (ignoring win5 which is always 100000)
                const maxWeightVal = Math.max(
                  1,
                  activeWeights.live4,
                  activeWeights.blockLive4 || 0,
                  activeWeights.fork43 || 0,
                  activeWeights.closed4,
                  activeWeights.live3,
                  activeWeights.blockLive3 || 0,
                  activeWeights.doubleLive3 || 0,
                  activeWeights.closed3,
                  activeWeights.live2,
                  activeWeights.closed2 || 0,
                  activeWeights.center
                );

                const getBarWidth = (val: number) => {
                  return `${Math.min(100, (val / maxWeightVal) * 100)}%`;
                };

                return (
                  <div className="font-mono text-xs overflow-y-auto max-h-[285px] pr-1 scrollbar-styled" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Live 4 Weight */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Live 4 (4 thoáng tự do):</span>
                        <span className={`${themeColorClass} font-bold`}>{activeWeights.live4.toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.live4),
                            background: isXTab 
                              ? 'linear-gradient(90deg, var(--neon-purple), var(--neon-pink))' 
                              : 'linear-gradient(90deg, var(--neon-cyan), #3b82f6)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Block Live 4 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Block Live 4 (Chặn 4 thoáng):</span>
                        <span className="text-red-400 font-bold">{(activeWeights.blockLive4 || 0).toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.blockLive4 || 0),
                            background: 'linear-gradient(90deg, #ef4444, #f43f5e)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Fork 4-3 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Fork 4-3 (Nước đôi 4-3):</span>
                        <span className="text-amber-400 font-bold">{(activeWeights.fork43 || 0).toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.fork43 || 0),
                            background: 'linear-gradient(90deg, var(--neon-yellow), #f59e0b)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Fork 3-3 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Fork 3-3 (Nước đôi 3-3):</span>
                        <span className="text-orange-400 font-bold">{(activeWeights.doubleLive3 || 0).toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.doubleLive3 || 0),
                            background: 'linear-gradient(90deg, #f97316, #ea580c)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Closed 4 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Closed 4 (4 bị chặn 1 đầu):</span>
                        <span className={`${themeColorClass} font-bold`}>{activeWeights.closed4.toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.closed4),
                            background: isXTab ? 'var(--neon-purple)' : 'var(--neon-cyan)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Live 3 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Live 3 (3 thoáng tự do):</span>
                        <span className="text-emerald-400 font-bold">{activeWeights.live3.toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.live3),
                            background: isXTab 
                              ? 'linear-gradient(90deg, var(--neon-cyan), #3b82f6)' 
                              : 'linear-gradient(90deg, var(--neon-green), #10b981)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Block Live 3 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Block Live 3 (Chặn 3 thoáng):</span>
                        <span className="text-rose-400 font-bold">{(activeWeights.blockLive3 || 0).toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.blockLive3 || 0),
                            background: 'linear-gradient(90deg, #f43f5e, #fda4af)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Closed 3 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Closed 3 (3 bị chặn 1 đầu):</span>
                        <span className="text-cyan-400 font-bold">{activeWeights.closed3.toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.closed3),
                            background: isXTab ? 'var(--neon-cyan)' : 'var(--neon-green)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Live 2 */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Live 2 (2 thoáng tự do):</span>
                        <span className="text-teal-400 font-bold">{activeWeights.live2.toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.live2),
                            background: isXTab ? 'var(--neon-green)' : 'var(--neon-yellow)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Closed 2 (Newly added!) */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Closed 2 (2 bị chặn 1 đầu):</span>
                        <span className="text-slate-300 font-bold">{(activeWeights.closed2 || 0).toLocaleString()}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.closed2 || 0),
                            background: 'rgba(255,255,255,0.1)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Center */}
                    <div className="weight-row-visual">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Center (Thế cờ trung tâm):</span>
                        <span className="text-yellow-400 font-bold">{activeWeights.center}</span>
                      </div>
                      <div className="weight-bar-bg">
                        <div
                          className="weight-bar-fill"
                          style={{
                            width: getBarWidth(activeWeights.center),
                            background: isXTab ? 'var(--neon-yellow)' : 'var(--neon-purple)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
