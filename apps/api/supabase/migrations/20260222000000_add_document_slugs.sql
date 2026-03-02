-- Slugify helper: lowercase, strip non-alphanumeric/space, collapse spaces to
-- hyphens, then strip any leading/trailing hyphens produced by that process
CREATE OR REPLACE FUNCTION slugify (title TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(title), '[^a-z0-9[:space:]]', '', 'g'),
        '[[:space:]]+', '-', 'g'
      ),
      '-+', '-', 'g'
    ),
    '^-|-$', '', 'g'
  );
$$ LANGUAGE sql IMMUTABLE;


-- Add slug column if it doesn't already exist (idempotent)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS slug TEXT;


-- Backfill only rows that don't yet have a slug, in created_at order,
-- resolving duplicates with -2, -3, etc.
DO $$
DECLARE rec RECORD; base_slug TEXT; new_slug TEXT; suffix INT;
BEGIN
  FOR rec IN SELECT id, title FROM documents WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := slugify(rec.title);
    -- Fallback for titles that slugify to empty string or bare hyphen
    IF base_slug IS NULL OR base_slug = '' OR base_slug = '-' THEN
      base_slug := 'document-' || replace(rec.id::text, '-', '');
    END IF;
    new_slug := base_slug;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM documents WHERE slug = new_slug AND id != rec.id) LOOP
      new_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE documents SET slug = new_slug WHERE id = rec.id;
  END LOOP;
END $$;


-- Enforce NOT NULL (safe to repeat — Postgres no-ops if already NOT NULL)
ALTER TABLE documents
ALTER COLUMN slug
SET NOT NULL;


-- Add unique constraint only if it doesn't already exist (idempotent)
-- (The UNIQUE constraint implicitly creates an index — no separate CREATE INDEX needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_slug_unique'
  ) THEN
    ALTER TABLE documents ADD CONSTRAINT documents_slug_unique UNIQUE (slug);
  END IF;
END $$;


-- Update match_documents RPC to return slug
-- Must DROP first — CREATE OR REPLACE cannot change the return type
DROP FUNCTION IF EXISTS match_documents (extensions.vector (1536), float, int);


CREATE FUNCTION match_documents (
  query_embedding extensions.vector (1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
) RETURNS TABLE (
  id uuid,
  title text,
  content text,
  category text,
  tags TEXT[],
  slug text,
  similarity float
) LANGUAGE sql STABLE AS $$
  SELECT d.id, d.title, d.content, d.category, d.tags, d.slug,
    (1 - (d.embedding <=> query_embedding))::float AS similarity
  FROM documents d
  WHERE d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;
