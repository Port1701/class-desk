import { Router } from 'express';
import { isEmbeddingsAvailable } from '@/services/embeddings.js';
import { isLangfuseAvailable } from '@/services/langfuse.js';
import { getRedisClient } from '@/services/redis.js';
import { getSupabaseClient } from '@/services/supabase.js';
import { HealthResponseSchema } from '@/types/index.js';

const router = Router();
const startTime = Date.now();

router.get('/', async (_req, res) => {
  try {
    let redisMessage = 'Not connected';
    let redisHealthy = false;
    const redisClient = getRedisClient();

    if (redisClient) {
      try {
        await redisClient.ping();
        redisMessage = 'Connected and responding to ping';
        redisHealthy = true;
      } catch {
        redisMessage = 'Connection failed';
      }
    } else {
      redisMessage = 'Not initialized';
    }

    let supabaseMessage = 'Not connected';
    let supabaseHealthy = false;
    const supabaseClient = getSupabaseClient();

    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.from('documents').select('id').limit(1);
        if (error && error.code !== 'PGRST116') {
          supabaseMessage = `Connection failed: ${error.message}`;
        } else {
          supabaseMessage = 'Connected and responding';
          supabaseHealthy = true;
        }
      } catch (err) {
        supabaseMessage = `Connection test error: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      supabaseMessage = 'Not initialized';
    }

    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const healthResponse = {
      status: redisHealthy && supabaseHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        redis: { available: redisHealthy, message: redisMessage },
        supabase: { available: supabaseHealthy, message: supabaseMessage },
        embeddings: {
          available: isEmbeddingsAvailable(),
          message: isEmbeddingsAvailable()
            ? 'OpenAI embeddings active'
            : 'Embeddings not configured',
        },
        langfuse: {
          available: isLangfuseAvailable(),
          message: isLangfuseAvailable() ? 'Langfuse connected' : 'Langfuse not configured',
        },
      },
      uptime,
    };

    const validated = HealthResponseSchema.parse(healthResponse);
    res.json(validated);
  } catch (error) {
    console.error('[GET /health] Error:', error);
    res.status(500).json({ error: 'Failed to generate health status' });
  }
});

export default router;
