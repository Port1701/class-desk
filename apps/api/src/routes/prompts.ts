import { Router } from 'express';
import { authenticateToken, requireAdminOrInternal } from '@/middleware/auth.js';
import { getLangfuse, isLangfuseAvailable } from '@/services/langfuse.js';

const router = Router();

router.use(authenticateToken, requireAdminOrInternal);

// GET / — List all prompts
router.get('/', async (_req, res, next) => {
  try {
    if (!isLangfuseAvailable()) {
      return res.status(503).json({ error: 'Langfuse not available' });
    }

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(503).json({ error: 'Langfuse service unavailable' });
    }
    const result = await langfuse.api.promptsList({});
    console.log('[prompts] List result:', JSON.stringify(result, null, 2).slice(0, 300));
    res.json(result);
  } catch (error) {
    console.error('[prompts] Error listing prompts:', error);
    next(error);
  }
});

// GET /:name — Get prompt by name
router.get('/:name', async (req, res, next) => {
  try {
    if (!isLangfuseAvailable()) {
      return res.status(503).json({ error: 'Langfuse not available' });
    }

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(503).json({ error: 'Langfuse service unavailable' });
    }
    const { name } = req.params;
    const label = req.query.label as string | undefined;
    const version = req.query.version ? Number(req.query.version) : undefined;

    // Build query object with optional params
    const queryParams: Record<string, string | number | undefined> = {};
    if (label) queryParams.label = label;
    if (version) queryParams.version = version;

    const result = await langfuse.api.promptsGet({
      promptName: name,
      ...queryParams,
    });

    res.json(result);
  } catch (error) {
    console.error(`[prompts] Error getting prompt ${name}:`, error);
    next(error);
  }
});

// PUT /:name — Update prompt (creates new version in Langfuse)
router.put('/:name', async (req, res, next) => {
  try {
    if (!isLangfuseAvailable()) {
      return res.status(503).json({ error: 'Langfuse not available' });
    }

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(503).json({ error: 'Langfuse service unavailable' });
    }
    const { name } = req.params;
    const { prompt, config, labels, type } = req.body;

    if (prompt === undefined) {
      return res.status(400).json({ error: 'prompt field is required' });
    }

    const promptType = type || 'text';

    const result = await langfuse.api.promptsCreate({
      name,
      prompt,
      type: promptType,
      config: config ?? undefined,
      labels: labels ?? ['latest'],
    });

    console.log(`[prompts] Created version for ${name}:`, result);
    res.json(result);
  } catch (error) {
    console.error(`[prompts] Error updating prompt ${name}:`, error);
    next(error);
  }
});

export default router;
