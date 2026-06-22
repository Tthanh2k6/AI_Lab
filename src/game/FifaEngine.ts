import { 
  FifaPlayer, 
  FifaBall, 
  FifaConfig, 
  GlobalGameState, 
  SetPieceType, 
  MatchStats, 
  FifaPlayerRole, 
  FifaFsmState,
  PlayerStats
} from '../types/fifa';

// Normalized positions for formations (outfield players only, GK is handled separately)
// Coordinates are for Team A (left to right, 0 to 1). Mirror for Team B.
const FORMATIONS = {
  '4-3-3': [
    // Defenders
    { role: 'DEF' as FifaPlayerRole, rx: 0.25, ry: 0.15, name: 'LB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.38, name: 'LCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.62, name: 'RCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.25, ry: 0.85, name: 'RB' },
    // Midfielders
    { role: 'MID' as FifaPlayerRole, rx: 0.45, ry: 0.30, name: 'LCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.40, ry: 0.50, name: 'CM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.45, ry: 0.70, name: 'RCM' },
    // Attackers
    { role: 'ATT' as FifaPlayerRole, rx: 0.68, ry: 0.20, name: 'LW' },
    { role: 'ATT' as FifaPlayerRole, rx: 0.75, ry: 0.50, name: 'ST' },
    { role: 'ATT' as FifaPlayerRole, rx: 0.68, ry: 0.80, name: 'RW' }
  ],
  '4-4-2': [
    // Defenders
    { role: 'DEF' as FifaPlayerRole, rx: 0.25, ry: 0.15, name: 'LB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.38, name: 'LCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.62, name: 'RCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.25, ry: 0.85, name: 'RB' },
    // Midfielders
    { role: 'MID' as FifaPlayerRole, rx: 0.46, ry: 0.15, name: 'LM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.42, ry: 0.38, name: 'LCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.42, ry: 0.62, name: 'RCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.46, ry: 0.85, name: 'RM' },
    // Attackers
    { role: 'ATT' as FifaPlayerRole, rx: 0.72, ry: 0.35, name: 'LS' },
    { role: 'ATT' as FifaPlayerRole, rx: 0.72, ry: 0.65, name: 'RS' }
  ],
  '3-5-2': [
    // Defenders
    { role: 'DEF' as FifaPlayerRole, rx: 0.24, ry: 0.25, name: 'LCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.50, name: 'CB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.24, ry: 0.75, name: 'RCB' },
    // Midfielders
    { role: 'MID' as FifaPlayerRole, rx: 0.42, ry: 0.12, name: 'LWB' },
    { role: 'MID' as FifaPlayerRole, rx: 0.48, ry: 0.32, name: 'LCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.45, ry: 0.50, name: 'CM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.48, ry: 0.68, name: 'RCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.42, ry: 0.88, name: 'RWB' },
    // Attackers
    { role: 'ATT' as FifaPlayerRole, rx: 0.74, ry: 0.35, name: 'LS' },
    { role: 'ATT' as FifaPlayerRole, rx: 0.74, ry: 0.65, name: 'RS' }
  ],
  '5-4-1': [
    // Defenders
    { role: 'DEF' as FifaPlayerRole, rx: 0.26, ry: 0.12, name: 'LWB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.30, name: 'LCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.20, ry: 0.50, name: 'CB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.22, ry: 0.70, name: 'RCB' },
    { role: 'DEF' as FifaPlayerRole, rx: 0.26, ry: 0.88, name: 'RWB' },
    // Midfielders
    { role: 'MID' as FifaPlayerRole, rx: 0.44, ry: 0.20, name: 'LM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.40, ry: 0.40, name: 'LCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.40, ry: 0.60, name: 'RCM' },
    { role: 'MID' as FifaPlayerRole, rx: 0.44, ry: 0.80, name: 'RM' },
    // Attacker
    { role: 'ATT' as FifaPlayerRole, rx: 0.72, ry: 0.50, name: 'ST' }
  ]
};

const FIRST_NAMES = ['Ronaldo', 'Messi', 'Mbappe', 'Haaland', 'Neymar', 'Salah', 'De Bruyne', 'Modric', 'Kane', 'Lewandowski', 'Casemiro', 'Van Dijk', 'Alisson', 'Courtois', 'Fernandes', 'Saka', 'Rashford', 'Son', 'Pedri', 'Bellingham', 'Kroos'];
const LAST_NAMES = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Vo', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly', 'An', 'Bình', 'Minh', 'Thanh', 'Tuấn'];

export interface DOMBindings {
  scoreA: HTMLElement | null;
  scoreB: HTMLElement | null;
  time: HTMLElement | null;
  possessionA: HTMLElement | null;
  possessionB: HTMLElement | null;
  shotsA: HTMLElement | null;
  shotsB: HTMLElement | null;
  passesA: HTMLElement | null;
  passesB: HTMLElement | null;
  directorLogs: HTMLElement | null;
}

export class FifaEngine {
  // Dimensions
  public width = 1120;
  public height = 700;
  public border = 40; // Pitch playable boundary inset
  
  // Game Entities
  public players: FifaPlayer[] = [];
  public ball!: FifaBall;
  public playerControlledId: string | null = null;
  
  // State
  public globalState: GlobalGameState = 'SET_PIECE';
  public setPieceType: SetPieceType | null = 'KICK_OFF';
  public setPieceTeam: 'A' | 'B' = 'A';
  public ticks = 0;
  public simulatedMinutes = 0;
  public simulatedSeconds = 0;
  public maxMatchMinutes = 90;
  public isGameOverProcessed = false;
  
  // Configurations & Formations
  public config: FifaConfig;
  public currentFormationA: '4-3-3' | '4-4-2' | '3-5-2' | '5-4-1';
  public currentFormationB: '4-3-3' | '4-4-2' | '3-5-2' | '5-4-1';
  
  // Stats
  public stats: MatchStats = {
    scoreA: 0,
    scoreB: 0,
    possessionA: 50,
    possessionB: 50,
    shotsA: 0,
    shotsB: 0,
    passesA: 0,
    passesAttemptedA: 0,
    passesB: 0,
    passesAttemptedB: 0,
    tacklesA: 0,
    tacklesB: 0
  };
  
  // Ticking possession details
  private ballPossessionTicksA = 0;
  private ballPossessionTicksB = 0;
  
  // Logs & Celebrations
  public logs: { text: string; time: string; type: 'info' | 'goal' | 'director' }[] = [];
  private celebrationTimer = 0;
  private celebrationPlayerId: string | null = null;
  
  // Keyboard / Input states for Player Mode
  public keys: { [key: string]: boolean } = {};
  public mouseX = 0;
  public mouseY = 0;
  public mouseClicked = false;
  
  // Dynamic tactical shifts
  private shiftFactorX = 0.18;
  private shiftFactorY = 0.22;
  
  // Tackle and steal protection immunity
  private tackleImmunityTicks = 0;
  
  // DOM bindings for high performance updates
  private dom: DOMBindings = {
    scoreA: null, scoreB: null, time: null,
    possessionA: null, possessionB: null,
    shotsA: null, shotsB: null, passesA: null, passesB: null,
    directorLogs: null
  };
  
  constructor(config: FifaConfig) {
    this.config = config;
    this.currentFormationA = config.formationA;
    this.currentFormationB = config.formationB;
    
    this.initPitch();
    this.addLog("Trận đấu chuẩn bị bắt đầu! Lựa chọn đội hình: " + config.formationA + " vs " + config.formationB, 'info');
  }
  
  public bindDOM(dom: DOMBindings) {
    this.dom = dom;
    this.updateDOM(true); // Force initial update
  }
  
  private getOutfieldSlots(slots: any[], playerCount: number) {
    if (playerCount === 11) return slots;
    if (playerCount === 7) {
      // 7v7 (1 GK + 6 outfield): LB(0), RB(3), LCM(4), RCM(6), LW(7), RW(8)
      return [slots[0], slots[3], slots[4], slots[6], slots[7], slots[8]];
    }
    if (playerCount === 5) {
      // 5v5 (1 GK + 4 outfield): LCB(1), RCB(2), CM(5), ST(8)
      return [slots[1], slots[2], slots[5], slots[8]];
    }
    if (playerCount === 3) {
      // 3v3 (1 GK + 2 outfield): CB(2), ST(8)
      return [slots[2], slots[8]];
    }
    return slots;
  }

  private initPitch() {
    this.players = [];
    
    // Create Goalkeeper Team A (Slowing down goalkeeper to 0.9)
    this.players.push(this.createPlayer('A', 1, 'GK', 'Thủ môn A', {
      speed: 0.9, passing: 65, shooting: 30, defending: 85, reactionTime: 120
    }));
    
    // Create Goalkeeper Team B (Slowing down goalkeeper to 0.9)
    this.players.push(this.createPlayer('B', 1, 'GK', 'Thủ môn B', {
      speed: 0.9, passing: 65, shooting: 30, defending: 85, reactionTime: 120
    }));
    
    // Create Outfield Players Team A (sliced based on playerCount)
    const outfieldSlotsA = this.getOutfieldSlots(FORMATIONS[this.currentFormationA], this.config.playerCount);
    outfieldSlotsA.forEach((slot, index) => {
      const name = `${slot.name} A (${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]})`;
      this.players.push(this.createPlayer('A', index + 2, slot.role, name, this.getRandomStats(slot.role)));
    });
    
    // Create Outfield Players Team B
    const outfieldSlotsB = this.getOutfieldSlots(FORMATIONS[this.currentFormationB], this.config.playerCount);
    outfieldSlotsB.forEach((slot, index) => {
      const name = `${slot.name} B (${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]})`;
      this.players.push(this.createPlayer('B', index + 2, slot.role, name, this.getRandomStats(slot.role)));
    });
    
    // Create Ball
    this.ball = {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      radius: 6,
      ownerId: null,
      lastOwnerId: null,
      lastOwnerTime: 0
    };
    
    // Position players for Kick-off
    this.resetPlayersForKickOff('A');
    
    if (this.config.gameMode === 'player') {
      // User controls the attacker (e.g. ST / LS) of Team A
      const star = this.players.find(p => p.team === 'A' && p.baseRole === 'ATT');
      if (star) {
        this.playerControlledId = star.id;
      }
    }
  }
  
  private createPlayer(team: 'A' | 'B', number: number, role: FifaPlayerRole, name: string, stats: PlayerStats): FifaPlayer {
    const id = `${team}-${number}-${Date.now()}-${Math.random()}`;
    return {
      id,
      name,
      number,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 11, // Premium size - highly readable
      team,
      angle: team === 'A' ? 0 : Math.PI,
      baseRole: role,
      fsmState: 'IDLE',
      homeX: 0,
      homeY: 0,
      stamina: 100,
      dashCooldown: 0,
      sprintTimer: 0,
      isSprinting: false,
      hasBall: false,
      stats,
      lastDecisionTick: 0
    };
  }
  
  private getRandomStats(role: FifaPlayerRole): PlayerStats {
    let speed = 0.8 + Math.random() * 0.3; // Giảm tốc độ chạy trung bình xuống còn 0.8 - 1.1px (chậm lại đáng kể)
    let passing = 65 + Math.floor(Math.random() * 25);
    let shooting = 60 + Math.floor(Math.random() * 30);
    let defending = 45 + Math.floor(Math.random() * 35);
    let reactionTime = 120 + Math.floor(Math.random() * 80); // 120 - 200 ms
    
    if (role === 'DEF') {
      defending = 75 + Math.floor(Math.random() * 18);
      shooting = 40 + Math.floor(Math.random() * 25);
      speed = 0.7 + Math.random() * 0.2; // 0.7 - 0.9px
    } else if (role === 'MID') {
      passing = 78 + Math.floor(Math.random() * 16);
      defending = 55 + Math.floor(Math.random() * 25);
      speed = 0.8 + Math.random() * 0.3; // 0.8 - 1.1px
    } else if (role === 'ATT') {
      shooting = 80 + Math.floor(Math.random() * 15);
      speed = 0.95 + Math.random() * 0.25; // 0.95 - 1.2px
      defending = 30 + Math.floor(Math.random() * 20);
    }
    
    // Convert difficulty
    if (this.config.difficulty === 'easy') {
      reactionTime += 100; // Slower thinking
    } else if (this.config.difficulty === 'hard') {
      reactionTime = Math.max(50, reactionTime - 60); // Snappy reaction
    }
    
    return { speed, passing, shooting, defending, reactionTime };
  }
  
  // Set pieces: positioning players correctly on the field
  public resetPlayersForKickOff(kickOffTeam: 'A' | 'B') {
    this.globalState = 'SET_PIECE';
    this.setPieceType = 'KICK_OFF';
    this.setPieceTeam = kickOffTeam;
    
    // Clear ball owner
    this.ball.ownerId = null;
    this.ball.x = this.width / 2;
    this.ball.y = this.height / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
    
    // Goalkeepers
    const gkA = this.players.find(p => p.team === 'A' && p.baseRole === 'GK')!;
    gkA.x = this.border + 30;
    gkA.y = this.height / 2;
    gkA.vx = 0; gkA.vy = 0; gkA.fsmState = 'WALK_TO_SET_PIECE';
    
    const gkB = this.players.find(p => p.team === 'B' && p.baseRole === 'GK')!;
    gkB.x = this.width - this.border - 30;
    gkB.y = this.height / 2;
    gkB.vx = 0; gkB.vy = 0; gkB.fsmState = 'WALK_TO_SET_PIECE';
    
    // Outfield players positions for Kick-off (sliced based on playerCount)
    const teamAPlayers = this.players.filter(p => p.team === 'A' && p.baseRole !== 'GK');
    const formA = this.getOutfieldSlots(FORMATIONS[this.currentFormationA], this.config.playerCount);
    
    teamAPlayers.forEach((p, idx) => {
      const slot = formA[idx];
      if (!slot) return;
      let rx = slot.rx;
      let ry = slot.ry;
      
      // Keep everyone on their half, tuck in for kickoff
      if (rx > 0.48) rx = 0.46; 
      
      p.x = rx * this.width;
      p.y = ry * this.height;
      p.vx = 0; p.vy = 0;
      p.angle = 0;
      p.fsmState = 'WALK_TO_SET_PIECE';
    });
    
    const teamBPlayers = this.players.filter(p => p.team === 'B' && p.baseRole !== 'GK');
    const formB = this.getOutfieldSlots(FORMATIONS[this.currentFormationB], this.config.playerCount);
    
    teamBPlayers.forEach((p, idx) => {
      const slot = formB[idx];
      if (!slot) return;
      let rx = slot.rx;
      let ry = slot.ry;
      
      if (rx > 0.48) rx = 0.46;
      
      // Mirror Team B
      p.x = (1 - rx) * this.width;
      p.y = (1 - ry) * this.height;
      p.vx = 0; p.vy = 0;
      p.angle = Math.PI;
      p.fsmState = 'WALK_TO_SET_PIECE';
    });
    
    // Special kicker setup
    if (kickOffTeam === 'A') {
      const kicker = teamAPlayers.reduce((prev, curr) => (curr.homeX > prev.homeX) ? curr : prev, teamAPlayers[0]);
      kicker.x = this.width / 2 - 25;
      kicker.y = this.height / 2;
    } else {
      const kicker = teamBPlayers.reduce((prev, curr) => (curr.homeX < prev.homeX) ? curr : prev, teamBPlayers[0]);
      kicker.x = this.width / 2 + 25;
      kicker.y = this.height / 2;
    }

    // Tự động giao bóng sau 2.0s để tạo khoảng dừng đi bộ về vị trí (giống truyền hình trực tiếp)
    setTimeout(() => {
      if (this.globalState === 'SET_PIECE' && this.setPieceType === 'KICK_OFF') {
        this.takeSetPiece();
      }
    }, 2000);
  }
  
  public update() {
    this.ticks++;
    this.updateClock();
    
    if (this.tackleImmunityTicks > 0) {
      this.tackleImmunityTicks--;
    }
    
    // Check general states
    if (this.globalState === 'GOAL_CELEBRATION') {
      this.updateCelebration();
      this.updatePhysics();
      return;
    }
    
    // 1. DYNAMIC MACRO AI: Update home coordinates for players based on ball position
    this.updateMacroAI();
    
    // 2. DYNAMIC ROLE ALLOCATION: Assign one 'CHASE' player per team
    this.allocateDynamicRoles();
    
    // 3. MICRO AI / PLAYER CONTROL: Process player choices or run AI states
    this.updatePlayers();
    
    // 4. PHYSICS & BALL: Process movement, soft-locks, and out of bounds boundaries
    this.updatePhysics();
    this.checkPitchBoundaries();
    
    // 5. DIRECTOR AI: Strategic changes at specific timestamps
    this.updateDirectorAI();
    
    // 6. DOM Updates
    this.updateDOM(false);
  }
  
  private updateClock() {
    // 90 minutes simulated in config.matchDuration seconds (default 90s)
    // At 60 FPS, total ticks = matchDuration * 60.
    // So 1 simulated minute = (matchDuration * 60) / 90 ticks.
    const ticksPerSimMinute = (this.config.matchDuration * 60) / 90;
    
    this.simulatedMinutes = Math.floor(this.ticks / ticksPerSimMinute);
    const tickFraction = this.ticks % ticksPerSimMinute;
    this.simulatedSeconds = Math.floor((tickFraction / ticksPerSimMinute) * 60);
    
    if (this.simulatedMinutes >= this.maxMatchMinutes) {
      this.globalState = 'GAME_OVER';
      this.addLog(`HẾT GIỜ! Trận đấu kết thúc với tỷ số ${this.stats.scoreA} - ${this.stats.scoreB}`, 'goal');
    } else if (this.simulatedMinutes === 45 && this.simulatedSeconds === 0 && this.ticks % 10 === 0) {
      this.addLog(`HẾT HIỆP 1! Tỷ số hiện tại là ${this.stats.scoreA} - ${this.stats.scoreB}`, 'info');
    }
  }
  
  private updateMacroAI() {
    const ballX = this.ball.x;
    const ballY = this.ball.y;
    
    // Center point of the pitch
    const cx = this.width / 2;
    const cy = this.height / 2;
    
    // Team A (left to right)
    const formA = FORMATIONS[this.currentFormationA];
    const teamAPlayers = this.players.filter(p => p.team === 'A' && p.baseRole !== 'GK');
    
    // Shift factor determines how aggressively players follow the ball
    teamAPlayers.forEach((p, idx) => {
      const slot = formA[idx];
      
      // Base positions
      let bx = slot.rx * this.width;
      let by = slot.ry * this.height;
      
      // Dynamic shift based on ball
      let dx = (ballX - cx) * this.shiftFactorX;
      let dy = (ballY - cy) * this.shiftFactorY;
      
      // Formational boundaries for different roles to avoid out-of-position holes
      if (slot.role === 'DEF') {
        // Defenders shouldn't cross the half-way line unless ball is deep in opponent's half
        dx = Math.min(cx - bx - 30, dx); 
        dx = Math.max(-bx + this.border + 30, dx);
      } else if (slot.role === 'ATT') {
        // Attackers shouldn't retreat all the way into their own box
        dx = Math.max(cx - bx + 20, dx);
      }
      
      p.homeX = bx + dx;
      p.homeY = by + dy;
    });
    
    // Team B (right to left)
    const formB = FORMATIONS[this.currentFormationB];
    const teamBPlayers = this.players.filter(p => p.team === 'B' && p.baseRole !== 'GK');
    
    teamBPlayers.forEach((p, idx) => {
      const slot = formB[idx];
      
      // Base positions (mirrored for Team B)
      let bx = (1 - slot.rx) * this.width;
      let by = (1 - slot.ry) * this.height;
      
      let dx = (ballX - cx) * this.shiftFactorX;
      let dy = (ballY - cy) * this.shiftFactorY;
      
      if (slot.role === 'DEF') {
        dx = Math.max(cx - bx + 30, dx); 
        dx = Math.min(this.width - this.border - bx - 30, dx);
      } else if (slot.role === 'ATT') {
        dx = Math.min(cx - bx - 20, dx);
      }
      
      p.homeX = bx + dx;
      p.homeY = by + dy;
    });
  }
  
  private allocateDynamicRoles() {
    // We evaluate who should CHASE the ball.
    // Only one player from outfield per team can CHASE at a time.
    // Goalkeepers are excluded from standard allocation.
    
    // Team A allocation
    const outfieldA = this.players.filter(p => p.team === 'A' && p.baseRole !== 'GK');
    let bestDistA = Infinity;
    let chaserA: FifaPlayer | null = null;
    
    outfieldA.forEach(p => {
      const dx = this.ball.x - p.x;
      const dy = this.ball.y - p.y;
      const dist = dx * dx + dy * dy;
      
      // Reset state default
      if (p.fsmState === 'CHASE') p.fsmState = 'IDLE';
      
      // If user controls this player, they don't use FSM
      if (p.id === this.playerControlledId) return;
      
      if (dist < bestDistA) {
        bestDistA = dist;
        chaserA = p;
      }
    });
    
    if (chaserA && this.globalState === 'PLAYING') {
      (chaserA as FifaPlayer).fsmState = 'CHASE';
    }
    
    // Team B allocation
    const outfieldB = this.players.filter(p => p.team === 'B' && p.baseRole !== 'GK');
    let bestDistB = Infinity;
    let chaserB: FifaPlayer | null = null;
    
    outfieldB.forEach(p => {
      const dx = this.ball.x - p.x;
      const dy = this.ball.y - p.y;
      const dist = dx * dx + dy * dy;
      
      if (p.fsmState === 'CHASE') p.fsmState = 'IDLE';
      
      if (dist < bestDistB) {
        bestDistB = dist;
        chaserB = p;
      }
    });
    
    if (chaserB && this.globalState === 'PLAYING') {
      (chaserB as FifaPlayer).fsmState = 'CHASE';
    }
  }
  
  private updatePlayers() {
    this.players.forEach(p => {
      // Manage cooldowns
      if (p.dashCooldown > 0) p.dashCooldown--;
      
      // 1. Human Player Control
      if (p.id === this.playerControlledId) {
        this.controlHumanPlayer(p);
        return;
      }
      
      // 2. Goalkeeper AI Special Logic
      if (p.baseRole === 'GK') {
        this.updateGoalkeeperAI(p);
        return;
      }
      
      // 3. AI Players FSM
      if (this.globalState === 'SET_PIECE') {
        p.fsmState = 'WALK_TO_SET_PIECE';
        this.walkToSetPiecePosition(p);
        return;
      }
      
      const reactionDelayTicks = Math.floor((p.stats.reactionTime / 1000) * 60);
      const isDueToReact = (this.ticks - p.lastDecisionTick) >= reactionDelayTicks;
      
      // EVENT INTERRUPT: Force immediate evaluation if someone is extremely close or if ball state changed
      const oppTeam = p.team === 'A' ? 'B' : 'A';
      const isNearOpponent = this.players.some(o => o.team === oppTeam && Math.hypot(o.x - p.x, o.y - p.y) < 45);
      const isBallLoose = this.ball.ownerId === null;
      const forceInterrupt = isNearOpponent || (p.hasBall && isBallLoose);
      
      if (isDueToReact || forceInterrupt) {
        p.lastDecisionTick = this.ticks;
        this.runPlayerDecisionLoop(p);
      }
      
      // Execute continuous physics forces based on FSM State
      this.executeSteeringForces(p);
    });
  }
  
  // Human Player Controller (WASD + Mouse angle + clicks)
  private controlHumanPlayer(p: FifaPlayer) {
    let ax = 0;
    let ay = 0;
    
    if (this.keys['KeyW'] || this.keys['ArrowUp']) ay = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) ay = 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ax = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ax = 1;
    
    // Sprint toggle
    const doubleClickOrShift = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    p.isSprinting = doubleClickOrShift && p.stamina > 10;
    
    const speed = p.isSprinting ? p.stats.speed * 1.5 : p.stats.speed;
    if (p.isSprinting) {
      p.stamina = Math.max(0, p.stamina - 0.4);
    } else {
      p.stamina = Math.min(100, p.stamina + 0.15);
    }
    
    // Apply normal force
    let len = Math.sqrt(ax * ax + ay * ay);
    if (len > 0) {
      p.vx = (ax / len) * speed;
      p.vy = (ay / len) * speed;
    } else {
      p.vx *= 0.8;
      p.vy *= 0.8;
    }
    
    // Rotate toward cursor
    const dx = this.mouseX - p.x;
    const dy = this.mouseY - p.y;
    p.angle = Math.atan2(dy, dx);
    
    // Interactive mouse Click: Pass or Shoot
    if (p.hasBall) {
      const distToGoal = Math.hypot(p.x - (p.team === 'A' ? this.width - 40 : 40), p.y - this.height / 2);
      
      // If mouse clicked or space pressed
      if (this.mouseClicked || this.keys['Space']) {
        this.mouseClicked = false;
        
        if (distToGoal < 260 || this.keys['KeyE']) {
          // SHOOT
          this.shootBall(p, this.mouseX, this.mouseY);
        } else {
          // PASS toward cursor or nearest teammate in that direction
          this.passBallToTarget(p, this.mouseX, this.mouseY);
        }
      }
    }
  }
  
  private updateGoalkeeperAI(p: FifaPlayer) {
    const oppGoalX = p.team === 'A' ? this.border + 30 : this.width - this.border - 30;
    const isLoose = this.ball.ownerId === null;
    
    // GK stays inside penalty box area
    const penBoxMinX = p.team === 'A' ? 40 : this.width - 240;
    const penBoxMaxX = p.team === 'A' ? 240 : this.width - 40;
    const penBoxMinY = this.height / 2 - 150;
    const penBoxMaxY = this.height / 2 + 150;
    
    const ballInBox = this.ball.x > penBoxMinX && this.ball.x < penBoxMaxX && 
                     this.ball.y > penBoxMinY && this.ball.y < penBoxMaxY;
    
    if (p.hasBall) {
      // Kick it away deep into the field
      p.vx = 0; p.vy = 0;
      setTimeout(() => {
        const tx = p.team === 'A' ? this.width * 0.7 : this.width * 0.3;
        const ty = this.height / 2 + (Math.random() * 200 - 100);
        this.shootBall(p, tx, ty);
      }, 600);
      return;
    }
    
    if (ballInBox && isLoose && this.globalState === 'PLAYING') {
      // Rush out to collect ball
      this.seek(p, this.ball.x, this.ball.y);
      p.angle = Math.atan2(this.ball.y - p.y, this.ball.x - p.x);
    } else {
      // Track ball position vertically, but stay on GK line
      const targetY = Math.max(this.height / 2 - 60, Math.min(this.height / 2 + 60, this.ball.y));
      this.arrive(p, oppGoalX, targetY);
      p.angle = Math.atan2(this.ball.y - p.y, this.ball.x - p.x);
    }
  }
  
  private walkToSetPiecePosition(p: FifaPlayer) {
    // GK stays in goal, others spread out slightly
    const ballX = this.ball.x;
    const ballY = this.ball.y;
    
    if (this.setPieceType === 'KICK_OFF') {
      // Move toward homeX/homeY kickoff coordinates
      let hx = p.homeX;
      let hy = p.homeY;
      
      // Ensure everyone is on their half
      if (p.team === 'A' && hx > this.width / 2 - 25) hx = this.width / 2 - 35;
      if (p.team === 'B' && hx < this.width / 2 + 25) hx = this.width / 2 + 35;
      
      this.arrive(p, hx, hy);
      p.angle = Math.atan2(ballY - p.y, ballX - p.x);
    } else {
      // Throw-in / Corner: Move near the ball
      this.arrive(p, p.homeX, p.homeY);
      p.angle = Math.atan2(ballY - p.y, ballX - p.x);
    }
  }
  
  private runPlayerDecisionLoop(p: FifaPlayer) {
    if (this.globalState !== 'PLAYING') return;
    
    const isOwner = this.ball.ownerId === p.id;
    const oppTeam = p.team === 'A' ? 'B' : 'A';
    
    if (isOwner) {
      // ATTACKING STATE
      p.fsmState = 'ATTACKING';
      
      // Determine if we can sút (shoot)
      const goalX = p.team === 'A' ? this.width - 40 : 40;
      const goalY = this.height / 2;
      const distToGoal = Math.hypot(p.x - goalX, p.y - goalY);
      
      if (distToGoal < 280) {
        // Run Raycast to see if shooting lane is clear
        const topBlocked = this.isPassPathBlocked(p.x, p.y, goalX, goalY - 45, p.team);
        const botBlocked = this.isPassPathBlocked(p.x, p.y, goalX, goalY + 45, p.team);
        
        if (!topBlocked) {
          this.shootBall(p, goalX, goalY - 35);
          return;
        } else if (!botBlocked) {
          this.shootBall(p, goalX, goalY + 35);
          return;
        } else if (distToGoal < 160) {
          // Shoot anyway! Force of striker
          this.shootBall(p, goalX, goalY + (Math.random() * 60 - 30));
          return;
        }
      }
      
      // Check for a teammate to pass to
      const teammates = this.players.filter(t => t.team === p.team && t.id !== p.id && t.baseRole !== 'GK');
      let bestTeammate: FifaPlayer | null = null;
      let highestProgress = -Infinity;
      
      // Pass Cooldown (0.8s) to prevent infinite rapid ping-pong passing between teammates
      const isRecentlyPassed = (this.ticks - this.ball.lastOwnerTime) < 50;
      const wasPassedByTeammate = this.ball.lastOwnerId && 
                                  this.players.find(x => x.id === this.ball.lastOwnerId)?.team === p.team;
      const canPass = !(isRecentlyPassed && wasPassedByTeammate);
      
      teammates.forEach(t => {
        const dist = Math.hypot(t.x - p.x, t.y - p.y);
        if (dist > 350 || dist < 60) return; // Too far or too close
        
        // Progress is how much closer to opponent goal the teammate is compared to player
        const progress = p.team === 'A' ? (t.x - p.x) : (p.x - t.x);
        
        // Raycasting Vector Projection to verify passing lane
        const isBlocked = this.isPassPathBlocked(p.x, p.y, t.x, t.y, p.team);
        
        if (!isBlocked && progress > highestProgress) {
          highestProgress = progress;
          bestTeammate = t;
        }
      });
      
      if (bestTeammate && highestProgress > 40 && canPass) {
        // Pass the ball!
        this.passBallToPlayer(p, bestTeammate);
        return;
      }
      
      // Default: Dribble forward towards goal
      p.vx = p.team === 'A' ? p.stats.speed : -p.stats.speed;
      p.vy = (this.height / 2 - p.y) * 0.01;
      p.angle = Math.atan2(p.vy, p.vx);
      
    } else {
      // DEFENDING / SUPPORTING STATE
      const isLoose = this.ball.ownerId === null;
      
      if (p.fsmState === 'CHASE') {
        // Steer directly to ball at max speed
        p.isSprinting = true;
      } else {
        p.isSprinting = false;
        
        // Positioning / Kèm người / Chạy chỗ
        const opponentHoldingBall = this.players.find(o => o.team === oppTeam && o.hasBall);
        
        if (opponentHoldingBall) {
          p.fsmState = 'DEFENDING';
          
          // Defenders back off, midfielders mark
          if (p.baseRole === 'DEF') {
            // Place themselves between ball owner and their own goal
            const myGoalX = p.team === 'A' ? 40 : this.width - 40;
            const targetX = (opponentHoldingBall.x + myGoalX) / 2;
            const targetY = (opponentHoldingBall.y + this.height / 2) / 2;
            
            p.homeX = targetX;
            p.homeY = targetY;
          } else {
            // Find closest open opponent player and mark them
            const openOpponent = this.players.find(o => o.team === oppTeam && o.id !== opponentHoldingBall.id && o.baseRole !== 'GK');
            if (openOpponent) {
              // Stand slightly in front of them towards the ball
              p.homeX = openOpponent.x + (this.ball.x - openOpponent.x) * 0.3;
              p.homeY = openOpponent.y + (this.ball.y - openOpponent.y) * 0.3;
            }
          }
        } else {
          // Ball is loose or my team has it: Support/Positioning
          p.fsmState = 'IDLE';
        }
      }
    }
  }
  
  private executeSteeringForces(p: FifaPlayer) {
    if (p.fsmState === 'CHASE') {
      const speed = p.stats.speed * 1.25; // Sprint chasing (cân bằng lại với tốc độ chậm)
      this.seek(p, this.ball.x, this.ball.y, speed);
      p.angle = Math.atan2(this.ball.y - p.y, this.ball.x - p.x);
    } else if (p.fsmState === 'ATTACKING' && p.hasBall) {
      // Dribbling forward: Steer smoothly towards the opponent's goal instead of standing still or going home
      const goalX = p.team === 'A' ? this.width - 40 : 40;
      const goalY = this.height / 2;
      this.seek(p, goalX, goalY, p.stats.speed);
      p.angle = Math.atan2(goalY - p.y, goalX - p.x);
    } else if (p.fsmState === 'WALK_TO_SET_PIECE') {
      this.arrive(p, p.x, p.y); // Let set piece controller run it
    } else {
      // Move to ideal tactical position HomeX/HomeY
      this.arrive(p, p.homeX, p.homeY);
      
      // Orient facing the ball
      p.angle = Math.atan2(this.ball.y - p.y, this.ball.x - p.x);
    }
  }
  
  // Steering Behaviors
  private seek(p: FifaPlayer, tx: number, ty: number, speed = p.stats.speed) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      const desiredVx = (dx / dist) * speed;
      const desiredVy = (dy / dist) * speed;
      
      // Inertial steering weight
      p.vx = p.vx * 0.85 + desiredVx * 0.15;
      p.vy = p.vy * 0.85 + desiredVy * 0.15;
    }
  }
  
  private arrive(p: FifaPlayer, tx: number, ty: number, speed = p.stats.speed) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return;
    
    // Deceleration zone
    const decelRadius = 120;
    let targetSpeed = speed;
    if (dist < decelRadius) {
      targetSpeed = speed * (dist / decelRadius);
    }
    
    const desiredVx = (dx / dist) * targetSpeed;
    const desiredVy = (dy / dist) * targetSpeed;
    
    p.vx = p.vx * 0.85 + desiredVx * 0.15;
    p.vy = p.vy * 0.85 + desiredVy * 0.15;
    
    // Add Separation repulsive force to prevent teammates stacking together
    this.applySeparationForce(p);
  }
  
  private applySeparationForce(p: FifaPlayer) {
    const separationDistance = 45;
    let forceX = 0;
    let forceY = 0;
    let count = 0;
    
    this.players.forEach(other => {
      if (other.id === p.id || other.team !== p.team) return;
      
      const dx = p.x - other.x;
      const dy = p.y - other.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 0 && dist < separationDistance) {
        // Repulsive force proportional to proximity
        forceX += (dx / dist) * (separationDistance - dist) * 0.1;
        forceY += (dy / dist) * (separationDistance - dist) * 0.1;
        count++;
      }
    });
    
    if (count > 0) {
      p.vx += forceX;
      p.vy += forceY;
    }
  }
  
  // Vector Projection Raycasting
  public isPassPathBlocked(fromX: number, fromY: number, toX: number, toY: number, team: 'A' | 'B'): boolean {
    const oppTeam = team === 'A' ? 'B' : 'A';
    const opponents = this.players.filter(p => p.team === oppTeam);
    
    const wx = toX - fromX;
    const wy = toY - fromY;
    const L = Math.sqrt(wx * wx + wy * wy);
    if (L === 0) return false;
    
    const ux = wx / L;
    const uy = wy / L;
    
    const colRadiusSq = 25 * 25; // 25px blocking zone
    
    for (const opp of opponents) {
      const vx = opp.x - fromX;
      const vy = opp.y - fromY;
      const dProj = vx * ux + vy * uy; // Dot product (Hình chiếu)
      
      if (dProj < 0 || dProj > L) continue; // Opponent stands behind passer or past receiver
      
      const oppDistSq = vx * vx + vy * vy;
      const perpDistSq = oppDistSq - dProj * dProj; // Pythagoras to find perp distance square
      
      if (perpDistSq < colRadiusSq) {
        return true; // Path is BLOCKED!
      }
    }
    return false;
  }
  
  private shootBall(p: FifaPlayer, tx: number, ty: number) {
    p.hasBall = false;
    this.ball.ownerId = null;
    this.ball.lastOwnerId = p.id;
    this.ball.lastOwnerTime = this.ticks;
    
    // Add pass/shoot attempt to stats
    if (p.team === 'A') this.stats.shotsA++;
    else this.stats.shotsB++;
    
    // Compute shot vector
    let dx = tx - p.x;
    let dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    
    dx /= dist;
    dy /= dist;
    
    // Add slight randomized error based on shooting stats
    const skillMultiplier = (100 - p.stats.shooting) / 400; // lower stat = higher inaccuracy
    const errorAngle = (Math.random() - 0.5) * skillMultiplier;
    
    const finalAngle = Math.atan2(dy, dx) + errorAngle;
    const shootPower = 3.6 + (p.stats.shooting / 55); // power scale (3.6 to 5.4 speed, làm chậm thêm)
    
    this.ball.vx = Math.cos(finalAngle) * shootPower;
    this.ball.vy = Math.sin(finalAngle) * shootPower;
    
    // Releasing ball nudge
    this.ball.x = p.x + Math.cos(finalAngle) * (p.radius + this.ball.radius + 3);
    this.ball.y = p.y + Math.sin(finalAngle) * (p.radius + this.ball.radius + 3);
    
    this.addLog(`${p.name} tung cú SÚT cực mạnh!`, 'info');
  }
  
  private passBallToPlayer(p: FifaPlayer, target: FifaPlayer) {
    this.passBallToTarget(p, target.x, target.y);
  }
  
  private passBallToTarget(p: FifaPlayer, tx: number, ty: number) {
    p.hasBall = false;
    this.ball.ownerId = null;
    this.ball.lastOwnerId = p.id;
    this.ball.lastOwnerTime = this.ticks;
    
    if (p.team === 'A') this.stats.passesAttemptedA++;
    else this.stats.passesAttemptedB++;
    
    let dx = tx - p.x;
    let dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    
    dx /= dist;
    dy /= dist;
    
    // Add passing error
    const skillMultiplier = (100 - p.stats.passing) / 500;
    const errorAngle = (Math.random() - 0.5) * skillMultiplier;
    
    const finalAngle = Math.atan2(dy, dx) + errorAngle;
    const passPower = 2.1 + (p.stats.passing / 60); // 2.1 - 3.7 speed (làm chậm thêm)
    
    this.ball.vx = Math.cos(finalAngle) * passPower;
    this.ball.vy = Math.sin(finalAngle) * passPower;
    
    this.ball.x = p.x + Math.cos(finalAngle) * (p.radius + this.ball.radius + 3);
    this.ball.y = p.y + Math.sin(finalAngle) * (p.radius + this.ball.radius + 3);
  }
  
  // High efficiency User Switching with Steering Inertia preservation
  public switchControlledPlayer() {
    if (this.config.gameMode !== 'player') return;
    
    // Find Team A player closest to the ball, excluding the goalkeeper
    const outfieldAPlayers = this.players.filter(p => p.team === 'A' && p.baseRole !== 'GK');
    let bestDist = Infinity;
    let candidate: FifaPlayer | null = null;
    
    for (const p of outfieldAPlayers) {
      if (p.id === this.playerControlledId) continue;
      
      const dx = this.ball.x - p.x;
      const dy = this.ball.y - p.y;
      const dist = dx * dx + dy * dy;
      
      if (dist < bestDist) {
        bestDist = dist;
        candidate = p;
      }
    }
    
    if (candidate) {
      // 1. Old Controlled Player: reset, preserve current velocity for inertia steering
      const oldCtrl = this.players.find(p => p.id === this.playerControlledId);
      if (oldCtrl) {
        oldCtrl.lastDecisionTick = this.ticks;
        oldCtrl.fsmState = 'IDLE';
        // Vận tốc (vx, vy) được giữ nguyên, AI sẽ tiếp đà quán tính
      }
      
      // 2. Assign control to candidate
      this.playerControlledId = (candidate as FifaPlayer).id;
      this.addLog(`Đổi quyền điều khiển sang: ${candidate.name}`, 'info');
    }
  }
  
  private updatePhysics() {
    const ballFriction = 0.968; // Tăng thêm ma sát để bóng dừng êm ái tự nhiên hơn ở tốc độ chậm
    
    // 1. Ball physical velocity & friction
    if (this.ball.ownerId === null) {
      this.ball.x += this.ball.vx;
      this.ball.y += this.ball.vy;
      
      this.ball.vx *= ballFriction;
      this.ball.vy *= ballFriction;
    }
    
    // 2. Players physical movement & soft-lock attraction
    this.players.forEach(p => {
      if (this.globalState === 'PLAYING') {
        p.x += p.vx;
        p.y += p.vy;
      } else {
        // Set piece walking: slower
        p.x += p.vx * 0.6;
        p.y += p.vy * 0.6;
      }
      
      // Soft-lock ball attraction logic
      if (this.ball.ownerId === p.id) {
        p.hasBall = true;
        
        // Spot in front of feet
        const dribbleDist = p.radius + this.ball.radius + 1.5;
        const targetX = p.x + Math.cos(p.angle) * dribbleDist;
        const targetY = p.y + Math.sin(p.angle) * dribbleDist;
        
        // Soft-lock physical suction force (smooth attraction)
        const k = 0.22; // suction force coefficient (giảm chấn, giúp cướp bóng mượt mà hơn)
        this.ball.x = this.ball.x * (1 - k) + targetX * k;
        this.ball.y = this.ball.y * (1 - k) + targetY * k;
        
        this.ball.vx = p.vx;
        this.ball.vy = p.vy;
        
        // Update stats
        if (p.team === 'A') {
          this.ballPossessionTicksA++;
        } else {
          this.ballPossessionTicksB++;
        }
      } else {
        p.hasBall = false;
      }
    });
    
    // Update dynamic possession percentage
    const totalPossession = this.ballPossessionTicksA + this.ballPossessionTicksB;
    if (totalPossession > 0) {
      this.stats.possessionA = Math.round((this.ballPossessionTicksA / totalPossession) * 100);
      this.stats.possessionB = 100 - this.stats.possessionA;
    }
    
    // 3. Collision detection: Player-to-player circles
    this.handlePlayerCollisions();
    
    // 4. Collision: Player-to-ball capture (tackling & picking up)
    if (this.globalState === 'PLAYING') {
      this.handleBallCapture();
    }
  }
  
  private handlePlayerCollisions() {
    for (let i = 0; i < this.players.length; i++) {
      const pi = this.players[i];
      for (let j = i + 1; j < this.players.length; j++) {
        const pj = this.players[j];
        
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const dist = Math.hypot(dx, dy);
        const minDist = pi.radius + pj.radius;
        
        if (dist < minDist) {
          // Push apart equally
          const overlap = minDist - dist;
          const pushX = (dx / (dist || 1)) * overlap * 0.5;
          const pushY = (dy / (dist || 1)) * overlap * 0.5;
          
          pj.x += pushX;
          pj.y += pushY;
          pi.x -= pushX;
          pi.y -= pushY;
        }
      }
    }
  }
  
  private handleBallCapture() {
    const isLoose = this.ball.ownerId === null;
    
    this.players.forEach(p => {
      const dx = this.ball.x - p.x;
      const dy = this.ball.y - p.y;
      const dist = Math.hypot(dx, dy);
      
      const captureRadius = p.radius + this.ball.radius + 2;
      
      if (dist < captureRadius) {
        if (isLoose) {
          // Pick up ball if not locked out
          const isRecentlyOwnedByMe = this.ball.lastOwnerId === p.id && (this.ticks - this.ball.lastOwnerTime) < 30;
          if (!isRecentlyOwnedByMe) {
            this.ball.ownerId = p.id;
            p.hasBall = true;
            this.tackleImmunityTicks = 25; // 0.4s immunity after picking up loose ball
            
            // Check if pass completed
            if (this.ball.lastOwnerId) {
              const lastOwner = this.players.find(x => x.id === this.ball.lastOwnerId);
              if (lastOwner && lastOwner.team === p.team) {
                if (p.team === 'A') this.stats.passesA++;
                else this.stats.passesB++;
              }
            }
          }
        } else if (this.ball.ownerId !== p.id) {
          // TACKLE: Try to steal ball from opponent
          if (this.tackleImmunityTicks > 0) {
            return; // Ball has tackle protection immunity
          }
          
          const owner = this.players.find(x => x.id === this.ball.ownerId)!;
          if (owner.team !== p.team) {
            // Probability depends on defending vs passing/speed stats
            const tackleChance = 0.015 + (p.stats.defending / 4000); // balance probability
            
            if (Math.random() < tackleChance) {
              // Successfully stole the ball!
              this.ball.ownerId = p.id;
              p.hasBall = true;
              owner.hasBall = false;
              
              // Trigger instant reaction loop for tackled owner (Interrupt)
              owner.lastDecisionTick = 0; 
              
              this.ball.lastOwnerId = owner.id;
              this.ball.lastOwnerTime = this.ticks;
              this.tackleImmunityTicks = 45; // 0.75s of tackle protection for the new owner
              
              if (p.team === 'A') this.stats.tacklesA++;
              else this.stats.tacklesB++;
              
              this.addLog(`${p.name} cướp bóng ngoạn mục trong chân ${owner.name}!`, 'info');
            }
          }
        }
      }
    });
  }
  
  private checkPitchBoundaries() {
    if (this.globalState !== 'PLAYING') return;
    
    const bx = this.ball.x;
    const by = this.ball.y;
    
    // Bounds boundaries
    const minX = this.border;
    const maxX = this.width - this.border;
    const minY = this.border;
    const maxY = this.height - this.border;
    
    // Goal post dimensions
    const goalYMin = this.height / 2 - 70;
    const goalYMax = this.height / 2 + 70;
    
    // Left boundary check
    if (bx < minX) {
      if (by > goalYMin && by < goalYMax) {
        this.triggerGoal('B'); // Goal for Team B!
      } else {
        this.triggerSetPiece('GOAL_KICK', 'A'); // Out of bounds by left side
      }
    }
    // Right boundary check
    else if (bx > maxX) {
      if (by > goalYMin && by < goalYMax) {
        this.triggerGoal('A'); // Goal for Team A!
      } else {
        this.triggerSetPiece('GOAL_KICK', 'B');
      }
    }
    // Sideline checks
    else if (by < minY || by > maxY) {
      this.triggerSetPiece('THROW_IN', bx < this.width / 2 ? 'A' : 'B');
    }
  }
  
  private triggerGoal(scoringTeam: 'A' | 'B') {
    this.globalState = 'GOAL_CELEBRATION';
    this.celebrationTimer = 150; // 2.5 seconds at 60 FPS
    
    if (scoringTeam === 'A') {
      this.stats.scoreA++;
      const attackers = this.players.filter(p => p.team === 'A' && p.baseRole === 'ATT');
      const scorer = attackers[Math.floor(Math.random() * attackers.length)];
      this.celebrationPlayerId = scorer ? scorer.id : null;
      this.addLog(`VÀOOOOO! ${scorer ? scorer.name : 'Team A'} ghi bàn thắng tuyệt đẹp nâng tỷ số lên ${this.stats.scoreA} - ${this.stats.scoreB}!`, 'goal');
    } else {
      this.stats.scoreB++;
      const attackers = this.players.filter(p => p.team === 'B' && p.baseRole === 'ATT');
      const scorer = attackers[Math.floor(Math.random() * attackers.length)];
      this.celebrationPlayerId = scorer ? scorer.id : null;
      this.addLog(`VÀOOOOO! ${scorer ? scorer.name : 'Team B'} sút tung lưới Team A! Tỷ số: ${this.stats.scoreA} - ${this.stats.scoreB}!`, 'goal');
    }
  }
  
  private updateCelebration() {
    this.celebrationTimer--;
    
    // Scorer runs towards a corner to celebrate, others stand or run near
    if (this.celebrationPlayerId) {
      const scorer = this.players.find(p => p.id === this.celebrationPlayerId);
      if (scorer) {
        scorer.fsmState = 'CELEBRATE';
        const targetX = scorer.team === 'A' ? this.width - 100 : 100;
        const targetY = 100;
        this.seek(scorer, targetX, targetY, scorer.stats.speed * 1.2);
        scorer.angle = Math.atan2(targetY - scorer.y, targetX - scorer.x);
        
        // Teammates chase scorer to celebrate
        this.players.forEach(p => {
          if (p.team === scorer.team && p.id !== scorer.id) {
            p.fsmState = 'CELEBRATE';
            this.seek(p, scorer.x, scorer.y, p.stats.speed * 0.9);
            p.angle = Math.atan2(scorer.y - p.y, scorer.x - p.x);
          }
        });
      }
    }
    
    if (this.celebrationTimer <= 0) {
      // Reset after celebration
      const concedingTeam = this.celebrationPlayerId?.startsWith('A') ? 'A' : 'B';
      this.resetPlayersForKickOff(concedingTeam);
    }
  }
  
  private triggerSetPiece(type: SetPieceType, team: 'A' | 'B') {
    this.globalState = 'SET_PIECE';
    this.setPieceType = type;
    this.setPieceTeam = team;
    
    this.ball.ownerId = null;
    this.ball.vx = 0; this.ball.vy = 0;
    
    // Position ball at boundaries
    if (type === 'THROW_IN') {
      this.ball.y = this.ball.y < this.height / 2 ? this.border + 5 : this.height - this.border - 5;
    } else if (type === 'GOAL_KICK') {
      this.ball.x = team === 'A' ? this.border + 50 : this.width - this.border - 50;
      this.ball.y = this.height / 2;
    }
    
    // Pause players, force walking
    this.players.forEach(p => {
      p.fsmState = 'WALK_TO_SET_PIECE';
      p.vx = 0; p.vy = 0;
    });
    
    this.addLog(`Còi cất lên! Quả ${type === 'THROW_IN' ? 'ném biên' : 'phát bóng lên'} cho Đội ${team}`, 'info');
    
    // Auto-take set piece after 1.5s delay
    setTimeout(() => {
      if (this.globalState === 'SET_PIECE') {
        this.takeSetPiece();
      }
    }, 1500);
  }
  
  private takeSetPiece() {
    this.globalState = 'PLAYING';
    this.setPieceType = null;
    
    // Find kicker
    const kicker = this.players
      .filter(p => p.team === this.setPieceTeam && p.baseRole !== 'GK')
      .reduce((prev, curr) => {
        const dPrev = Math.hypot(prev.x - this.ball.x, prev.y - this.ball.y);
        const dCurr = Math.hypot(curr.x - this.ball.x, curr.y - this.ball.y);
        return dCurr < dPrev ? curr : prev;
      });
      
    kicker.x = this.ball.x - (this.setPieceTeam === 'A' ? 20 : -20);
    kicker.y = this.ball.y;
    
    // Pick open teammate
    const teammates = this.players.filter(p => p.team === this.setPieceTeam && p.id !== kicker.id && p.baseRole !== 'GK');
    const receiver = teammates[Math.floor(Math.random() * teammates.length)];
    
    this.passBallToPlayer(kicker, receiver);
    this.addLog(`${kicker.name} thực hiện quả đá phạt!`, 'info');
  }
  
  // LEVEL 3: DIRECTOR AI Huấn luyện viên thay đổi sơ đồ
  private updateDirectorAI() {
    if (this.globalState !== 'PLAYING') return;
    if (this.ticks % 180 !== 0) return; // run check every 3s
    
    const minutes = this.simulatedMinutes;
    
    // TEAM A Director AI
    if (minutes >= 75 && this.stats.scoreA < this.stats.scoreB) {
      if (this.currentFormationA !== '3-5-2') {
        this.currentFormationA = '3-5-2';
        this.shiftFactorX = 0.24; // push team high
        this.addLog(`DIRECTOR AI TEAM A: Phút ${minutes}+ đang bị dẫn! Chuyển sang tấn công tổng lực '3-5-2' (All-out Attack)!`, 'director');
        this.reapplyFormations();
      }
    } else if (minutes >= 80 && this.stats.scoreA > this.stats.scoreB) {
      if (this.currentFormationA !== '5-4-1') {
        this.currentFormationA = '5-4-1';
        this.shiftFactorX = 0.12; // pull defensive line back
        this.addLog(`DIRECTOR AI TEAM A: Phút ${minutes}+ đang thắng thế! Chuyển sang phòng ngự tử thủ '5-4-1' (Park the Bus)!`, 'director');
        this.reapplyFormations();
      }
    }
    
    // TEAM B Director AI
    if (minutes >= 75 && this.stats.scoreB < this.stats.scoreA) {
      if (this.currentFormationB !== '3-5-2') {
        this.currentFormationB = '3-5-2';
        this.addLog(`DIRECTOR AI TEAM B: Phút ${minutes}+ đang bị dẫn! Chuyển sang tấn công tổng lực '3-5-2' (All-out Attack)!`, 'director');
        this.reapplyFormations();
      }
    } else if (minutes >= 80 && this.stats.scoreB > this.stats.scoreA) {
      if (this.currentFormationB !== '5-4-1') {
        this.currentFormationB = '5-4-1';
        this.addLog(`DIRECTOR AI TEAM B: Phút ${minutes}+ đang dẫn điểm! Chuyển sơ đồ tử thủ '5-4-1' (Park the Bus) bảo vệ tỷ số!`, 'director');
        this.reapplyFormations();
      }
    }
  }
  
  private reapplyFormations() {
    // Modify active player base roles based on new formation mapping
    const teamAOutfield = this.players.filter(p => p.team === 'A' && p.baseRole !== 'GK');
    const formA = this.getOutfieldSlots(FORMATIONS[this.currentFormationA], this.config.playerCount);
    teamAOutfield.forEach((p, idx) => {
      if (formA[idx]) p.baseRole = formA[idx].role;
    });
    
    const teamBOutfield = this.players.filter(p => p.team === 'B' && p.baseRole !== 'GK');
    const formB = this.getOutfieldSlots(FORMATIONS[this.currentFormationB], this.config.playerCount);
    teamBOutfield.forEach((p, idx) => {
      if (formB[idx]) p.baseRole = formB[idx].role;
    });
  }
  
  // Custom HUD and strategic control panel triggers
  public forceFormation(team: 'A' | 'B', formation: '4-3-3' | '4-4-2' | '3-5-2' | '5-4-1') {
    if (team === 'A') {
      this.currentFormationA = formation;
      this.addLog(`Director AI: Huấn luyện viên thủ công thay đổi sơ đồ Team A sang ${formation}`, 'director');
    } else {
      this.currentFormationB = formation;
      this.addLog(`Director AI: Huấn luyện viên thủ công thay đổi sơ đồ Team B sang ${formation}`, 'director');
    }
    this.reapplyFormations();
  }
  
  public addLog(text: string, type: 'info' | 'goal' | 'director') {
    const timeStr = `${this.simulatedMinutes.toString().padStart(2, '0')}:${this.simulatedSeconds.toString().padStart(2, '0')}`;
    this.logs.unshift({ text, time: timeStr, type });
    if (this.logs.length > 25) this.logs.pop(); // keep log array short
  }
  
  public restartGame() {
    this.ticks = 0;
    this.simulatedMinutes = 0;
    this.simulatedSeconds = 0;
    this.maxMatchMinutes = 90;
    this.isGameOverProcessed = false;
    this.stats.scoreA = 0;
    this.stats.scoreB = 0;
    this.stats.shotsA = 0;
    this.stats.shotsB = 0;
    this.stats.passesA = 0;
    this.stats.passesAttemptedA = 0;
    this.stats.passesB = 0;
    this.stats.passesAttemptedB = 0;
    this.stats.tacklesA = 0;
    this.stats.tacklesB = 0;
    this.ballPossessionTicksA = 0;
    this.ballPossessionTicksB = 0;
    this.globalState = 'SET_PIECE';
    this.setPieceType = 'KICK_OFF';
    this.setPieceTeam = 'A';
    this.logs = [];
    
    this.initPitch();
    this.addLog("Trận đấu mới được khởi tranh! Sơ đồ: " + this.config.formationA + " vs " + this.config.formationB, 'info');
  }
  
  public continueMatch() {
    this.maxMatchMinutes += 30; // extend match duration
    this.globalState = 'PLAYING';
    this.addLog(`ĐÁ TIẾP HIỆP PHỤ: Trận đấu bù giờ thêm +30 phút! Giới hạn mới: ${this.maxMatchMinutes} phút.`, 'goal');
  }
  
  // High performance DOM HUD renderer - completely avoids React Re-renders
  private updateDOM(force = false) {
    if (!this.dom.scoreA) return; // DOM elements not bound yet
    
    const isMajorTick = this.ticks % 10 === 0 || force;
    if (!isMajorTick) return;
    
    const timeStr = `${this.simulatedMinutes.toString().padStart(2, '0')}:${this.simulatedSeconds.toString().padStart(2, '0')}`;
    
    if (this.dom.scoreA) this.dom.scoreA.textContent = this.stats.scoreA.toString();
    if (this.dom.scoreB) this.dom.scoreB.textContent = this.stats.scoreB.toString();
    if (this.dom.time) this.dom.time.textContent = timeStr;
    if (this.dom.possessionA) this.dom.possessionA.textContent = `${this.stats.possessionA}%`;
    if (this.dom.possessionB) this.dom.possessionB.textContent = `${this.stats.possessionB}%`;
    if (this.dom.shotsA) this.dom.shotsA.textContent = this.stats.shotsA.toString();
    if (this.dom.shotsB) this.dom.shotsB.textContent = this.stats.shotsB.toString();
    if (this.dom.passesA) this.dom.passesA.textContent = `${this.stats.passesA}/${this.stats.passesAttemptedA}`;
    if (this.dom.passesB) this.dom.passesB.textContent = `${this.stats.passesB}/${this.stats.passesAttemptedB}`;
    
    // Update director logs scroll
    if (this.dom.directorLogs && (this.ticks % 20 === 0 || force)) {
      this.dom.directorLogs.innerHTML = this.logs.map(l => {
        let color = 'text-slate-400';
        if (l.type === 'goal') color = 'text-emerald-400 font-bold';
        else if (l.type === 'director') color = 'text-purple-400 font-bold';
        
        return `<div class="text-xs font-mono py-1 border-b border-slate-900 flex gap-2">
          <span class="text-cyan-400">${l.time}</span>
          <span class="${color}">${l.text}</span>
        </div>`;
      }).join('');
    }
  }
}
