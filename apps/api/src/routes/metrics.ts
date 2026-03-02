import { Router } from 'express';
import { authenticateToken, requireAdmin } from '@/middleware/auth.js';
import { getLangfuse, isLangfuseAvailable } from '@/services/langfuse.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

// GET /daily — Daily conversation and generation counts
router.get('/daily', async (req, res, next) => {
  try {
    if (!isLangfuseAvailable()) {
      return res.status(503).json({ error: 'Langfuse not available' });
    }

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(503).json({ error: 'Langfuse service unavailable' });
    }
    const days = Math.min(Number(req.query.days) || 30, 90);

    const now = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    const baseQuery = {
      metrics: [{ measure: 'count', aggregation: 'count' }],
      timeDimension: { granularity: 'day' },
      fromTimestamp: from.toISOString(),
      toTimestamp: now.toISOString(),
    };

    // Fetch trace counts (conversations) and observation counts (generations) in parallel
    const [tracesResult, observationsResult] = await Promise.all([
      langfuse.api.metricsMetrics({
        query: JSON.stringify({
          ...baseQuery,
          view: 'traces',
        }),
      }),
      langfuse.api.metricsMetrics({
        query: JSON.stringify({
          ...baseQuery,
          view: 'observations',
        }),
      }),
    ]);

    console.log('[metrics] Traces result:', JSON.stringify(tracesResult, null, 2).slice(0, 500));
    console.log(
      '[metrics] Observations result:',
      JSON.stringify(observationsResult, null, 2).slice(0, 500),
    );

    // Build a map of date → counts
    const dailyMap = new Map<
      string,
      { date: string; traceCount: number; generationCount: number }
    >();

    // Type helper to handle { data: [...] } or { metrics: [...] }
    const getMetricsArray = (result: unknown): unknown[] => {
      if (typeof result !== 'object' || result === null) return [];
      const obj = result as Record<string, unknown>;
      return Array.isArray(obj.data) ? obj.data : Array.isArray(obj.metrics) ? obj.metrics : [];
    };

    // tracesResult is { data: [...] } or { metrics: [...] }
    const tracesData = getMetricsArray(tracesResult);
    if (Array.isArray(tracesData)) {
      for (const row of tracesData) {
        const rowObj = row as Record<string, unknown>;
        const date = rowObj.timeDimension as string;
        if (!date) continue;
        const key = date.slice(0, 10); // YYYY-MM-DD
        const existing = dailyMap.get(key) ?? {
          date: key,
          traceCount: 0,
          generationCount: 0,
        };
        // Extract count value — look for any field with "count" in the name
        const countKey = Object.keys(rowObj).find((k) => k.includes('count'));
        existing.traceCount = countKey ? ((rowObj[countKey] as number) ?? 0) : 0;
        dailyMap.set(key, existing);
      }
    }

    // observationsResult is { data: [...] } or { metrics: [...] }
    const observationsData = getMetricsArray(observationsResult);
    if (Array.isArray(observationsData)) {
      for (const row of observationsData) {
        const rowObj = row as Record<string, unknown>;
        const date = rowObj.timeDimension as string;
        if (!date) continue;
        const key = date.slice(0, 10);
        const existing = dailyMap.get(key) ?? {
          date: key,
          traceCount: 0,
          generationCount: 0,
        };
        // Extract count value — look for any field with "count" in the name
        const countKey = Object.keys(rowObj).find((k) => k.includes('count'));
        existing.generationCount = countKey ? ((rowObj[countKey] as number) ?? 0) : 0;
        dailyMap.set(key, existing);
      }
    }

    // Sort most recent first
    const daily = [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date));

    console.log('[metrics] Final daily stats:', daily.length, 'days');
    res.json({ daily });
  } catch (error) {
    console.error('[metrics] Error:', error);
    next(error);
  }
});

export default router;
