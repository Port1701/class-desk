'use client';

import { useEffect, useState } from 'react';
import api, { ApiError } from '@/lib/api';

interface HealthResponse {
  status: string;
  timestamp: string;
  services: {
    redis: { available: boolean; message: string };
    supabase: { available: boolean; message: string };
  };
  uptime: number;
}

const ApiStatus = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        // Using the centralized API utility from lib/
        const data = await api.get<HealthResponse>('/health');
        setHealth(data);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`API error: ${err.message} (Status: ${err.status})`);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to connect to API');
        }
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };

    checkApiHealth();
  }, []);

  const getStatusColor = (available: boolean) => (available ? 'text-green-400' : 'text-red-400');

  const getStatusIcon = (available: boolean) => (available ? '✓' : '✗');

  if (loading) {
    return (
      <div className="w-full max-w-md p-6 border border-gray-700 rounded-lg bg-gray-800">
        <h3 className="text-lg font-semibold mb-3 text-white">API Status</h3>
        <p className="text-sm text-gray-400">Checking connection...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md p-6 border border-red-900 rounded-lg bg-red-950">
        <h3 className="text-lg font-semibold mb-3 text-red-100">API Status</h3>
        <p className="text-sm text-red-300">✗ Unable to connect to API</p>
        <p className="text-xs text-red-400 mt-2">{error}</p>
        <p className="text-xs text-gray-400 mt-3">
          Make sure the API is running at{' '}
          <code className="bg-red-900 px-1 rounded">
            {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-6 border border-gray-700 rounded-lg bg-gray-800">
      <h3 className="text-lg font-semibold mb-3 text-white">API Status</h3>

      {health && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Overall:</span>
            <span className="font-medium text-blue-400">
              {health.status === 'healthy' ? '✓' : '⚠'} {health.status}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Redis:</span>
            <span className={`font-medium ${getStatusColor(health.services.redis.available)}`}>
              {getStatusIcon(health.services.redis.available)}{' '}
              {health.services.redis.available ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Supabase:</span>
            <span className={`font-medium ${getStatusColor(health.services.supabase.available)}`}>
              {getStatusIcon(health.services.supabase.available)}{' '}
              {health.services.supabase.available ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-700">
            Redis: {health.services.redis.message}
          </p>
          <p className="text-xs text-gray-400">Supabase: {health.services.supabase.message}</p>
        </div>
      )}
    </div>
  );
};

export default ApiStatus;
