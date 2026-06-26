import { Board, COLS, ROWS, dropRow } from './connect4';

const RED = '#ef4444';
const YELLOW = '#fbbf24';

export interface C4RenderOpts {
  falling?: { col: number; player: number; y: number } | null;
  winCells?: [number, number][] | null;
  hoverCol?: number | null;
  hoverPlayer?: number; // 1 hoặc 2
}

export function c4Geometry(size: number) {
  const cell = size / COLS;
  return { cell, top: cell, width: COLS * cell, height: (ROWS + 1) * cell };
}

function discColor(v: number) { return v === 1 ? RED : YELLOW; }

export function drawConnect4(ctx: CanvasRenderingContext2D, board: Board, size: number, opts: C4RenderOpts = {}) {
  const { cell, top, width, height } = c4Geometry(size);
  const rad = cell * 0.4;
  ctx.clearRect(0, 0, width, height);

  // Vùng thả (trên cùng) — hiển thị quân đang chờ/hover
  if (opts.hoverCol != null && opts.hoverCol >= 0 && board[0][opts.hoverCol] === 0) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = discColor(opts.hoverPlayer ?? 1);
    ctx.beginPath();
    ctx.arc(opts.hoverCol * cell + cell / 2, top / 2, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Bàn cờ xanh
  const r = Math.round(cell * 0.18);
  ctx.fillStyle = '#1e40af';
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(0, top, width, ROWS * cell, r);
  else ctx.rect(0, top, width, ROWS * cell);
  ctx.fill();

  // Các ô (lỗ tròn / quân)
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    const cx = col * cell + cell / 2;
    const cy = top + row * cell + cell / 2;
    const v = board[row][col];
    if (v === 0) {
      ctx.fillStyle = '#0b1220';
    } else {
      ctx.fillStyle = discColor(v);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    if (v !== 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = Math.max(1, cell * 0.03);
      ctx.stroke();
    }
  }

  // Quân đang rơi
  if (opts.falling) {
    const cx = opts.falling.col * cell + cell / 2;
    ctx.fillStyle = discColor(opts.falling.player);
    ctx.shadowColor = discColor(opts.falling.player);
    ctx.shadowBlur = cell * 0.25;
    ctx.beginPath();
    ctx.arc(cx, opts.falling.y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Tô sáng đường thắng
  if (opts.winCells) {
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.shadowColor = '#f8fafc';
    ctx.shadowBlur = cell * 0.3;
    for (const [rr, cc] of opts.winCells) {
      const cx = cc * cell + cell / 2;
      const cy = top + rr * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad + cell * 0.04, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
}

/** Tính cột target row cho hoạt ảnh rơi. */
export function landingY(size: number, row: number) {
  const { cell, top } = c4Geometry(size);
  return top + row * cell + cell / 2;
}

export function colFromX(size: number, x: number) {
  const { cell } = c4Geometry(size);
  const c = Math.floor(x / cell);
  return c < 0 || c >= COLS ? -1 : c;
}

export { dropRow };
