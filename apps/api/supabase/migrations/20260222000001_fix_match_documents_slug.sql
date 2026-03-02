-- Drop match_documents using the catalog to find its exact signature,
-- regardless of how the vector type is named (vector, extensions.vector, etc.)
DO $$
DECLARE sig text;
BEGIN
  SELECT oid::regprocedure INTO sig
  FROM pg_proc
  WHERE proname = 'match_documents'
  LIMIT 1;

  IF sig IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION ' || sig;
  END IF;
END $$;


-- Recreate match_documents with slug in the return type
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
