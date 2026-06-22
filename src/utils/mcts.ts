import { Board, Player, Move, AIConfig } from '../types/game';
import { checkWinner, checkWinnerLocal, isBoardFull, evaluateBoard } from './evaluator';
import { getCandidateMoves } from './minimax';

const SIZE = 20;

class MCTSNode {
  r: number;
  c: number;
  parent: MCTSNode | null;
  children: MCTSNode[] = [];
  visits = 0;
  wins = 0;
  playerToMove: Player; // Who plays NEXT in this node
  untriedMoves: Move[];

  constructor(
    r: number,
    c: number,
    parent: MCTSNode | null,
    playerToMove: Player,
    untriedMoves: Move[]
  ) {
    this.r = r;
    this.c = c;
    this.parent = parent;
    this.playerToMove = playerToMove;
    this.untriedMoves = untriedMoves;
  }

  isFullyExpanded(): boolean {
    return this.untriedMoves.length === 0;
  }

  isLeaf(): boolean {
    return this.parent === null || this.children.length === 0;
  }
}

/**
 * Monte Carlo Tree Search (MCTS) implementation with heuristic-guided rollouts.
 */
export function findBestMoveMCTS(
  board: Board,
  player: Player,
  config: AIConfig,
  timeLimitMs: number = 100
): { move: Move; visits: number; simulations: number; timeSpent: number } {
  const startTime = Date.now();
  const opponent: Player = player === 'X' ? 'O' : 'X';

  // 1. Initialize root node
  const initialMoves = getCandidateMoves(board, 1);
  if (initialMoves.length === 1) {
    return {
      move: initialMoves[0],
      visits: 0,
      simulations: 0,
      timeSpent: 0
    };
  }

  const root = new MCTSNode(-1, -1, null, player, [...initialMoves]);
  let simulations = 0;

  // Run simulations until time is up
  while (Date.now() - startTime < timeLimitMs && simulations < config.mctsSimulations) {
    // 1. Selection
    let node = root;
    const tempBoard = cloneBoard(board);

    while (node.isFullyExpanded() && node.children.length > 0) {
      node = selectBestUCTChild(node, config.explorationConstant);
      tempBoard[node.r][node.c] = node.parent!.playerToMove;
    }

    // 2. Expansion
    if (!node.isFullyExpanded() && node.untriedMoves.length > 0) {
      const moveIndex = Math.floor(Math.random() * node.untriedMoves.length);
      const move = node.untriedMoves.splice(moveIndex, 1)[0];
      
      tempBoard[move.r][move.c] = node.playerToMove;

      const nextPlayer = node.playerToMove === 'X' ? 'O' : 'X';
      const nextMoves = getCandidateMoves(tempBoard, 1);
      const child = new MCTSNode(move.r, move.c, node, nextPlayer, nextMoves);
      node.children.push(child);
      node = child;
    }

    // 3. Rollout / Simulation (Heuristic-guided for Caro speed and intelligence)
    const winner = simulateHeuristicRollout(tempBoard, node.playerToMove, config);
    simulations++;

    // 4. Backpropagation
    let backNode: MCTSNode | null = node;
    while (backNode !== null) {
      backNode.visits++;
      
      // The parent node made the move that led to this node.
      // If parent.playerToMove === 'X', then player 'X' made the move.
      // We credit the win if the winner matches the player who made the move.
      const moveMadeBy = backNode.parent ? backNode.parent.playerToMove : null;
      if (moveMadeBy && winner === moveMadeBy) {
        backNode.wins += 1.0;
      } else if (winner === 'DRAW') {
        backNode.wins += 0.5;
      }
      
      backNode = backNode.parent;
    }
  }

  // Choose the child with the maximum visits (robust child)
  if (root.children.length === 0) {
    // Fallback if no simulations completed
    return {
      move: initialMoves[0],
      visits: 0,
      simulations,
      timeSpent: Date.now() - startTime
    };
  }

  const bestChild = root.children.reduce((best, curr) => (curr.visits > best.visits ? curr : best), root.children[0]);

  return {
    move: { r: bestChild.r, c: bestChild.c },
    visits: bestChild.visits,
    simulations,
    timeSpent: Date.now() - startTime
  };
}

/**
 * Selects the child with the highest Upper Confidence bound (UCT)
 */
