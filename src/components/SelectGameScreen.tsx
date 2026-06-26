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

export default function SelectGameScreen({ onSelectGame }: { onSelectGame: (gameId: 'caro' | 'racing' | 'flappy' | '2048' | 'qmaze' | 'connect4' | 'soccer' | 'tag') => void }) {
  // Sắp xếp theo ĐỘ KHÓ LẬP TRÌNH tăng dần (dễ → khó)
  const games: GameCard[] = [
    {
      id: 'flappy',
      name: 'FLAPPY BIRD',
      vietnameseName: 'Flappy Bird',
      description: 'Đàn chim do AI điều khiển tự học vượt ống và giỏi dần qua từng thế hệ (mạng nơ-ron + tiến hóa di truyền). Có chế độ tự chơi.',
      size: 'Né chướng ngại',
      active: true,
      algorithms: ['Mạng nơ-ron', 'Tiến hóa di truyền', 'Neuroevolution'],
      difficulty: 'Lập trình: Dễ',
      imageGlow: 'from-amber-500/20 to-yellow-500/20'
    },
    {
      id: 'qmaze',
      name: 'MÊ CUNG AI',
      vietnameseName: 'Robot Thoát Mê Cung',
      description: 'AI tự học cách tìm đường ngắn nhất ra khỏi mê cung bằng học tăng cường. Xem bản đồ nhiệt và mũi tên chỉ đường sáng dần lên.',
      size: 'Tìm đường',
      active: true,
      algorithms: ['Q-Learning', 'Học tăng cường', 'ε-greedy'],
      difficulty: 'Lập trình: Vừa',
      imageGlow: 'from-blue-500/20 to-indigo-500/20'
    },
    {
      id: '2048',
      name: '2048',
      vietnameseName: 'Game 2048',
      description: 'AI tự chơi 2048 để gộp ô đạt 2048 và hơn nữa, với hoạt ảnh mượt. Bạn cũng có thể tự chơi bằng phím mũi tên.',
      size: 'Lưới 4×4',
      active: true,
      algorithms: ['Tìm kiếm Expectimax', 'Hàm đánh giá', 'Heuristic'],
      difficulty: 'Lập trình: Vừa+',
      imageGlow: 'from-orange-500/20 to-amber-500/20'
    },
    {
      id: 'connect4',
      name: 'CONNECT FOUR',
      vietnameseName: 'Cờ Thả 4 Quân',
      description: 'Thả quân vào cột, ai nối được 4 quân thẳng hàng (ngang/dọc/chéo) sẽ thắng. AI tính nước bằng Minimax + cắt tỉa Alpha-Beta. Đấu với máy hoặc xem máy đấu máy.',
      size: 'Bàn 7×6',
      active: true,
      algorithms: ['Minimax', 'Cắt tỉa Alpha-Beta', 'Heuristic'],
      difficulty: 'Lập trình: Vừa+',
      imageGlow: 'from-red-500/20 to-yellow-500/20'
    },
    {
      id: 'racing',
      name: 'ĐUA XE AI',
      vietnameseName: 'Đua Xe Tự Lái',
      description: 'Đàn xe tự học lái, né chướng ngại và ôm cua bằng cảm biến tia quét (mạng nơ-ron + tiến hóa di truyền). Có trình tạo đường đua.',
      size: 'Đường đua',
      active: true,
      algorithms: ['Mạng nơ-ron', 'Tiến hóa di truyền', 'Cảm biến tia quét'],
      difficulty: 'Lập trình: Khó',
      imageGlow: 'from-pink-500/20 to-rose-500/20'
    },
    {
      id: 'caro',
      name: 'CỜ CARO',
      vietnameseName: 'Cờ Caro (Gomoku)',
      description: 'Đấu trường cờ caro 20×20. Hai AI đối đầu bằng Minimax + MCTS và hàm đánh giá thế cờ, huấn luyện từ con số 0.',
      size: 'Lưới 20×20',
      active: true,
      algorithms: ['Minimax', 'MCTS UCT', 'Heuristic thế cờ'],
      difficulty: 'Lập trình: Rất khó',
      imageGlow: 'from-purple-500/20 to-cyan-500/20'
    },
    {
      id: 'soccer',
      name: 'BÓNG ĐÁ AI 3D',
      vietnameseName: 'Đấu Trường Bóng Đá',
      description: 'Phòng đấu 3D rộng: hai AI tự học di chuyển, sút bóng riêng biệt (độ cao tùy vị trí bóng), nhảy cao né tránh & tranh bóng bổng có cooldown, va chạm cứng có phản lực và lưới vát gôn thực tế. AI tự học và giỏi dần qua các thế hệ.',
      size: 'Sân 3D vát gôn',
      active: true,
      algorithms: ['Mạng nơ-ron', 'Tiến hóa di truyền', 'Nhảy cao & Dẫn bóng'],
      difficulty: 'Lập trình: Rất khó',
      imageGlow: 'from-violet-500/20 to-fuchsia-500/20'
    },
    {
      id: 'tag',
      name: 'ĐUỔI BẮT AI 3D',
      vietnameseName: 'Đuổi Bắt 3D',
      description: 'Phòng 3D kín với 4 trụ cột: AI đỏ (Chaser) tự học đuổi theo, AI xanh (Evader) tự học trốn tránh. Hai AI tiến hoá song song — đuổi bắt càng ngày càng trở nên khéo léo và căng thẳng hơn.',
      size: 'Phòng 3D kín',
      active: true,
      algorithms: ['Mạng nơ-ron', 'Tiến hóa di truyền', 'Đối kháng cùng lúc'],
      difficulty: 'Lập trình: Rất khó',
      imageGlow: 'from-red-500/20 to-green-500/20'
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
            onClick={game.active ? () => onSelectGame(game.id as 'caro' | 'racing' | 'flappy' | '2048' | 'qmaze' | 'connect4' | 'soccer' | 'tag') : undefined}
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
