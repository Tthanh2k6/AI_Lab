import { useEffect, useRef, useState, useCallback } from 'react';
import { Board, Player, AIConfig, Move, SearchMetrics } from '../types/game';
import AIWorker from '../workers/ai.worker?worker';
import type { SearchRequest, SearchResponse } from '../workers/ai.worker';

/** Thrown to the caller when its search was superseded or force-stopped (not a real failure). */
export class SearchCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchCancelled';
  }
}

export interface SearchResult {
  move: Move;
  metrics: SearchMetrics;
}

export function useAIWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMetrics, setSearchMetrics] = useState<SearchMetrics | null>(null);

  // Monotonic id so a late reply from an old (cancelled) search can never be
  // mistaken for the reply to the current one — the worker runs requests
  // sequentially and will still finish the old one first.
  const requestSeq = useRef(0);

  // Keep track of the active search's Promise resolve/reject callbacks
  const resolverRef = useRef<{
    id: number;
    resolve: (value: SearchResult) => void;
    reject: (reason: Error) => void;
  } | null>(null);

  // Initialize worker
  useEffect(() => {
    // Create highly optimized background thread worker using Vite native bundles
    const worker = new AIWorker();

    worker.onmessage = (event: MessageEvent<SearchResponse>) => {
      const response = event.data;
      const active = resolverRef.current;
      if (!active || active.id !== response.requestId) return; // stale reply

      resolverRef.current = null;
      setIsSearching(false);

      if (response.success) {
        setSearchMetrics(response.metrics);
        active.resolve({ move: response.move, metrics: response.metrics });
      } else {
        active.reject(new Error(response.error || 'AI Search failed'));
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
   * Calling it again while a search is pending rejects the pending promise with
   * SearchCancelledError.
   */
  const getBestMove = useCallback(
    (
      board: Board,
      player: Player,
      config: AIConfig,
      currentHash: number,
      timeLimitMs: number
    ): Promise<SearchResult> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('AI Worker is not initialized'));
          return;
        }

        // Cancel previous active search if any
        if (resolverRef.current) {
          resolverRef.current.reject(new SearchCancelledError('Search cancelled by new request'));
        }

        const id = ++requestSeq.current;
        setIsSearching(true);
        resolverRef.current = { id, resolve, reject };

        const request: SearchRequest = { requestId: id, board, player, config, currentHash, timeLimitMs };
        workerRef.current.postMessage(request);
      });
    },
    []
  );

  const terminateActiveSearch = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current.reject(new SearchCancelledError('Search forced stopped'));
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
