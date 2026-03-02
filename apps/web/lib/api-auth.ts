import { ApiError } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new ApiError('Not authenticated', 401);
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
};

const authRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers = await getAuthHeaders();
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `API error: ${response.status}`,
      response.status,
      errorData,
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
};

export const authGet = <T>(endpoint: string): Promise<T> =>
  authRequest<T>(endpoint, { method: 'GET' });

export const authPost = <T, D = unknown>(endpoint: string, data?: D): Promise<T> =>
  authRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });

export const authPut = <T, D = unknown>(endpoint: string, data?: D): Promise<T> =>
  authRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });

export const authDel = <T>(endpoint: string): Promise<T> =>
  authRequest<T>(endpoint, { method: 'DELETE' });
