import { Board, Player, Move, AIConfig, HeuristicWeights } from '../types/game';
import { evaluateBoard, checkWinner, checkWinnerLocal, isBoardFull } from './evaluator';
import { updateHash } from './zobrist';

const SIZE = 20;

// TT flag types
type TTFlag = 'EXACT' | 'ALPHA' | 'BETA';

interface TTEntry {
  score: number;
  depth: number;
  flag: TTFlag;
  bestMove: Move | null;
}

// Transposition Table (Global or per-search)
const transpositionTable = new Map<number, TTEntry>();

/**
 * Gets candidate moves that are within `range` steps of any existing stone.
 * This prunes the search space from 400 cells down to ~15-30 cells!
 */
export function getCandidateMoves(board: Board, range: number = 1): Move[] {
  const moves: Move[] = [];
  const visited = new Set<string>();

  let hasStones = false;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== null) {
        hasStones = true;
        // Search in a box around this stone
        for (let dr = -range; dr <= range; dr++) {
          for (let dc = -range; dc <= range; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === null) {
              const key = `${nr},${nc}`;
              if (!visited.has(key)) {
                visited.add(key);
                moves.push({ r: nr, c: nc });
              }
            }
          }
        }
      }
    }
  }

  // If board is empty, prefer center
  if (!hasStones) {
    return [{ r: 10, c: 10 }];
  }

  return moves;
}

/**
 * Quick scoring of a specific coordinate for offensive and defensive value.
 * Used for Move Ordering to maximize Alpha-Beta cutoffs.
 * Critically detects fork threats (2+ simultaneous threats in different directions).
 */
function evaluateMoveStrength(
  board: Board,
  r: number,
  c: number,
  player: Player,
  weights: HeuristicWeights
): number {
  let score = 0;
  const opponent: Player = player === 'X' ? 'O' : 'X';

  const directions = [
    [0, 1], [1, 0], [1, 1], [1, -1]
  ];

  // Evaluate for player (offense) and opponent (defense)
  for (const [playerToCheck, isOffense] of [[player, true], [opponent, false]] as const) {
    let playerThreatScore = 0;
    // Count directions with live3+ or any 4 — used to detect forks
    let significantDirections = 0;

    for (let d = 0; d < directions.length; d++) {
      const [dr, dc] = directions[d];

      let len = 1;
      let openEnds = 0;

      // Scan in positive direction
      let step = 1;
      let currR = r + dr * step;
      let currC = c + dc * step;
      while (currR >= 0 && currR < SIZE && currC >= 0 && currC < SIZE && board[currR][currC] === playerToCheck) {
        len++;
        step++;
        currR = r + dr * step;
        currC = c + dc * step;
      }
      if (currR >= 0 && currR < SIZE && currC >= 0 && currC < SIZE && board[currR][currC] === null) {
        openEnds++;
      }

      // Scan in negative direction
      step = 1;
      currR = r - dr * step;
      currC = c - dc * step;
      while (currR >= 0 && currR < SIZE && currC >= 0 && currC < SIZE && board[currR][currC] === playerToCheck) {
        len++;
        step++;
        currR = r - dr * step;
        currC = c - dc * step;
      }
      if (currR >= 0 && currR < SIZE && currC >= 0 && currC < SIZE && board[currR][currC] === null) {
        openEnds++;
      }

      let patternVal = 0;
      if (len >= 5) {
        patternVal = weights.win5;
        significantDirections += 2; // instant win counts as 2 forks
      } else if (len === 4) {
        if (openEnds === 2) {
          patternVal = weights.live4;
          significantDirections++; // live4 forces a block
        } else if (openEnds === 1) {
          patternVal = weights.closed4;
          significantDirections++; // closed4 also forces a block
        }
      } else if (len === 3) {
        if (openEnds === 2) {
          patternVal = weights.live3;
          significantDirections++; // live3 is a threatening pattern
        } else if (openEnds === 1) {
          patternVal = weights.closed3;
          // closed3 alone is not fork-worthy
        }
      } else if (len === 2) {
        patternVal = openEnds === 2 ? weights.live2 : weights.closed2;
      }

      playerThreatScore += patternVal;
    }

    // Fork bonus: placing here creates/blocks 2+ simultaneous threats
    // This is the critical fix — fork moves must be ranked first in ordering
    if (significantDirections >= 2) {
      playerThreatScore += weights.fork43 || 15000;
    }

    score += isOffense ? playerThreatScore * 1.1 : playerThreatScore;
  }

  // Center preference tiebreaker
  const distFromCenter = Math.abs(r - 10) + Math.abs(c - 10);
  score += Math.max(0, 20 - distFromCenter) * weights.center * 0.1;

  return score;
}

