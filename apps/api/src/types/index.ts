import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  timestamp: z.string().datetime(),
  services: z.object({
    redis: z.object({ available: z.boolean(), message: z.string() }),
    supabase: z.object({ available: z.boolean(), message: z.string() }),
    embeddings: z.object({ available: z.boolean(), message: z.string() }),
    langfuse: z.object({ available: z.boolean(), message: z.string() }),
  }),
  uptime: z.number(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  status: z.enum(['operational', 'degraded', 'down']),
  timestamp: z.string().datetime(),
  docs: z.string(),
});
export type ApiInfo = z.infer<typeof ApiInfoSchema>;

// Document schemas
export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  category: z.string().min(1).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
});
export type CreateDocument = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    content: z.string().min(1).max(50000).optional(),
    category: z.string().min(1).max(100).optional().nullable(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.content !== undefined ||
      data.category !== undefined ||
      data.tags !== undefined,
    { message: 'At least one field must be provided' },
  );
export type UpdateDocument = z.infer<typeof UpdateDocumentSchema>;

export const DocumentParamsSchema = z.object({
  id: z.string().uuid(),
});

export const DocumentListQuerySchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const DocumentResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  slug: z.string(),
  hasEmbedding: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;

export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
