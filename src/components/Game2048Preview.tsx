import { useEffect, useRef, useState } from 'react';
import Board2048 from './Board2048';
import { newGame, planMove, spawnTile, bestMove, movesAvailable, Tile } from '../utils/game2048';

// Bản demo AI tự chơi 2048 ở menu (auto-loop, có hoạt ảnh).
export default function Game2048Preview({ size = 240 }: { size?: number }) {
  const [tiles, setTiles] = useState<Tile[]>(() => newGame());
  const tilesRef = useRef<Tile[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    tilesRef.current = newGame();
    setTiles(tilesRef.current);
    let alive = true;
    const timers: number[] = [];
    const ANIM = 120;
    const STEP = 300;
    const after = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };

    const step = () => {
      if (!alive) return;
      if (busyRef.current) { after(60, step); return; }
      if (!movesAvailable(tilesRef.current)) {
        after(1200, () => { tilesRef.current = newGame(); setTiles(tilesRef.current); after(STEP, step); });
        return;
      }
      const dir = bestMove(tilesRef.current);
      if (!dir) { after(STEP, step); return; }
      const plan = planMove(tilesRef.current, dir);
      if (!plan.moved) { after(STEP, step); return; }
      busyRef.current = true;
      setTiles(plan.slid);
      after(ANIM, () => {
        const settled = plan.settled.map(t => ({ ...t }));
        spawnTile(settled);
        tilesRef.current = settled;
        setTiles(settled);
        busyRef.current = false;
        after(STEP - ANIM, step);
      });
    };
    after(500, step);
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, []);

  return <Board2048 tiles={tiles} size={size} />;
}
