import { QMaze, QAgent, cellValue, bestAction, ACTIONS } from './qmaze';

/** Vẽ mê cung: tường, bản đồ nhiệt giá trị Q, mũi tên chính sách, đích/xuất phát, agent. */
export function drawQMaze(ctx: CanvasRenderingContext2D, maze: QMaze, agent: QAgent, px: number, showArrows = true) {
  const size = maze.size;
  const cell = px / size;

  // Phạm vi giá trị để chuẩn hóa heatmap (chỉ ô đã học)
  let vmin = Infinity, vmax = -Infinity;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (maze.grid[r][c] === 1) continue;
    if (bestAction(agent, r, c) === -1) continue;
    const v = cellValue(agent, r, c);
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  const span = vmax - vmin || 1;

  ctx.clearRect(0, 0, px, px);

  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const x = c * cell, y = r * cell;
    if (maze.grid[r][c] === 1) {
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      continue;
    }
    const learned = bestAction(agent, r, c) !== -1;
    if (learned && isFinite(vmin)) {
      const t = (cellValue(agent, r, c) - vmin) / span; // 0..1
      const hue = (1 - t) * 240; // xanh dương (thấp) → đỏ (cao)
      ctx.fillStyle = `hsl(${hue}, 72%, ${28 + t * 22}%)`;
    } else {
      ctx.fillStyle = '#16213a'; // ô chưa khám phá
    }
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = 'rgba(15,23,42,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }

  // Mũi tên chính sách
  if (showArrows) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, cell * 0.04);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (maze.grid[r][c] === 1) continue;
      const a = bestAction(agent, r, c);
      if (a === -1) continue;
      if (r === maze.goal.r && c === maze.goal.c) continue;
      const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
      const [dr, dc] = ACTIONS[a];
      const len = cell * 0.28;
      const ex = cx + dc * len, ey = cy + dr * len;
      ctx.beginPath();
      ctx.moveTo(cx - dc * len * 0.5, cy - dr * len * 0.5);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // đầu mũi tên
      const ah = cell * 0.12;
      ctx.beginPath();
      if (dr !== 0) { ctx.moveTo(ex, ey); ctx.lineTo(ex - ah, ey - dr * ah); ctx.lineTo(ex + ah, ey - dr * ah); }
      else { ctx.moveTo(ex, ey); ctx.lineTo(ex - dc * ah, ey - ah); ctx.lineTo(ex - dc * ah, ey + ah); }
      ctx.closePath();
      ctx.fill();
    }
  }

  // Xuất phát
  const sx = maze.start.c * cell, sy = maze.start.r * cell;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.strokeRect(sx + 2, sy + 2, cell - 4, cell - 4);

  // Đích
  const gx = maze.goal.c * cell, gy = maze.goal.r * cell;
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(gx + cell * 0.18, gy + cell * 0.18, cell * 0.64, cell * 0.64);
  ctx.fillStyle = '#7c2d12';
  ctx.font = `bold ${Math.round(cell * 0.4)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', gx + cell / 2, gy + cell / 2 + 1);

  // Agent
  const ax = agent.pos.c * cell + cell / 2, ay = agent.pos.r * cell + cell / 2;
  ctx.beginPath();
  ctx.arc(ax, ay, cell * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#22d3ee';
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = cell * 0.4;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#0e7490';
  ctx.lineWidth = Math.max(1, cell * 0.05);
  ctx.stroke();
}
