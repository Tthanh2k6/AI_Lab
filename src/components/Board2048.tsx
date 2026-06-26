import { GRID, Tile } from '../utils/game2048';

const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2: { bg: '#eee4da', fg: '#776e65' },
  4: { bg: '#ede0c8', fg: '#776e65' },
  8: { bg: '#f2b179', fg: '#f9f6f2' },
  16: { bg: '#f59563', fg: '#f9f6f2' },
  32: { bg: '#f67c5f', fg: '#f9f6f2' },
  64: { bg: '#f65e3b', fg: '#f9f6f2' },
  128: { bg: '#edcf72', fg: '#f9f6f2' },
  256: { bg: '#edcc61', fg: '#f9f6f2' },
  512: { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
};
const HIGH = { bg: '#3c3a32', fg: '#f9f6f2' };

export default function Board2048({ tiles, size }: { tiles: Tile[]; size: number }) {
  const gap = Math.round(size * 0.028);
  const cell = (size - gap * (GRID + 1)) / GRID;
  const pos = (i: number) => gap + i * (cell + gap);
  const fontFor = (v: number) => {
    const d = String(v).length;
    const base = cell * (d <= 2 ? 0.46 : d === 3 ? 0.36 : 0.28);
    return Math.round(base);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        background: '#bbada0',
        borderRadius: Math.round(size * 0.02),
      }}
    >
      {/* Ô nền */}
      {Array.from({ length: GRID * GRID }).map((_, i) => {
        const r = Math.floor(i / GRID), c = i % GRID;
        return (
          <div
            key={`bg-${i}`}
            style={{
              position: 'absolute',
              width: cell,
              height: cell,
              left: pos(c),
              top: pos(r),
              background: 'rgba(238,228,218,0.35)',
              borderRadius: 6,
            }}
          />
        );
      })}

      {/* Tile */}
      {tiles.map(t => {
        const col = TILE_COLORS[t.value] ?? HIGH;
        return (
          <div
            key={t.id}
            style={{
              position: 'absolute',
              width: cell,
              height: cell,
              left: 0,
              top: 0,
              transform: `translate(${pos(t.c)}px, ${pos(t.r)}px)`,
              transition: 'transform 110ms ease-in-out',
              zIndex: 2,
            }}
          >
            <div
              className={`t2048-box ${t.isNew ? 't2048-appear' : ''} ${t.merged ? 't2048-pop' : ''}`}
              style={{
                width: '100%',
                height: '100%',
                background: col.bg,
                color: col.fg,
                fontSize: fontFor(t.value),
              }}
            >
              {t.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
