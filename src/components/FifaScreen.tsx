import React, { useEffect, useRef, useState } from 'react';
import { 
  ArrowLeft, Play, Square, Settings, RefreshCw, Activity, Brain, Trophy, ChevronRight, Hash, Users, Sparkles, Gamepad2 
} from 'lucide-react';
import { FifaConfig, FifaPlayer } from '../types/fifa';
import { FifaEngine, DOMBindings } from '../game/FifaEngine';

interface FifaScreenProps {
  config: FifaConfig;
  onBack: () => void;
}

export default function FifaScreen({ config, onBack }: FifaScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FifaEngine | null>(null);
  
  // HUD Ref bindings to let FifaEngine update DOM directly (React Bypass)
  const scoreARef = useRef<HTMLSpanElement>(null);
  const scoreBRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const possessionARef = useRef<HTMLSpanElement>(null);
  const possessionBRef = useRef<HTMLSpanElement>(null);
  const shotsARef = useRef<HTMLSpanElement>(null);
  const shotsBRef = useRef<HTMLSpanElement>(null);
  const passesARef = useRef<HTMLSpanElement>(null);
  const passesBRef = useRef<HTMLSpanElement>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  
  // React-managed states for interactive settings/stats
  const [isPlaying, setIsPlaying] = useState(true);
  const [gameMode, setGameMode] = useState<'player' | 'spectator'>(config.gameMode);
  const [formationA, setFormationA] = useState(config.formationA);
  const [formationB, setFormationB] = useState(config.formationB);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  
  // Tinh chỉnh stats cho Cầu thủ
  const [playerSpeed, setPlayerSpeed] = useState(3.5);
  const [playerPassing, setPlayerPassing] = useState(80);
  const [playerShooting, setPlayerShooting] = useState(80);
  const [playerDefending, setPlayerDefending] = useState(70);
  const [playerReact, setPlayerReact] = useState(150);

  // Initialize Game Engine
  useEffect(() => {
    const engine = new FifaEngine({
      ...config,
      gameMode
    });
    engineRef.current = engine;
    
    // Bind pure DOM elements
    const domBindings: DOMBindings = {
      scoreA: scoreARef.current,
      scoreB: scoreBRef.current,
      time: timeRef.current,
      possessionA: possessionARef.current,
      possessionB: possessionBRef.current,
      shotsA: shotsARef.current,
      shotsB: shotsBRef.current,
      passesA: passesARef.current,
      passesB: passesBRef.current,
      directorLogs: logsRef.current
    };
    engine.bindDOM(domBindings);
    
    // Setup inputs
    const handleKeyDown = (e: KeyboardEvent) => {
      engine.keys[e.code] = true;
      
      // Q or Space to Switch controlled player
      if (e.code === 'KeyQ' || e.code === 'Space') {
        if (engine.config.gameMode === 'player') {
          engine.switchControlledPlayer();
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      engine.keys[e.code] = false;
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      
      engine.mouseX = (e.clientX - rect.left) * scaleX;
      engine.mouseY = (e.clientY - rect.top) * scaleY;
    };
    
    const handleMouseDown = () => {
      engine.mouseClicked = true;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mousedown', handleMouseDown);
    }
    
    // Select first Team A outfield player as default in editor list
    const firstOutfield = engine.players.find(p => p.team === 'A' && p.baseRole !== 'GK');
    if (firstOutfield) {
      setSelectedPlayerId(firstOutfield.id);
      setPlayerSpeed(firstOutfield.stats.speed);
      setPlayerPassing(firstOutfield.stats.passing);
      setPlayerShooting(firstOutfield.stats.shooting);
      setPlayerDefending(firstOutfield.stats.defending);
      setPlayerReact(firstOutfield.stats.reactionTime);
    }
    
    // Start loop
    let animId: number;
    const run = () => {
      if (isPlaying) {
        engine.update();
        if (engine.globalState === 'GAME_OVER' && !engine.isGameOverProcessed) {
          engine.isGameOverProcessed = true;
          setIsGameOver(true);
        }
      }
      renderCanvas();
      renderRadar();
      animId = requestAnimationFrame(run);
    };
    run();
    
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mousedown', handleMouseDown);
      }
    };
  }, [config]);
  
  // Render pitch & entities
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !engineRef.current) return;
    
    const engine = engineRef.current;
    
    // Background Slate Gray (AI Arena Style)
    ctx.fillStyle = '#060813';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Pitch base grass gradient
    ctx.fillStyle = 'rgba(6, 182, 212, 0.015)'; // subtle cyan background glow
    ctx.fillRect(engine.border, engine.border, canvas.width - engine.border * 2, canvas.height - engine.border * 2);
    
    // Center line
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, engine.border);
    ctx.lineTo(canvas.width / 2, canvas.height - engine.border);
    ctx.stroke();
    
    // Center circle
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 85, 0, Math.PI * 2);
    ctx.stroke();
    
    // Penalty areas
    const penW = 150;
    const penH = 280;
    
    // Penalty area Left (Team A)
    ctx.strokeRect(engine.border, canvas.height / 2 - penH / 2, penW, penH);
    ctx.beginPath();
    ctx.arc(engine.border + penW, canvas.height / 2, 60, -Math.PI/3, Math.PI/3);
    ctx.stroke();
    
    // Penalty area Right (Team B)
    ctx.strokeRect(canvas.width - engine.border - penW, canvas.height / 2 - penH / 2, penW, penH);
    ctx.beginPath();
    ctx.arc(canvas.width - engine.border - penW, canvas.height / 2, 60, Math.PI * 2/3, Math.PI * 4/3);
    ctx.stroke();
    
    // Goals Nets
    const goalW = 20;
    const goalH = 140;
    
    // Goal Left
    ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
    ctx.fillRect(engine.border - goalW, canvas.height / 2 - goalH / 2, goalW, goalH);
    ctx.strokeStyle = '#a855f7';
    ctx.strokeRect(engine.border - goalW, canvas.height / 2 - goalH / 2, goalW, goalH);
    
    // Goal Right
    ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.fillRect(canvas.width - engine.border, canvas.height / 2 - goalH / 2, goalW, goalH);
    ctx.strokeStyle = '#06b6d4';
    ctx.strokeRect(canvas.width - engine.border, canvas.height / 2 - goalH / 2, goalW, goalH);
    
    // DRAW PLAYERS
    engine.players.forEach(p => {
      // Sprint trails
      if (p.isSprinting) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = p.team === 'A' ? '#a855f7' : '#06b6d4';
        ctx.beginPath();
        ctx.arc(p.x - p.vx * 1.5, p.y - p.vy * 1.5, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      // Ring under controlled player
      if (p.id === engine.playerControlledId) {
        ctx.save();
        ctx.strokeStyle = '#fbbf24'; // beautiful gold pointer ring
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        
        // draw glowing triangle indicator
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.radius - 12);
        ctx.lineTo(p.x - 5, p.y - p.radius - 20);
        ctx.lineTo(p.x + 5, p.y - p.radius - 20);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      
      // Ring for target editor player in stats panel
      if (p.id === selectedPlayerId) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      
      // Draw Body
      ctx.save();
      ctx.shadowColor = p.team === 'A' ? '#a855f7' : '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.team === 'A' ? '#a855f7' : '#06b6d4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw jersey ring boundary
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Draw direction pointer
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * p.radius, p.y + Math.sin(p.angle) * p.radius);
      ctx.stroke();
      ctx.restore();
      
      // Draw details: Player Number & Name tag
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.number.toString(), p.x, p.y);
      
      // Draw Name above head
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(p.name.split(' ')[0], p.x, p.y - p.radius - 4);
      
      // If player has ball, draw neon aura
      if (p.hasBall) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Stamina Bar
      if (p.stamina < 90 && p.id === engineRef.current?.playerControlledId) {
        const barW = 24;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(p.x - barW/2, p.y + p.radius + 5, barW, 3);
        
        ctx.fillStyle = p.stamina > 30 ? '#4ade80' : '#f87171';
        ctx.fillRect(p.x - barW/2, p.y + p.radius + 5, barW * (p.stamina / 100), 3);
      }
      ctx.restore();
    });
    
    // DRAW BALL
    ctx.save();
    const ball = engine.ball;
    
    // Ball shadow trail
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 2.5 && ball.ownerId === null) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffffff';
      for (let t = 1; t <= 4; t++) {
        ctx.beginPath();
        ctx.arc(ball.x - ball.vx * t * 0.7, ball.y - ball.vy * t * 0.7, ball.radius * (1 - t * 0.15), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    
    ctx.fillStyle = ball.ownerId === null ? '#ffffff' : '#facc15'; // yellow when controlled
    ctx.shadowColor = ball.ownerId === null ? '#ffffff' : '#facc15';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Laser crosshair pointer for human player to aim sút/chuyền
    if (engine.config.gameMode === 'player') {
      const activePlayer = engine.players.find(p => p.id === engine.playerControlledId);
      if (activePlayer && activePlayer.hasBall) {
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.25)';
        ctx.setLineDash([2, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(activePlayer.x, activePlayer.y);
        ctx.lineTo(engine.mouseX, engine.mouseY);
        ctx.stroke();
        
        // draw target cursor ring
        ctx.strokeStyle = '#fbbf24';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(engine.mouseX, engine.mouseY, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };
  
  // Draw Radar / Minimap
  const renderRadar = () => {
    const radar = radarRef.current;
    if (!radar || !engineRef.current) return;
    const ctx = radar.getContext('2d');
    if (!ctx) return;
    
    const engine = engineRef.current;
    const w = radar.width;
    const h = radar.height;
    
    ctx.fillStyle = '#060813';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(0, 0, w, h);
    
    // Half-way line
    ctx.beginPath();
    ctx.moveTo(w/2, 0);
    ctx.lineTo(w/2, h);
    ctx.stroke();
    
    // Draw all players as 2.5px dots on radar
    engine.players.forEach(p => {
      const rx = (p.x / engine.width) * w;
      const ry = (p.y / engine.height) * h;
      
      ctx.fillStyle = p.team === 'A' ? '#c084fc' : '#22d3ee';
      if (p.id === engine.playerControlledId) {
        ctx.fillStyle = '#fbbf24'; // gold dot for player
      }
      ctx.beginPath();
      ctx.arc(rx, ry, p.baseRole === 'GK' ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw ball
    const bx = (engine.ball.x / engine.width) * w;
    const by = (engine.ball.y / engine.height) * h;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, 2.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  };
  
  // Toggle Play / Pause
  const handleTogglePlay = () => {
    setIsPlaying(!isPlaying);
  };
  
  // Toggle game mode
  const handleChangeGameMode = (mode: 'player' | 'spectator') => {
    setGameMode(mode);
    if (engineRef.current) {
      engineRef.current.config.gameMode = mode;
      if (mode === 'spectator') {
        engineRef.current.playerControlledId = null;
      } else {
        const star = engineRef.current.players.find(p => p.team === 'A' && p.baseRole === 'ATT');
        if (star) {
          engineRef.current.playerControlledId = star.id;
        }
      }
      engineRef.current.addLog(`Đã chuyển đổi sang chế độ: ${mode === 'player' ? 'Người chơi' : 'Theo dõi AI'}`, 'info');
    }
  };
  
  // Manual Tactics changes
  const handleForceFormation = (team: 'A' | 'B', form: '4-3-3' | '4-4-2' | '3-5-2' | '5-4-1') => {
    if (team === 'A') {
      setFormationA(form);
    } else {
      setFormationB(form);
    }
    engineRef.current?.forceFormation(team, form);
  };
  
  // Player Stats customization editor
  const handleSelectPlayerForEditor = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pid = e.target.value;
    setSelectedPlayerId(pid);
    
    const player = engineRef.current?.players.find(p => p.id === pid);
    if (player) {
      setPlayerSpeed(player.stats.speed);
      setPlayerPassing(player.stats.passing);
      setPlayerShooting(player.stats.shooting);
      setPlayerDefending(player.stats.defending);
      setPlayerReact(player.stats.reactionTime);
    }
  };
  
  const handleUpdateStat = (stat: 'speed' | 'passing' | 'shooting' | 'defending' | 'react', value: number) => {
    if (!selectedPlayerId || !engineRef.current) return;
    
    const player = engineRef.current.players.find(p => p.id === selectedPlayerId);
    if (!player) return;
    
    if (stat === 'speed') {
      setPlayerSpeed(value);
      player.stats.speed = value;
    } else if (stat === 'passing') {
      setPlayerPassing(value);
      player.stats.passing = value;
    } else if (stat === 'shooting') {
      setPlayerShooting(value);
      player.stats.shooting = value;
    } else if (stat === 'defending') {
      setPlayerDefending(value);
      player.stats.defending = value;
    } else if (stat === 'react') {
      setPlayerReact(value);
      player.stats.reactionTime = value;
    }
  };
  
  const handleRestartMatch = () => {
    if (engineRef.current) {
      engineRef.current.isGameOverProcessed = false;
      engineRef.current.restartGame();
      setIsGameOver(false);
      setIsPlaying(true);
    }
  };
  
  const handleContinueMatch = () => {
    if (engineRef.current) {
      engineRef.current.isGameOverProcessed = false;
      engineRef.current.continueMatch();
      setIsGameOver(false);
      setIsPlaying(true);
    }
  };
  
  return (
    <div className="arena-container flex flex-col h-screen w-full select-none" style={{ backgroundColor: '#03050c' }}>
      
      {/* HEADER SECTION (CLEAN & MINIMAL WITH MAIN TITLE & CONFIGS ONLY) */}
      <header className="arena-header flex items-center justify-between p-4 glass-panel border-b border-slate-900">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="cyber-btn cyber-btn-outline py-2 px-3 text-xs flex gap-2">
            <ArrowLeft className="w-4 h-4" /> QUAY LẠI
          </button>
          <div>
            <h1 className="text-xl font-bold font-mono text-white tracking-wider flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" /> FIFA 2D ARENA ({config.playerCount}v{config.playerCount})
            </h1>
            <span className="text-[10px] text-purple-400/70 uppercase tracking-widest font-mono">
              3-Tier Tactical AI pitch simulation
            </span>
          </div>
        </div>
        
        {/* Playback Controls & Mode Switches */}
        <div className="flex items-center gap-3">
          {/* Game Mode Switch */}
          <div className="flex rounded-lg bg-slate-950 border border-slate-900 p-0.5">
            <button
              onClick={() => handleChangeGameMode('player')}
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all flex items-center gap-1.5 font-bold cursor-pointer border-none ${
                gameMode === 'player'
                  ? 'bg-purple-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              Chơi Trực Tiếp
            </button>
            <button
              onClick={() => handleChangeGameMode('spectator')}
              className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all flex items-center gap-1.5 font-bold cursor-pointer border-none ${
                gameMode === 'spectator'
                  ? 'bg-purple-600 text-white shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              Xem AI Đấu
            </button>
          </div>
          
          {/* Play/Pause Button */}
          <button
            onClick={handleTogglePlay}
            className={`cyber-btn py-2 px-4 flex items-center gap-2 text-xs cursor-pointer ${
              isPlaying ? 'cyber-btn-outline text-rose-400 border-rose-900/50 hover:bg-rose-900/20' : 'cyber-btn-emerald'
            }`}
          >
            {isPlaying ? <><Square className="w-4 h-4" /> TẠM DỪNG</> : <><Play className="w-4 h-4" /> TIẾP TỤC</>}
          </button>
        </div>
      </header>
      
      {/* MAIN SCREEN 2-COLUMN GRID (Deleted Right Column completely) */}
      <div className="flex-grow flex p-4 gap-4 overflow-hidden">
        
        {/* LEFT COLUMN: Tactics, Stats, Editor & Radar */}
        <div className="w-80 flex flex-col gap-4 h-full shrink-0 overflow-y-auto pr-1 scrollbar-thin">
          
          {/* Tactical strategy selectors */}
          <div className="glass-panel p-4 flex flex-col text-left shrink-0">
            <h2 className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-purple-400" /> Chiến Thuật Đội Hình
            </h2>
            
            <div className="flex flex-col gap-3">
              <div>
                <span className="text-[10px] font-mono text-purple-400 block mb-1 font-bold">TEAM A (PHÍA TRÁI)</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['4-3-3', '4-4-2', '3-5-2', '5-4-1'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => handleForceFormation('A', f)}
                      className={`py-1 px-2 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                        formationA === f 
                          ? 'bg-purple-900/30 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                          : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <span className="text-[10px] font-mono text-cyan-400 block mb-1 font-bold">TEAM B (PHÍA PHẢI)</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['4-3-3', '4-4-2', '3-5-2', '5-4-1'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => handleForceFormation('B', f)}
                      className={`py-1 px-2 text-[10px] font-mono rounded border transition-all cursor-pointer ${
                        formationB === f 
                          ? 'bg-cyan-900/30 border-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                          : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Custom stats panel for visual experiments (Moved from right to left column) */}
          <div className="glass-panel p-4 flex flex-col text-left shrink-0">
            <h2 className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Hiệu Chỉnh Chỉ Số AI
            </h2>
            
            <div className="flex flex-col gap-3 font-mono text-xs">
              <div>
                <label className="block text-[9px] text-slate-500 mb-1">CHỌN CẦU THỦ HIỆU CHỈNH:</label>
                <select 
                  onChange={handleSelectPlayerForEditor}
                  value={selectedPlayerId || ''}
                  className="w-full bg-slate-950 border border-slate-900 rounded px-2 py-1.5 text-slate-300 font-mono text-xs focus:outline-none focus:border-purple-600 cursor-pointer"
                >
                  <option value="" disabled>-- Chọn một cầu thủ --</option>
                  {engineRef.current?.players.filter(x => x.team === 'A').map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name.split(' ')[0]} ({p.baseRole} - #{p.number})
                    </option>
                  ))}
                </select>
              </div>
              
              {selectedPlayerId && (
                <div className="flex flex-col gap-2.5 mt-1">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>TỐC ĐỘ CHẠY:</span>
                      <span className="text-purple-400 font-bold">{playerSpeed.toFixed(1)} px</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="2.0" step="0.1" 
                      value={playerSpeed} 
                      onChange={(e) => handleUpdateStat('speed', parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>CHUYỀN CHUẨN XÁC:</span>
                      <span className="text-cyan-400 font-bold">{playerPassing}%</span>
                    </div>
                    <input 
                      type="range" min="50" max="100" step="2" 
                      value={playerPassing} 
                      onChange={(e) => handleUpdateStat('passing', parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>LỰC SÚT & ĐỘ HIỂM:</span>
                      <span className="text-amber-400 font-bold">{playerShooting}%</span>
                    </div>
                    <input 
                      type="range" min="50" max="100" step="2" 
                      value={playerShooting} 
                      onChange={(e) => handleUpdateStat('shooting', parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>XOẠC CƯỚP BÓNG:</span>
                      <span className="text-emerald-400 font-bold">{playerDefending}%</span>
                    </div>
                    <input 
                      type="range" min="40" max="100" step="2" 
                      value={playerDefending} 
                      onChange={(e) => handleUpdateStat('defending', parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                      <span>PHẢN XẠ AI:</span>
                      <span className="text-rose-400 font-bold">{playerReact} ms</span>
                    </div>
                    <input 
                      type="range" min="50" max="350" step="10" 
                      value={playerReact} 
                      onChange={(e) => handleUpdateStat('react', parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Match Analysis Stats */}
          <div className="glass-panel p-4 flex flex-col text-left shrink-0">
            <h2 className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Thống Kê Phân Tích
            </h2>
            
            <div className="flex flex-col gap-3 font-mono text-xs">
              {/* Possession bar */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>KIỂM SOÁT BÓNG</span>
                  <span className="flex gap-2">
                    <span ref={possessionARef} className="text-purple-400">50%</span>
                    <span className="text-slate-600">-</span>
                    <span ref={possessionBRef} className="text-cyan-400">50%</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded bg-slate-950 overflow-hidden flex">
                  <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${engineRef.current?.stats.possessionA ?? 50}%` }} />
                  <div className="h-full bg-cyan-500 transition-all duration-300 flex-grow" />
                </div>
              </div>
              
              {/* Other metrics */}
              <div className="flex justify-between py-1.5 border-b border-slate-900">
                <span className="text-slate-500">SỐ CÚ SÚT</span>
                <div className="flex gap-4">
                  <span ref={shotsARef} className="text-purple-400 font-bold">0</span>
                  <span ref={shotsBRef} className="text-cyan-400 font-bold">0</span>
                </div>
              </div>
              
              <div className="flex justify-between py-1.5 border-b border-slate-900">
                <span className="text-slate-500">ĐƯỜNG CHUYỀN KHỚP (ĐÃ CHUYỀN)</span>
                <div className="flex gap-4">
                  <span ref={passesARef} className="text-purple-400 font-bold">0/0</span>
                  <span ref={passesBRef} className="text-cyan-400 font-bold">0/0</span>
                </div>
              </div>
              
              {/* Radar minimap container */}
              <div className="mt-2 flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-slate-500 block w-full text-left font-mono">RADAR BẢN ĐỒ CON (MINIMAP):</span>
                <canvas 
                  ref={radarRef} 
                  width={240} 
                  height={150} 
                  className="rounded-lg border border-slate-900 shadow-inner"
                />
              </div>
            </div>
          </div>
          
          {/* Dynamic Controller Instructions */}
          {gameMode === 'player' && (
            <div className="glass-panel p-4 flex flex-col text-left bg-purple-950/5 border-purple-900/30 shrink-0">
              <h2 className="text-xs font-mono text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5" /> Phím điều khiển
              </h2>
              <ul className="text-[9px] text-slate-400 font-mono space-y-1 pl-4 list-disc">
                <li><span className="text-white font-bold">W / A / S / D</span> / Mũi tên: Chạy</li>
                <li><span className="text-white font-bold">Chuột</span>: Rê hướng nhìn xoay người</li>
                <li><span className="text-white font-bold">Shift</span>: Chạy nhanh (Tốn thể lực)</li>
                <li><span className="text-white font-bold">Click trái</span> / <span className="text-white font-bold">Space</span>: Chuyền (Nếu xa), Sút (Nếu gần goal)</li>
                <li><span className="text-white font-bold">Phím E</span>: Ép lực Sút xa</li>
                <li><span className="text-white font-bold">Phím Q</span> / <span className="text-white font-bold">Space</span> (Không bóng): Đổi người gần bóng nhất</li>
              </ul>
            </div>
          )}
        </div>
        
        {/* CENTER COLUMN: Central Simulation Pitch & Broadcast TV scoreboard banner (Unified main layout) */}
        <div className="flex-grow flex flex-col gap-4 h-full overflow-hidden items-center justify-center p-4">
          
          {/* BROADCAST TV SCOREBOARD BANNER (Moved from Header to prominent Top of Pitch position) */}
          <div className="flex items-center justify-between w-full max-w-[1120px] bg-slate-950/90 border border-slate-900 rounded-xl px-6 py-2.5 shadow-[0_0_20px_rgba(124,58,237,0.15)] shrink-0 font-mono text-xs">
            {/* Team A stats */}
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse drop-shadow-[0_0_5px_#a855f7]" />
              <div className="text-left">
                <span className="text-[10px] text-slate-500 block font-bold leading-none">TEAM A</span>
                <span className="text-[12px] text-white font-extrabold block mt-0.5 font-mono">{formationA}</span>
              </div>
            </div>
            
            {/* Center score & timer */}
            <div className="flex items-center gap-8 bg-black/40 border border-slate-800/50 rounded-lg px-8 py-1.5">
              <span ref={scoreARef} className="text-3xl font-black text-purple-400 drop-shadow-[0_0_10px_#a855f7]">0</span>
              
              <div className="flex flex-col items-center min-w-[70px] border-x border-slate-800 px-4">
                <span ref={timeRef} className="text-xl font-black text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">00:00</span>
                <span className="text-[8px] text-amber-500/80 font-bold block uppercase mt-0.5 tracking-widest">LIVE</span>
              </div>
              
              <span ref={scoreBRef} className="text-3xl font-black text-cyan-400 drop-shadow-[0_0_10px_#06b6d4]">0</span>
            </div>
            
            {/* Team B stats */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block font-bold leading-none">TEAM B</span>
                <span className="text-[12px] text-white font-extrabold block mt-0.5 font-mono">{formationB}</span>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse drop-shadow-[0_0_5px_#06b6d4]" />
            </div>
          </div>
          
          {/* CANVAS & LOGS SIDE-BY-SIDE CONTAINER */}
          <div className="w-full flex-grow flex gap-4 items-stretch justify-center relative min-h-0 overflow-hidden max-w-[1120px]">
            {/* CANVAS WRAPPER */}
            <div className="flex-grow flex items-center justify-center relative">
              <canvas
                ref={canvasRef}
                width={1120}
                height={700}
                className="rounded-xl shadow-[0_0_35px_rgba(124,58,237,0.12)] border border-slate-900/50 max-w-full max-h-[72vh] aspect-[16/10]"
                style={{
                  background: 'radial-gradient(circle, #0e1227 0%, #03050c 100%)'
                }}
              />
              
              {/* GAME OVER NEON OVERLAY */}
              {isGameOver && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md rounded-xl flex flex-col items-center justify-center border border-purple-500/20 z-20 transition-all duration-300">
                  <div className="text-center p-8 glass-panel glow-border-purple max-w-md w-full shadow-2xl">
                    <Trophy className="w-14 h-14 text-amber-400 mx-auto mb-3 animate-bounce" />
                    <h2 className="text-xl font-black font-mono text-white mb-1 tracking-widest uppercase">TRẬN ĐẤU KẾT THÚC</h2>
                    <span className="text-[9px] text-purple-400 font-mono tracking-widest block mb-4 uppercase">Match Concluded</span>
                    
                    <div className="flex justify-center items-center gap-6 my-4 bg-black/40 py-3 rounded-xl border border-slate-900">
                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block font-mono font-bold leading-none">TEAM A</span>
                        <span className="text-3xl font-black text-purple-400 font-mono">
                          {engineRef.current?.stats.scoreA ?? 0}
                        </span>
                      </div>
                      <span className="text-xl font-bold text-slate-700 font-mono">-</span>
                      <div className="text-left">
                        <span className="text-[9px] text-slate-500 block font-mono font-bold leading-none">TEAM B</span>
                        <span className="text-3xl font-black text-cyan-400 font-mono">
                          {engineRef.current?.stats.scoreB ?? 0}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-[11px] text-slate-400 font-mono mb-6 leading-relaxed px-4">
                      Trận đấu đã khép lại sau {engineRef.current?.maxMatchMinutes} phút đấu trí kịch tính. Bạn muốn tiếp tục thi đấu hiệp phụ hay bắt đầu một trận mới?
                    </p>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={handleContinueMatch}
                        className="flex-grow cyber-btn cyber-btn-cyan text-xs py-3 font-mono font-bold hover:scale-105 transition-all"
                      >
                        ĐÁ TIẾP (+30' HIỆP PHỤ)
                      </button>
                      <button
                        onClick={handleRestartMatch}
                        className="flex-grow cyber-btn cyber-btn-purple text-xs py-3 font-mono font-bold hover:scale-105 transition-all"
                      >
                        ĐÁ LẠI (TRẬN MỚI)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* COMPACT LOGS PANEL ON THE RIGHT SIDE OF THE CANVAS */}
            <div className="w-64 glass-panel border border-slate-900/50 rounded-xl p-3.5 flex flex-col shrink-0 text-left overflow-hidden max-h-[72vh] bg-slate-950/40">
              <h3 className="text-[10px] font-mono font-bold text-purple-400 tracking-widest uppercase mb-2 border-b border-slate-900/50 pb-1.5 flex justify-between items-center shrink-0">
                <span>NHẬT KÝ CHIẾN THUẬT</span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse drop-shadow-[0_0_4px_#a855f7]" />
              </h3>
              
              <div 
                ref={logsRef}
                className="flex-grow overflow-y-auto scrollbar-thin text-[9px] font-mono select-text space-y-1.5 pr-1 text-slate-400 animate-fade-in"
              >
                Trận đấu đang chuẩn bị còi khai cuộc...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
