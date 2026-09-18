import { Board, Player, AIConfig, Move, SearchMetrics } from '../types/game';
import { findBestMoveMinimax, getCandidateMoves } from '../utils/minimax';
import { findBestMoveMCTS } from '../utils/mcts';
import { evaluateBoard } from '../utils/evaluator';

export interface SearchRequest {
  requestId: number;
  board: Board;
  player: Player;
  config: AIConfig;
  currentHash: number;
  timeLimitMs: number;
}

export type SearchResponse =
  | { requestId: number; success: true; move: Move; metrics: SearchMetrics }
  | { requestId: number; success: false; error: string };

// Listen for messages from the main UI thread
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { requestId, board, player, config, currentHash, timeLimitMs } = event.data;

  const startTime = Date.now();

  try {
    let bestMove: Move;
    let metrics: SearchMetrics = {
      nodesEvaluated: 0,
      maxDepthReached: 0,
      timeSpentMs: 0,
      transpositionHits: 0,
      evaluationScore: 0
    };

    if (config.algorithm === 'RANDOM') {
      const candidates = getCandidateMoves(board, 1);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      bestMove = chosen;
      metrics = {
        nodesEvaluated: candidates.length,
        maxDepthReached: 1,
        timeSpentMs: Date.now() - startTime,
        transpositionHits: 0,
        evaluationScore: 0
      };
    } else if (config.algorithm === 'MINIMAX') {
      const result = findBestMoveMinimax(board, player, config, currentHash, timeLimitMs);
      bestMove = result.move;
      metrics = {
        nodesEvaluated: result.nodes,
        maxDepthReached: result.depth,
        timeSpentMs: Date.now() - startTime,
        transpositionHits: result.ttHits,
        evaluationScore: result.score
      };
    } else if (config.algorithm === 'MCTS') {
      const result = findBestMoveMCTS(board, player, config, timeLimitMs);
      bestMove = result.move;

      // Calculate a static board evaluation score for display in the dashboard
      const score = evaluateBoard(board, config.weights);

      metrics = {
        nodesEvaluated: result.simulations, // For MCTS, nodes evaluated corresponds to simulations run
        maxDepthReached: Math.round(Math.log2(result.visits + 1)), // Proxy for tree depth
        timeSpentMs: result.timeSpent,
        transpositionHits: 0,
        evaluationScore: score
      };
    } else {
      // Fallback
      throw new Error(`Unknown algorithm: ${config.algorithm}`);
    }

    // Return search result back to main thread
    const response: SearchResponse = { requestId, success: true, move: bestMove, metrics };
    self.postMessage(response);
  } catch (error) {
    const response: SearchResponse = {
      requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Error occurred in AI search'
    };
    self.postMessage(response);
  }
};
