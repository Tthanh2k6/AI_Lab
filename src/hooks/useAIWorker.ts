import { useEffect, useRef, useState, useCallback } from 'react';
import { Board, Player, AIConfig, Move, SearchMetrics } from '../types/game';
import AIWorker from '../workers/ai.worker?worker';

interface WorkerResponse {
  success: boolean;
  move: Move;
  metrics: SearchMetrics;
  error?: string;
}

export function useAIWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMetrics, setSearchMetrics] = useState<SearchMetrics | null>(null);
  
  // Keep track of the active search's Promise resolve/reject callbacks
  const resolverRef = useRef<{
    resolve: (value: { move: Move; metrics: SearchMetrics }) => void;
    reject: (reason: any) => void;
  } | null>(null);

  // Initialize worker
  useEffect(() => {
    // Create highly optimized background thread worker using Vite native bundles
    const worker = new AIWorker();

    worker.onmessage = (event: MessageEvent) => {
      const response = event.data as WorkerResponse;
      setIsSearching(false);

      if (resolverRef.current) {
        if (response.success) {
          setSearchMetrics(response.metrics);
          resolverRef.current.resolve({
            move: response.move,
            metrics: response.metrics
          });
        } else {
          resolverRef.current.reject(new Error(response.error || 'AI Search failed'));
        }
        resolverRef.current = null;
      }
    };

    workerRef.current = worker;

    // Clean up worker on unmount
    return () => {
      worker.terminate();
    };
  }, []);

  /**
   * Triggers the AI search in the Web Worker.
   * Returns a Promise resolving to the selected best move and search metrics.
   */
  const getBestMove = useCallback(
    (
      board: Board,
      player: Player,
      config: AIConfig,
      currentHash: number,
      timeLimitMs: number
    ): Promise<{ move: Move; metrics: SearchMetrics }> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('AI Worker is not initialized'));
          return;
        }

        // Cancel previous active search if any
        if (resolverRef.current) {
          resolverRef.current.reject(new Error('Search cancelled by new request'));
        }

        setIsSearching(true);
        resolverRef.current = { resolve, reject };

        workerRef.current.postMessage({
          board,
          player,
          config,
          currentHash,
          timeLimitMs
        });
      });
    },
    []
  );

  const terminateActiveSearch = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current.reject(new Error('Search forced stopped'));
      resolverRef.current = null;
      setIsSearching(false);
    }
  }, []);

  return {
    getBestMove,
    isSearching,
    searchMetrics,
    terminateActiveSearch
  };
}
