import React from 'react';
import { Gamepad2, Lock, Trophy, Sparkles, Cpu, ChevronRight } from 'lucide-react';

interface GameCard {
  id: string;
  name: string;
  vietnameseName: string;
  description: string;
  size: string;
  active: boolean;
  algorithms: string[];
  difficulty: string;
  imageGlow: string;
}

export default function SelectGameScreen({ onSelectGame }: { onSelectGame: (gameId: 'caro' | 'racing' | 'football') => void }) {
  const games: GameCard[] = [
    {
      id: 'caro',
      name: 'GOMOKU / CARO',
      vietnameseName: 'Cờ Caro 20x20',
      description: 'Chế độ đấu trường AI. Huấn luyện các thế cờ từ con số 0 dựa trên giải thuật di truyền và học tăng cường.',
      size: '20x20 Grid',
      active: true,
      algorithms: ['Heuristic + Minimax', 'MCTS UCT', 'Genetic Brains'],
      difficulty: 'Tự động tiến hóa',
      imageGlow: 'from-purple-500/20 to-cyan-500/20'
    },
    {
      id: 'racing',
      name: 'RACING / ĐUA XE AI',
      vietnameseName: 'Đua Xe Mô Phỏng AI',
      description: 'Huấn luyện thế hệ xe tự lái bằng mạng nơ-ron nhân tạo kết hợp giải thuật di truyền. Tránh chướng ngại vật và đường cua hiểm trở.',
      size: 'Vector Track',
      active: true,
      algorithms: ['Neural Network', 'Genetic Algorithm', 'Raycasting Sensors'],
      difficulty: 'Tiến hóa liên tục',
      imageGlow: 'from-pink-500/20 to-rose-500/20'
    },
    {
      id: 'football',
      name: 'ANN FOOTBALL / BÓNG ĐÁ GA',
      vietnameseName: 'Học Máy Bóng Đá GA',
      description: 'Huấn luyện AI đá bóng qua các bước tìm bóng, ghi bàn, 1vs1 sử dụng Mạng Nơ-ron nhân tạo và Học sâu tiến hóa.',
      size: '800x500 Pitch',
      active: true,
      algorithms: ['Curriculum Learning', 'Neural Network', 'Genetic Algorithm'],
      difficulty: 'Tiến hóa liên tục',
      imageGlow: 'from-emerald-500/20 to-teal-500/20'
    },
    {
      id: 'xiangqi',
      name: 'XIANGQI / CỜ TƯỚNG',
      vietnameseName: 'Cờ Tướng Trận Giả',
      description: 'Đại chiến biên cương. Mô phỏng đường đi quân sĩ, tịnh hiểm hóc kết hợp cắt tỉa Alpha-Beta sâu.',
      size: '9x10 Grid',
      active: false,
      algorithms: ['Piece-Square Tables', 'Minimax'],
      difficulty: 'Sắp ra mắt',
      imageGlow: 'from-blue-500/10 to-indigo-500/10'
    }
  ];

  return (
    <div className="select-game-container flex flex-col items-center">
      {/* Brand Header */}
      <div className="brand-header animate-fade-in">
        <div className="glow-badge-purple pulse-glow-purple">
          <Sparkles className="w-4 h-4" />
          <span>Hệ Thống Huấn Luyện AI Tự Động</span>
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 neon-text-gradient">
          AI GAME ARENA
        </h1>
        <p className="text-slate-400 text-lg font-light max-w-2xl mx-auto leading-relaxed">
          Chọn một môn cờ hoặc game mô phỏng để bắt đầu cấu hình, khởi tạo thế hệ bộ não AI mới và tiến hành giám sát tiến trình thi đấu thời gian thực.
        </p>
      </div>

      {/* Grid of Games */}
      <div className="game-grid w-full">
        {games.map((game, idx) => (
          <div
            key={game.id}
            onClick={game.active ? () => onSelectGame(game.id as 'caro' | 'racing' | 'football') : undefined}
            className={`glass-panel game-card relative overflow-hidden p-8 flex flex-col justify-between h-[340px] cursor-pointer ${
              game.active ? 'glow-border-purple' : 'opacity-70'
            }`}
            style={{
              animationDelay: `${idx * 100}ms`
            }}
          >
            {/* Background Ambient Glow */}
            <div className="card-ambient-glow" />

            {/* Header info */}
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="mono text-xs tracking-wider text-purple-400 font-bold mb-1 block">
                    {game.name}
                  </span>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {game.vietnameseName}
                  </h2>
                </div>
                <span className={`size-badge mono ${game.active ? 'size-badge-active' : 'text-slate-500'}`}>
                  {game.size}
                </span>
              </div>

              <p className="text-slate-400 text-sm font-light leading-relaxed mb-6">
                {game.description}
              </p>

              {/* Technologies List */}
              <div className="alg-list">
                {game.algorithms.map((alg) => (
                  <span key={alg} className="alg-badge mono">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    {alg}
                  </span>
                ))}
              </div>
            </div>

            {/* Footer / CTA */}
            <div className="flex justify-between items-center pt-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400 font-mono">
                  {game.difficulty}
                </span>
              </div>

              {game.active ? (
                <button className="cyber-btn cyber-btn-purple text-xs py-25 px-4">
                  Chọn Trò Chơi
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="lock-badge mono">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sắp Ra Mắt</span>
                </div>
              )}
            </div>

            {/* Lock Overlay for non-active games */}
            {!game.active && (
              <div className="lock-overlay">
                <div className="lock-message font-mono">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Cập nhật trong phiên bản tiếp theo</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="mt-16 text-center text-xs text-slate-500 font-mono">
        <p>AI Arena v1.0.0 • Phát triển bởi Tran Trung Thanh</p>
      </div>
    </div>
  );
}
