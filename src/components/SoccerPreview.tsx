import { useEffect, useRef } from 'react';
import { createWorld2, stepWorld2, SOCCER2, Soccer2World } from '../utils/soccer2';

// Bản xem trước nhẹ: mô phỏng top-down 2D của đấu trường bóng đá đang học.
export default function SoccerPreview({ size = 380, mutationRate = 0.1 }: { size?: number; mutationRate?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<Soccer2World>(createWorld2());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const W = canvas.width, H = canvas.height;
    const pad = 16;
    const sx = (W - pad * 2) / SOCCER2.LENGTH;
    const sy = (H - pad * 2) / SOCCER2.WIDTH;
    const toX = (x: number) => pad + (x + SOCCER2.LENGTH / 2) * sx;
    const toY = (y: number) => pad + (y + SOCCER2.WIDTH / 2) * sy;
    let raf = 0;

    const draw = () => {
      const w = worldRef.current;
      stepWorld2(w, mutationRate);

      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, W, H);

      // Sân
      ctx.fillStyle = '#2b2f35';
      ctx.fillRect(toX(-SOCCER2.LENGTH / 2), toY(-SOCCER2.WIDTH / 2), SOCCER2.LENGTH * sx, SOCCER2.WIDTH * sy);

      // Lưới ô vuông
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const x = toX(-SOCCER2.LENGTH / 2 + (SOCCER2.LENGTH / 10) * i);
        ctx.beginPath(); ctx.moveTo(x, toY(-SOCCER2.WIDTH / 2)); ctx.lineTo(x, toY(SOCCER2.WIDTH / 2)); ctx.stroke();
      }
      for (let i = 0; i <= 6; i++) {
        const y = toY(-SOCCER2.WIDTH / 2 + (SOCCER2.WIDTH / 6) * i);
        ctx.beginPath(); ctx.moveTo(toX(-SOCCER2.LENGTH / 2), y); ctx.lineTo(toX(SOCCER2.LENGTH / 2), y); ctx.stroke();
      }

      // Khung thành
      const gy1 = toY(-SOCCER2.GOAL_W / 2), gy2 = toY(SOCCER2.GOAL_W / 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ff7a18';
      ctx.beginPath(); ctx.moveTo(toX(-SOCCER2.LENGTH / 2), gy1); ctx.lineTo(toX(-SOCCER2.LENGTH / 2), gy2); ctx.stroke();
      ctx.strokeStyle = '#2f86ff';
      ctx.beginPath(); ctx.moveTo(toX(SOCCER2.LENGTH / 2), gy1); ctx.lineTo(toX(SOCCER2.LENGTH / 2), gy2); ctx.stroke();

      // Cầu thủ
      const drawP = (px: number, py: number, color: string) => {
        const r = SOCCER2.PLAYER_R * sx;
        ctx.fillStyle = color;
        ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.fillRect(toX(px) - r, toY(py) - r, r * 2, r * 2);
        ctx.shadowBlur = 0;
      };
      drawP(w.orange.x, w.orange.y, '#ff7a18');
      drawP(w.blue.x, w.blue.y, '#2f86ff');

      // Bóng (kích thước tăng nhẹ theo độ cao)
      const br = (SOCCER2.BALL_R + (w.ball.z - SOCCER2.BALL_R) * 0.15) * sx;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(toX(w.ball.x), toY(w.ball.y), Math.max(3, br), 0, Math.PI * 2); ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mutationRate]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={Math.round(size * (SOCCER2.WIDTH / SOCCER2.LENGTH))}
      className="max-w-full border border-slate-900 rounded-xl shadow-2xl"
    />
  );
}
