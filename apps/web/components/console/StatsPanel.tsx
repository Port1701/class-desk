'use client';

import { useCallback, useEffect, useState } from 'react';
import { authGet } from '@/lib/api-auth';

interface DailyStats {
  date: string;
  traceCount: number;
  generationCount: number;
}

const StatsPanel = () => {
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authGet<{ daily: DailyStats[] }>('/metrics/daily?days=30');
      setDaily(data.daily);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <p className="text-sm text-primary-light py-8 text-center">Loading...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400 py-8 text-center">{error}</p>;
  }

  const totalConversations = daily.reduce((sum, d) => sum + d.traceCount, 0);
  const totalGenerations = daily.reduce((sum, d) => sum + d.generationCount, 0);

  return (
    <div>
      <p className="text-sm text-gray-300 mb-4">Last 30 days</p>

      {daily.length === 0 ? (
        <p className="text-sm text-gray-300 py-8 text-center">No data available</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-primary-light">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium text-right">Conversations</th>
                <th className="pb-2 font-medium text-right">Generations</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr key={row.date} className="border-b border-gray-700 hover:bg-gray-800">
                  <td className="py-2 text-gray-300">{row.date}</td>
                  <td className="py-2 text-right text-gray-300">
                    {row.traceCount.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-gray-300">
                    {row.generationCount.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-600 font-medium">
                <td className="py-2 text-primary-light">Total</td>
                <td className="py-2 text-right text-primary-light">
                  {totalConversations.toLocaleString()}
                </td>
                <td className="py-2 text-right text-primary-light">
                  {totalGenerations.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StatsPanel;
