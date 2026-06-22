import { Board, Player } from '../types/game';

// Size of the board (20x20)
const SIZE = 20;

// Initialize a 3D table of random 32-bit integers
// [row][col][player: 0 for 'X', 1 for 'O']
const zobristTable: number[][][] = [];
const turnHash: number = getRandom32BitInt();

function getRandom32BitInt(): number {
  return Math.floor(Math.random() * 0xffffffff) | 0;
}

// Generate the keys
for (let r = 0; r < SIZE; r++) {
  zobristTable[r] = [];
  for (let c = 0; c < SIZE; c++) {
    zobristTable[r][c] = [
      getRandom32BitInt(), // For 'X'
      getRandom32BitInt()  // For 'O'
    ];
  }
}

/**
 * Calculates the complete Zobrist hash of a board state from scratch.
 */
export function computeBoardHash(board: Board, turn: Player): number {
  let hash = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = board[r][c];
      if (cell === 'X') {
        hash ^= zobristTable[r][c][0];
      } else if (cell === 'O') {
        hash ^= zobristTable[r][c][1];
      }
    }
  }
  if (turn === 'O') {
    hash ^= turnHash;
  }
  return hash;
}

/**
 * Rapidly updates an existing Zobrist hash when a stone is placed or removed.
 * This is O(1) instead of O(N^2), crucial for high-performance deep search!
 */
export function updateHash(
  currentHash: number,
  r: number,
  c: number,
  player: Player
): number {
  const playerIndex = player === 'X' ? 0 : 1;
  // XORing the key toggles the presence of the stone in the hash
  let newHash = currentHash ^ zobristTable[r][c][playerIndex];
  // Toggle the turn hash
  newHash ^= turnHash;
  return newHash;
}