/**
 * Main Search context to track metrics and respect time limits.
 */
interface SearchContext {
  nodesEvaluated: number;
  transpositionHits: number;
  maxDepthReached: number;
  startTime: number;
  timeLimitMs: number;
  isTimeOut: boolean;
  weights: HeuristicWeights;
  useTT: boolean;
}

/**
 * Minimax with Alpha-Beta pruning, Transposition Table, and Move Ordering.
 */
function alphabeta(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  currentHash: number,
  player: Player,
  context: SearchContext,
  lastMove: Move | null
): number {
  // Check for time limits
  if (context.isTimeOut || Date.now() - context.startTime > context.timeLimitMs) {
    context.isTimeOut = true;
    return 0;
  }

  context.nodesEvaluated++;

  // 1. Transposition Table Lookup
  if (context.useTT) {
    const entry = transpositionTable.get(currentHash);
    if (entry && entry.depth >= depth) {
      context.transpositionHits++;
      if (entry.flag === 'EXACT') {
        return entry.score;
      } else if (entry.flag === 'ALPHA' && entry.score <= alpha) {
        return entry.score;
      } else if (entry.flag === 'BETA' && entry.score >= beta) {
        return entry.score;
      }
    }
  }

  // 2. Terminal checks
  const winner = lastMove ? checkWinnerLocal(board, lastMove.r, lastMove.c) : checkWinner(board);
  if (winner === 'X') return 1000000 + depth; // Prefer winning faster (larger depth is closer to root)
  if (winner === 'O') return -1000000 - depth; // Prefer winning faster (larger depth is closer to root, more negative)
  if (isBoardFull(board)) return 0;
  if (depth === 0) {
    return evaluateBoard(board, context.weights);
  }

  const activePlayer: Player = isMaximizing ? 'X' : 'O';
  const candidateMoves = getCandidateMoves(board, 1);

  // 3. Move Ordering: Sort candidates based on threat strength
  const sortedMoves = candidateMoves.map(m => {
    return {
      move: m,
      score: evaluateMoveStrength(board, m.r, m.c, activePlayer, context.weights)
    };
  }).sort((a, b) => b.score - a.score);

  let bestMove: Move | null = null;
  let originalAlpha = alpha;
  let originalBeta = beta;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < sortedMoves.length; i++) {
      const { move } = sortedMoves[i];
      // Make move
      board[move.r][move.c] = 'X';
      const nextHash = updateHash(currentHash, move.r, move.c, 'X');

      const evaluation = alphabeta(board, depth - 1, alpha, beta, false, nextHash, player, context, move);

      // Undo move
      board[move.r][move.c] = null;

      if (context.isTimeOut) return 0;

      if (evaluation > maxEval) {
        maxEval = evaluation;
        bestMove = move;
      }
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) {
        break; // Beta cutoff
      }
    }

    // Save state in Transposition Table
    if (context.useTT && !context.isTimeOut) {
      let flag: TTFlag = 'EXACT';
      if (maxEval <= originalAlpha) flag = 'ALPHA';
      else if (maxEval >= beta) flag = 'BETA';
      transpositionTable.set(currentHash, {
        score: maxEval,
        depth,
        flag,
        bestMove
      });
    }

    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < sortedMoves.length; i++) {
      const { move } = sortedMoves[i];
      // Make move
      board[move.r][move.c] = 'O';
      const nextHash = updateHash(currentHash, move.r, move.c, 'O');

      const evaluation = alphabeta(board, depth - 1, alpha, beta, true, nextHash, player, context, move);

      // Undo move
      board[move.r][move.c] = null;

      if (context.isTimeOut) return 0;

      if (evaluation < minEval) {
        minEval = evaluation;
        bestMove = move;
      }
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) {
        break; // Alpha cutoff
      }
    }

    // Save state in Transposition Table
    if (context.useTT && !context.isTimeOut) {
      let flag: TTFlag = 'EXACT';
      if (minEval <= alpha) flag = 'ALPHA';
      else if (minEval >= originalBeta) flag = 'BETA';
      transpositionTable.set(currentHash, {
        score: minEval,
        depth,
        flag,
        bestMove
      });
    }

    return minEval;
  }
}