function selectBestUCTChild(node: MCTSNode, explorationC: number): MCTSNode {
  let bestValue = -Infinity;
  let bestChild = node.children[0];

  const logParentVisits = Math.log(node.visits);

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.visits === 0) {
      return child; // Always explore unvisited nodes first
    }

    const winRate = child.wins / child.visits;
    const exploration = explorationC * Math.sqrt(logParentVisits / child.visits);
    const uctValue = winRate + exploration;

    if (uctValue > bestValue) {
      bestValue = uctValue;
      bestChild = child;
    }
  }

  return bestChild;
}

/**
 * Counts how many directions from (r, c) have a significant threat (live3+ or any 4).
 * Used to detect fork positions: a count of 2+ means this cell creates/blocks a fork.
 */
function countSignificantDirections(board: Board, r: number, c: number, player: Player): number {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let count = 0;

  for (const [dr, dc] of directions) {
    let len = 1;

    let cr = r + dr; let cc = c + dc;
    while (cr >= 0 && cr < SIZE && cc >= 0 && cc < SIZE && board[cr][cc] === player) {
      len++; cr += dr; cc += dc;
    }
    const openAfter = (cr >= 0 && cr < SIZE && cc >= 0 && cc < SIZE && board[cr][cc] === null) ? 1 : 0;

    cr = r - dr; cc = c - dc;
    while (cr >= 0 && cr < SIZE && cc >= 0 && cc < SIZE && board[cr][cc] === player) {
      len++; cr -= dr; cc -= dc;
    }
    const openBefore = (cr >= 0 && cr < SIZE && cc >= 0 && cc < SIZE && board[cr][cc] === null) ? 1 : 0;

    const openEnds = openAfter + openBefore;
    if ((len >= 4 && openEnds >= 1) || (len === 3 && openEnds === 2)) {
      count++;
    }
  }
  return count;
}

/**
 * Runs a rapid heuristic-guided simulation instead of pure random play.
 * Priority order: instant win → block opponent win → create fork → block opponent fork → random.
 */
function simulateHeuristicRollout(board: Board, startPlayer: Player, config: AIConfig): Player | 'DRAW' {
  let activePlayer = startPlayer;
  let winner = checkWinner(board);

  if (winner) return winner;
  if (isBoardFull(board)) return 'DRAW';

  const maxSteps = 20;
  let step = 0;

  while (step < maxSteps) {
    const moves = getCandidateMoves(board, 1);
    if (moves.length === 0) break;

    let selectedMove: Move | null = null;
    const opponent = activePlayer === 'X' ? 'O' : 'X';

    // 1. Instant win
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      board[m.r][m.c] = activePlayer;
      if (checkWinnerLocal(board, m.r, m.c) === activePlayer) {
        selectedMove = m;
        board[m.r][m.c] = null;
        break;
      }
      board[m.r][m.c] = null;
    }

    // 2. Block opponent's instant win
    if (!selectedMove) {
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        board[m.r][m.c] = opponent;
        if (checkWinnerLocal(board, m.r, m.c) === opponent) {
          selectedMove = m;
          board[m.r][m.c] = null;
          break;
        }
        board[m.r][m.c] = null;
      }
    }

    // 3. Create a fork (2+ simultaneous threats)
    if (!selectedMove) {
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        board[m.r][m.c] = activePlayer;
        if (countSignificantDirections(board, m.r, m.c, activePlayer) >= 2) {
          selectedMove = m;
          board[m.r][m.c] = null;
          break;
        }
        board[m.r][m.c] = null;
      }
    }

    // 4. Block opponent fork
    if (!selectedMove) {
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        board[m.r][m.c] = opponent;
        if (countSignificantDirections(board, m.r, m.c, opponent) >= 2) {
          selectedMove = m;
          board[m.r][m.c] = null;
          break;
        }
        board[m.r][m.c] = null;
      }
    }

    // 5. Random fallback
    if (!selectedMove) {
      selectedMove = moves[Math.floor(Math.random() * moves.length)];
    }

    board[selectedMove.r][selectedMove.c] = activePlayer;
    winner = checkWinnerLocal(board, selectedMove.r, selectedMove.c);

    if (winner) return winner;
    if (isBoardFull(board)) return 'DRAW';

    activePlayer = opponent;
    step++;
  }

  const evalScore = evaluateBoard(board, config.weights);
  if (Math.abs(evalScore) < 500) return 'DRAW';
  return evalScore > 0 ? 'X' : 'O';
}

function cloneBoard(board: Board): Board {
  const newBoard: Board = [];
  for (let r = 0; r < SIZE; r++) {
    newBoard.push([...board[r]]);
  }
  return newBoard;
}
