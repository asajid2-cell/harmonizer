/**
 * Custom hook for fetching index statistics
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient, StatsResponse } from '../api/client';

interface UseStatsReturn {
  stats: StatsResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useStats = (autoRefresh: boolean = true): UseStatsReturn => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.getStats();
      setStats(response);
    } catch (err: any) {
      console.error('Stats error:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to fetch stats');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      fetchStats();

      // Refresh every 10 seconds
      const interval = setInterval(fetchStats, 10000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
  };
};

export default useStats;
