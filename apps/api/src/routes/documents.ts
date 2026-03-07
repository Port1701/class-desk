import { Router } from 'express';
import type { Tables } from '@/../../supabase/types.js';
import { authenticateToken, requireAdmin, requireAdminOrInternal } from '@/middleware/auth.js';
import { generateEmbedding, isEmbeddingsAvailable } from '@/services/embeddings.js';
import { getSupabaseClient } from '@/services/supabase.js';
import {
  CreateDocumentSchema,
  DocumentListQuerySchema,
  DocumentParamsSchema,
  type DocumentResponse,
  UpdateDocumentSchema,
} from '@/types/index.js';

type DocumentRow = Tables<'documents'>;

const router = Router();

const buildSlug = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'document';
};

const generateUniqueSlug = async (
  title: string,
  supabase: ReturnType<typeof getSupabaseClient>,
  excludeId?: string,
): Promise<string> => {
  const base = buildSlug(title);
  if (!supabase) return base;
  let query = supabase.from('documents').select('slug').ilike('slug', `${base}%`);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;
  const existing = new Set((data ?? []).map((r) => r.slug));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

const buildEmbeddingText = (
  title: string,
  content: string,
  category?: string | null,
  tags?: string[] | null,
): string => {
  const parts = [title];
  if (category) parts.push(`Category: ${category}`);
  if (tags?.length) parts.push(`Tags: ${tags.join(', ')}`);
  parts.push('', content);
  return parts.join('\n');
};

// Split content into overlapping chunks for more precise vector retrieval.
// Tries to break at paragraph boundaries first, then sentence boundaries.
const CHUNK_SIZE = 800; // chars
const CHUNK_OVERLAP = 150; // chars

const chunkText = (content: string): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + CHUNK_SIZE, content.length);
    if (end < content.length) {
      const paraBreak = content.lastIndexOf('\n\n', end);
      if (paraBreak > start + CHUNK_SIZE / 2) {
        end = paraBreak + 2;
      } else {
        const sentBreak = content.lastIndexOf('. ', end);
        if (sentBreak > start + CHUNK_SIZE / 2) {
          end = sentBreak + 2;
        }
      }
    }
    const chunk = content.slice(start, end).trim();
    if (chunk.length >= 50) chunks.push(chunk);
    // Stop once we've consumed the entire content — prevents infinite loop
    // when content.length < CHUNK_OVERLAP (start would not advance past end)
    if (end >= content.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
};

// Delete existing chunks for a document and insert freshly chunked + embedded ones.
// Returns { inserted, failed } counts.
const upsertChunks = async (
  docId: string,
  title: string,
  content: string,
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<{ inserted: number; failed: number }> => {
  if (!supabase) return { inserted: 0, failed: 0 };
  await supabase.from('document_chunks').delete().eq('document_id', docId);
  const chunks = chunkText(content);
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < chunks.length; i++) {
    const embeddingText = `Title: ${title}\n\n${chunks[i]}`;
    const embedding = await generateEmbedding(embeddingText);
    if (!embedding) {
      failed++;
      continue;
    }
    const { error } = await supabase.from('document_chunks').insert({
      document_id: docId,
      chunk_index: i,
      content: chunks[i],
      embedding,
    });
    if (error) {
      failed++;
    } else {
      inserted++;
    }
  }
  return { inserted, failed };
};


