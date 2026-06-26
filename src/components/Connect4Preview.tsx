import { useEffect, useRef } from 'react';
import { newBoard, dropRow, findWin, isFull, bestMove, COLS, ROWS, Board } from '../utils/connect4';
import { drawConnect4, landingY } from '../utils/renderConnect4';

// Demo máy đấu máy Connect Four ở menu (có hoạt ảnh thả quân, tự chơi lại).
export default function Connect4Preview({ size = 320 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const cell = size / COLS;
    const grav = cell * 0.05;
    let board: Board = newBoard();
    let player = 1;
    let status: 'play' | 'over' = 'play';
    let winCells: [number, number][] | null = null;
    let falling: { col: number; player: number; y: number; vy: number; targetY: number; row: number } | null = null;
    let moveTimer = 25;
    let overTimer = 0;
    let raf = 0, alive = true;

    const startMove = () => {
      const mv = bestMove(board, player, 5);
      if (mv < 0) return;
      const row = dropRow(board, mv);
      falling = { col: mv, player, y: cell / 2, vy: cell * 0.08, targetY: landingY(size, row), row };
    };

    const loop = () => {
      if (!alive) return;
      if (falling) {
        falling.vy += grav;
        falling.y += falling.vy;
        if (falling.y >= falling.targetY) {
          board[falling.row][falling.col] = falling.player;
          const placed = falling.player;
          falling = null;
          const w = findWin(board);
          if (w) { status = 'over'; winCells = w.cells; overTimer = 110; }
          else if (isFull(board)) { status = 'over'; winCells = null; overTimer = 80; }
          else player = placed === 1 ? 2 : 1;
        }
      } else if (status === 'play') {
        if (moveTimer > 0) moveTimer--; else { startMove(); moveTimer = 30; }
      } else {
        if (overTimer > 0) overTimer--; else { board = newBoard(); player = 1; status = 'play'; winCells = null; moveTimer = 20; }
      }
      drawConnect4(ctx, board, size, {
        falling: falling ? { col: falling.col, player: falling.player, y: falling.y } : null,
        winCells,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [size]);

  const cell = size / COLS;
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={(ROWS + 1) * cell}
      className="rounded-xl border border-slate-800 shadow-2xl"
      style={{ width: size, height: (ROWS + 1) * cell, background: '#0b1220' }}
    />
  );
}