/**
 * Searches the best move using Minimax Alpha-Beta search.
 * Utilizes Iterative Deepening to get the best move within `timeLimitMs`.
 */
export function findBestMoveMinimax(
  board: Board,
  player: Player,
  config: AIConfig,
  currentHash: number,
  timeLimitMs: number = 100
): { move: Move; score: number; nodes: number; depth: number; ttHits: number } {
  const startTime = Date.now();
  const candidateMoves = getCandidateMoves(board, 1);

  if (candidateMoves.length === 1) {
    return {
      move: candidateMoves[0],
      score: 0,
      nodes: 0,
      depth: 0,
      ttHits: 0
    };
  }

  const isMaximizing = player === 'X';
  const context: SearchContext = {
    nodesEvaluated: 0,
    transpositionHits: 0,
    maxDepthReached: 0,
    startTime,
    timeLimitMs,
    isTimeOut: false,
    weights: config.weights,
    useTT: config.useTranspositionTable
  };

  let bestMove: Move = candidateMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  // Clear Transposition Table periodically to avoid excessive memory usage
  if (transpositionTable.size > 200000) {
    transpositionTable.clear();
  }

  // Iterative Deepening
  const targetDepth = config.maxDepth;
  for (let depth = 1; depth <= targetDepth; depth++) {
    if (Date.now() - startTime > timeLimitMs) {
      break;
    }

    const activePlayer: Player = player;
    const sortedMoves = candidateMoves.map(m => {
      return {
        move: m,
        score: evaluateMoveStrength(board, m.r, m.c, activePlayer, config.weights)
      };
    }).sort((a, b) => b.score - a.score);

    let tempBestMove: Move | null = null;
    let tempBestScore = isMaximizing ? -Infinity : Infinity;

    for (let i = 0; i < sortedMoves.length; i++) {
      const { move } = sortedMoves[i];
      // Make move
      board[move.r][move.c] = player;
      const nextHash = updateHash(currentHash, move.r, move.c, player);

      const score = alphabeta(
        board,
        depth - 1,
        -Infinity,
        Infinity,
        !isMaximizing,
        nextHash,
        player,
        context,
        move
      );

      // Undo move
      board[move.r][move.c] = null;

      if (context.isTimeOut) {
        break;
      }

      if (isMaximizing) {
        if (score > tempBestScore) {
          tempBestScore = score;
          tempBestMove = move;
        }
      } else {
        if (score < tempBestScore) {
          tempBestScore = score;
          tempBestMove = move;
        }
      }
    }

    if (!context.isTimeOut && tempBestMove) {
      bestMove = tempBestMove;
      bestScore = tempBestScore;
      context.maxDepthReached = depth;
    } else {
      break; // Timeout occurred during search, return last fully completed depth
    }
  }

  return {
    move: bestMove,
    score: bestScore,
    nodes: context.nodesEvaluated,
    depth: context.maxDepthReached,
    ttHits: context.transpositionHits
  };
}
