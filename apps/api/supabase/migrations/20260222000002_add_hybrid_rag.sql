-- Hybrid RAG: chunked vector search + fuzzy keyword search (pg_trgm + tsvector)
-- pg_trgm for fuzzy/typo-tolerant text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- Chunked embeddings: each document is split into overlapping chunks,
-- each with its own embedding. This gives more precise vector retrieval
-- than embedding the full document as one unit.
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding extensions.vector (1536),
  created_at timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks (document_id);


CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding extensions.vector_cosine_ops);


-- RLS: match the same access pattern as the documents table
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_chunks'
      AND policyname = 'service role full access'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role full access" ON document_chunks
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_chunks'
      AND policyname = 'public read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "public read" ON document_chunks
        FOR SELECT TO anon, authenticated USING (true)
    $policy$;
  END IF;
END $$;


-- GIN trigram index on lowercased document content for case-insensitive fuzzy text search.
-- Uses a functional index on lower(content) so that queries comparing lower(keyword)
-- against lower(content) can use this index with the <% operator.
CREATE INDEX IF NOT EXISTS documents_content_trgm_idx ON documents USING gin (lower(content) gin_trgm_ops);


-- GIN tsvector index on document content for fast full-text search (keyword ranking)
CREATE INDEX IF NOT EXISTS documents_content_fts_idx ON documents USING gin (to_tsvector('english', content));


-- match_chunks: vector similarity search over chunks, returns chunk content +
-- parent document metadata for citation. Replaces match_documents in the chat tool.
CREATE OR REPLACE FUNCTION match_chunks (
  query_embedding extensions.vector (1536),
  match_threshold float DEFAULT 0.45,
  match_count int DEFAULT 20
) RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  title text,
  slug text,
  chunk_content text,
  chunk_index int,
  similarity float
) LANGUAGE sql STABLE AS $$
  SELECT
    c.id              AS chunk_id,
    c.document_id,
    d.title,
    d.slug,
    c.content         AS chunk_content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM document_chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- search_documents_fuzzy: finds documents whose content fuzzy-matches a keyword.
-- Uses word_similarity() directly (no SET LOCAL) so this can be marked STABLE.
-- Combines pg_trgm word similarity (typo-tolerant) with tsvector full-text search.
-- Returns full document content so app code can extract 40-word context windows.
--
-- Note: word_similarity() does not use GIN index support — it performs a sequential
-- scan on the filtered set. For this corpus size (tens to low hundreds of documents)
-- this is effectively instant. The GIN index on lower(content) is available for
-- future use with the <% operator if a SET LOCAL-free approach is added.
CREATE OR REPLACE FUNCTION search_documents_fuzzy (
  keyword text,
  word_sim_threshold float DEFAULT 0.35,
  match_count int DEFAULT 10
) RETURNS TABLE (id uuid, title text, content text, slug text) LANGUAGE sql STABLE AS $$
  SELECT d.id, d.title, d.content, d.slug
  FROM documents d
  WHERE
    -- Trigram fuzzy match: tolerates typos (e.g. "roomates" matches "roommate")
    word_similarity(lower(keyword), lower(d.content)) > word_sim_threshold
    -- OR full-text keyword match (correctly-spelled, stop-word filtered, uses FTS index)
    OR to_tsvector('english', d.content) @@ plainto_tsquery('english', keyword)
  ORDER BY
    -- Combined score: tsvector relevance + trigram similarity (both 0-1 range)
    ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', keyword)) +
    word_similarity(lower(keyword), lower(d.content)) DESC
  LIMIT match_count;
$$;
