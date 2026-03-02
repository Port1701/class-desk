import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '@/services/supabase.js';

const router = Router();

const SlugParamsSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(200),
});

// GET /:slug — Public endpoint to fetch a document by slug
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = SlugParamsSchema.parse(req.params);
    const supabase = getSupabaseClient();

    if (!supabase) {
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }

    const { data, error } = await supabase
      .from('documents')
      .select('title, content, slug')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ title: data.title, content: data.content, slug: data.slug });
  } catch (error) {
    next(error);
  }
});

export default router;
