import { Router } from 'express';
import { isRedisAvailable } from '@/services/redis.js';
import { isSupabaseAvailable } from '@/services/supabase.js';
import { ApiInfoSchema } from '@/types/index.js';

const router = Router();

router.get('/', (_req, res) => {
  try {
    const redisAvailable = isRedisAvailable();
    const supabaseAvailable = isSupabaseAvailable();

    const apiInfo = {
      name: 'API',
      version: '1.0.0',
      description: 'Next.js + Express API template',
      status: redisAvailable && supabaseAvailable ? 'operational' : 'degraded',
      timestamp: new Date().toISOString(),
      docs: '/health',
    };

    const validated = ApiInfoSchema.parse(apiInfo);
    res.json(validated);
  } catch (error) {
    console.error('[GET /] Error:', error);
    res.status(500).json({ error: 'Failed to generate API info' });
  }
});

export default router;
