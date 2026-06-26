import { useEffect, useRef } from 'react';
import { generateMaze, createAgent, qStep } from '../utils/qmaze';
import { drawQMaze } from '../utils/renderQMaze';

// Demo Q-learning tự học ở menu: học nhanh, định kỳ đổi mê cung để xem heatmap hội tụ.
export default function QMazePreview({ size = 320, gridSize = 10 }: { size?: number; gridSize?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let maze = generateMaze(gridSize);
    let agent = createAgent(maze);
    let raf = 0;
    let alive = true;

    const loop = () => {
      if (!alive) return;
      for (let i = 0; i < 50; i++) qStep(agent, maze);
      // Đổi mê cung định kỳ để demo đa dạng
      if (agent.episode > 140) { maze = generateMaze(gridSize); agent = createAgent(maze); }
      drawQMaze(ctx, maze, agent, size);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [size, gridSize]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl border border-slate-800 shadow-2xl"
      style={{ width: size, height: size, background: '#0b1220' }}
    />
  );
}
