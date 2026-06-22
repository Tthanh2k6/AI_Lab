import { Board, Player, HeuristicWeights } from '../types/game';

const SIZE = 20;

// Directions to scan: [row_delta, col_delta]
// Horizontal, Vertical, Diagonal (down-right), Anti-Diagonal (down-left)
const DIRECTIONS = [
  [0, 1],   // Right
  [1, 0],   // Down
  [1, 1],   // Down-Right
  [1, -1]   // Down-Left
];

/**
 * Highly optimized heuristic evaluator for a 20x20 Caro board.
 * Returns a score representing the advantage of the board for Player 'X' relative to 'O'.
 * Positive score = X advantage, Negative score = O advantage.
 */
export function evaluateBoard(board: Board, weights: HeuristicWeights): number {
  let scoreX = 0;
  let scoreO = 0;

  // Track threat counts for fork detection (3-3 and 4-3 double threats)
  let xLive4 = 0;
  let xClosed4 = 0;
  let xLive3 = 0;

  let oLive4 = 0;
  let oClosed4 = 0;
  let oLive3 = 0;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const player = board[r][c];
      if (!player) {
        continue;
      }

      // 1. Center preference bonus
      const distFromCenter = Math.abs(r - 10) + Math.abs(c - 10);
      const centerBonus = Math.max(0, 20 - distFromCenter) * weights.center;
      if (player === 'X') {
        scoreX += centerBonus;
      } else {
        scoreO += centerBonus;
      }

      // 2. Scan in the 4 directions forward
      for (let d = 0; d < DIRECTIONS.length; d++) {
        const [dr, dc] = DIRECTIONS[d];

        // Check the cell BEFORE to avoid double counting
        const prevR = r - dr;
        const prevC = c - dc;
        if (
          prevR >= 0 &&
          prevR < SIZE &&
          prevC >= 0 &&
          prevC < SIZE &&
          board[prevR][prevC] === player
        ) {
          // This cell was already counted as part of a sequence scanned from an earlier stone
          continue;
        }

        // Count consecutive stones
        let len = 1;
        let currR = r + dr;
        let currC = c + dc;
        while (
          currR >= 0 &&
          currR < SIZE &&
          currC >= 0 &&
          currC < SIZE &&
          board[currR][currC] === player
        ) {
          len++;
          currR += dr;
          currC += dc;
        }

        // Check boundaries
        let openEnds = 0;

        // Boundary before start
        if (
          prevR >= 0 &&
          prevR < SIZE &&
          prevC >= 0 &&
          prevC < SIZE &&
          board[prevR][prevC] === null
        ) {
          openEnds++;
        }

        // Boundary after end (currR, currC is the cell just after the sequence)
        if (
          currR >= 0 &&
          currR < SIZE &&
          currC >= 0 &&
          currC < SIZE &&
          board[currR][currC] === null
        ) {
          openEnds++;
        }

        // Keep track of counts for fork calculations
        if (len === 4) {
          if (openEnds === 2) {
            if (player === 'X') xLive4++; else oLive4++;
          } else if (openEnds === 1) {
            if (player === 'X') xClosed4++; else oClosed4++;
          }
        } else if (len === 3 && openEnds === 2) {
          if (player === 'X') xLive3++; else oLive3++;
        }

        // Add offensive threat score
        let patternScore = 0;
        if (len >= 5) {
          patternScore = weights.win5;
        } else if (len === 4) {
          if (openEnds === 2) {
            patternScore = weights.live4;
          } else if (openEnds === 1) {
            patternScore = weights.closed4;
          }
        } else if (len === 3) {
          if (openEnds === 2) {
            patternScore = weights.live3;
          } else if (openEnds === 1) {
            patternScore = weights.closed3;
          }
        } else if (len === 2) {
          if (openEnds === 2) {
            patternScore = weights.live2;
          } else if (openEnds === 1) {
            patternScore = weights.closed2;
          }
        }

        if (player === 'X') {
          scoreX += patternScore;
        } else {
          scoreO += patternScore;
        }
      }
    }
  }

  // 3. Apply defensive blocking weight penalties (block Live 4 and Live 3 threats of the opponent)
  // Urgency penalty if opponent O has threats: reduces scoreX
  scoreX -= oLive4 * (weights.blockLive4 || 14000);
  scoreX -= oLive3 * (weights.blockLive3 || 2000);

  // Urgency penalty if opponent X has threats: reduces scoreO
  scoreO -= xLive4 * (weights.blockLive4 || 14000);
  scoreO -= xLive3 * (weights.blockLive3 || 2000);

  // 4. Double threat forks bonuses
  // Player X forks
  if (xLive3 >= 2) {
    scoreX += (weights.doubleLive3 || 8000);
  }
  if ((xLive4 >= 1 || xClosed4 >= 1) && xLive3 >= 1) {
    scoreX += (weights.fork43 || 15000);
  }

  // Player O forks
  if (oLive3 >= 2) {
    scoreO += (weights.doubleLive3 || 8000);
  }
  if ((oLive4 >= 1 || oClosed4 >= 1) && oLive3 >= 1) {
    scoreO += (weights.fork43 || 15000);
  }

  // Return the relative score from the perspective of X
  return scoreX - scoreO;
}

/**
 * Highly optimized local win checker.
 * Checks if the last placed stone at (r, c) creates a winning line of 5.
 * This is O(1) in board size, running in microseconds!
 */
export function checkWinnerLocal(board: Board, r: number, c: number): Player | null {
  const player = board[r][c];
  if (!player) return null;

  for (let d = 0; d < DIRECTIONS.length; d++) {
    const [dr, dc] = DIRECTIONS[d];
    let len = 1;

    // Scan positive direction
    let currR = r + dr;
    let currC = c + dc;
    while (
      currR >= 0 &&
      currR < SIZE &&
      currC >= 0 &&
      currC < SIZE &&
      board[currR][currC] === player
    ) {
      len++;
      currR += dr;
      currC += dc;
    }

    // Scan negative direction
    currR = r - dr;
    currC = c - dc;
    while (
      currR >= 0 &&
      currR < SIZE &&
      currC >= 0 &&
      currC < SIZE &&
      board[currR][currC] === player
    ) {
      len++;
      currR -= dr;
      currC -= dc;
    }

    if (len >= 5) {
      return player;
    }
  }

  return null;
}

/**
 * Checks if a player has won the game.
 * Returns the winning Player or null if no one has won yet.
 */
export function checkWinner(board: Board): Player | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const player = board[r][c];
      if (!player) continue;

      for (let d = 0; d < DIRECTIONS.length; d++) {
        const [dr, dc] = DIRECTIONS[d];

        // Only scan if previous cell doesn't match (prevents double-checking)
        const prevR = r - dr;
        const prevC = c - dc;
        if (
          prevR >= 0 &&
          prevR < SIZE &&
          prevC >= 0 &&
          prevC < SIZE &&
          board[prevR][prevC] === player
        ) {
          continue;
        }

        let len = 1;
        let currR = r + dr;
        let currC = c + dc;
        while (
          currR >= 0 &&
          currR < SIZE &&
          currC >= 0 &&
          currC < SIZE &&
          board[currR][currC] === player
        ) {
          len++;
          currR += dr;
          currC += dc;
        }

        if (len >= 5) {
          return player;
        }
      }
    }
  }
  return null;
}

/**
 * Checks if the board is completely full (Draw)
 */
export function isBoardFull(board: Board): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === null) {
        return false;
      }
    }
  }
  return true;
}