const mapDocumentResponse = (row: DocumentRow): DocumentResponse => ({
  id: row.id,
  title: row.title,
  content: row.content,
  category: row.category,
  tags: row.tags ?? [],
  slug: row.slug,
  hasEmbedding: row.embedding !== null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// POST /embed-all — Re-embed all documents
router.post('/embed-all', authenticateToken, requireAdminOrInternal, async (_req, res, next) => {
  try {
    if (!isEmbeddingsAvailable()) {
      return res.status(503).json({ error: 'Embeddings service not available' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    const { data: docs, error } = await supabase
      .from('documents')
      .select('id, title, content, category, tags');

    if (error || !docs) {
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    let embedded = 0;
    let failed = 0;
    let chunksInserted = 0;
    let chunksFailed = 0;

    for (const doc of docs) {
      const embeddingText = buildEmbeddingText(doc.title, doc.content, doc.category, doc.tags);
      const embedding = await generateEmbedding(embeddingText);

      if (embedding) {
        const { error: updateError } = await supabase
          .from('documents')
          .update({ embedding })
          .eq('id', doc.id);

        if (updateError) {
          failed++;
        } else {
          embedded++;
        }
      } else {
        failed++;
      }

      // Also rechunk every document
      const chunkResult = await upsertChunks(doc.id, doc.title, doc.content, supabase);
      chunksInserted += chunkResult.inserted;
      chunksFailed += chunkResult.failed;
    }

    res.json({ total: docs.length, embedded, failed, chunksInserted, chunksFailed });
  } catch (error) {
    next(error);
  }
});

// POST / — Create document
router.post('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const body = CreateDocumentSchema.parse(req.body);
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const embeddingText = buildEmbeddingText(body.title, body.content, body.category, body.tags);
    const embedding = await generateEmbedding(embeddingText);
    const slug = await generateUniqueSlug(body.title, supabase);

    const { data, error } = await supabase
      .from('documents')
      .insert({
        title: body.title,
        content: body.content,
        category: body.category ?? null,
        tags: body.tags,
        slug,
        embedding: embedding ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /documents] Supabase error:', error);
      if (error.code === '23505') {
        return res.status(409).json({
          error:
            'A document with a similar title already exists. Please use a more distinct title.',
        });
      }
      return res.status(500).json({ error: 'Failed to create document' });
    }

    // Generate chunks + per-chunk embeddings (best-effort; don't fail the create)
    upsertChunks(data.id, data.title, data.content, supabase).catch((err) => {
      console.error('[POST /documents] Chunk upsert failed:', err);
    });

    res.status(201).json(mapDocumentResponse(data));
  } catch (error) {
    next(error);
  }
});

// GET / — List documents
router.get('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const query = DocumentListQuerySchema.parse(req.query);
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const from = (query.page - 1) * query.limit;
    const to = from + query.limit - 1;

    let dbQuery = supabase
      .from('documents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.category) {
      dbQuery = dbQuery.eq('category', query.category);
    }

    const { data, error, count } = await dbQuery;

    if (error) {
      console.error('[GET /documents] Supabase error:', error);
      return res.status(500).json({ error: 'Failed to list documents' });
    }

    const total = count ?? 0;

    res.json({
      documents: (data ?? []).map(mapDocumentResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /:id — Get single document
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = DocumentParamsSchema.parse(req.params);
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { data, error } = await supabase.from('documents').select('*').eq('id', id).single();

    if (error || !data) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(mapDocumentResponse(data));
  } catch (error) {
    next(error);
  }
});

// PUT /:id — Update document
router.put('/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { id } = DocumentParamsSchema.parse(req.params);
    const body = UpdateDocumentSchema.parse(req.body);
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.title !== undefined) {
      updateData.slug = await generateUniqueSlug(body.title, supabase, id);
    }

    // Re-embed if any field that feeds into the embedding changed
    const needsReembed =
      body.title !== undefined ||
      body.content !== undefined ||
      body.category !== undefined ||
      body.tags !== undefined;

    if (needsReembed) {
      const { data: current } = await supabase
        .from('documents')
        .select('title, content, category, tags')
        .eq('id', id)
        .single();

      if (current) {
        const title = body.title ?? current.title;
        const content = body.content ?? current.content;
        const category = body.category !== undefined ? body.category : current.category;
        const tags = body.tags ?? current.tags;
        const embeddingText = buildEmbeddingText(title, content, category, tags);
        const embedding = await generateEmbedding(embeddingText);
        if (embedding) {
          updateData.embedding = embedding;
        }
      }
    }

    const { data, error } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error:
            'A document with a similar title already exists. Please use a more distinct title.',
        });
      }
      return res.status(404).json({ error: 'Document not found' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Re-chunk whenever any content-bearing field changes (best-effort; don't fail the update)
    if (needsReembed) {
      upsertChunks(data.id, data.title, data.content, supabase).catch((err) => {
        console.error('[PUT /documents] Chunk upsert failed:', err);
      });
    }

    res.json(mapDocumentResponse(data));
  } catch (error) {
    next(error);
  }
});

// DELETE /:id — Delete document
router.delete('/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { id } = DocumentParamsSchema.parse(req.params);
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { data, error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .select('id')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ message: 'Document deleted', id: data.id });
  } catch (error) {
    next(error);
  }
});

// POST /:id/embed — Manual re-embed
router.post('/:id/embed', authenticateToken, requireAdminOrInternal, async (req, res, next) => {
  try {
    const { id } = DocumentParamsSchema.parse(req.params);

    if (!isEmbeddingsAvailable()) {
      return res.status(503).json({ error: 'Embeddings service not available' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('title, content, category, tags')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const embeddingText = buildEmbeddingText(doc.title, doc.content, doc.category, doc.tags);
    const embedding = await generateEmbedding(embeddingText);

    if (!embedding) {
      return res.status(503).json({ error: 'Failed to generate embedding' });
    }

    const { data, error } = await supabase
      .from('documents')
      .update({ embedding })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(500).json({ error: 'Failed to update embedding' });
    }

    // Also rechunk this document
    const chunkResult = await upsertChunks(data.id, data.title, data.content, supabase);

    res.json({
      ...mapDocumentResponse(data),
      chunksInserted: chunkResult.inserted,
      chunksFailed: chunkResult.failed,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
