/**
 * Custom hook for code search
 */

import { useState, useCallback } from 'react';
import { apiClient, SearchRequest, SearchResponse, SearchResult } from '../api/client';

interface UseSearchReturn {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  searchTime: number;
  search: (query: string, options?: Partial<SearchRequest>) => Promise<void>;
  clear: () => void;
}

export const useSearch = (): UseSearchReturn => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTime, setSearchTime] = useState(0);

  const search = useCallback(async (query: string, options?: Partial<SearchRequest>) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response: SearchResponse = await apiClient.search({
        query,
        limit: options?.limit || 20,
        min_similarity: options?.min_similarity || 0.0,
        symbol_type: options?.symbol_type,
      });

      setResults(response.results);
      setSearchTime(response.search_time_ms);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.detail || err.message || 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    setSearchTime(0);
  }, []);

  return {
    results,
    isLoading,
    error,
    searchTime,
    search,
    clear,
  };
};

export default useSearch;
