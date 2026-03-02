import type { NextFunction, Request, Response } from 'express';
import { getAdminEmails as getEnvAdminEmails } from '@/config/environment.js';
import { getSupabaseClient } from '@/services/supabase.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        isAdmin: boolean;
      };
    }
  }
}

let cachedDbEmails: string[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

const loadAdminEmails = async (): Promise<string[]> => {
  const envEmails = getEnvAdminEmails();

  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS) {
    return [...new Set([...envEmails, ...cachedDbEmails])];
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return envEmails;
  }

  try {
    const { data } = await supabase.from('admin_emails').select('email');

    cachedDbEmails = (data ?? []).map((row) => row.email.toLowerCase());
    cacheTimestamp = now;
  } catch {
    // Keep stale cache on error
  }

  return [...new Set([...envEmails, ...cachedDbEmails])];
};

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check for BYPASS_AUTH mode (development only)
    if (process.env.BYPASS_AUTH === 'true') {
      req.user = {
        id: 'local-dev-user',
        email: 'dev@localhost',
        isAdmin: true,
      };
      return next();
    }

    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7);

    // Validate token with Supabase
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userEmail = (data.user.email || '').toLowerCase();
    const adminEmails = await loadAdminEmails();

    req.user = {
      id: data.user.id,
      email: userEmail,
      isAdmin: adminEmails.includes(userEmail),
    };

    next();
  } catch (error) {
    console.error('[authenticateToken] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const invalidateAdminCache = () => {
  cacheTimestamp = 0;
};
