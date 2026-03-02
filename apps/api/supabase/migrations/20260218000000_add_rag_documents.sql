CREATE EXTENSION if NOT EXISTS vector
WITH
  schema extensions;


CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  tags TEXT[] DEFAULT '{}',
  embedding extensions.vector (1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX documents_embedding_idx ON public.documents USING hnsw (embedding extensions.vector_cosine_ops);


CREATE INDEX documents_category_idx ON public.documents (category);


CREATE INDEX documents_created_at_idx ON public.documents (created_at DESC);


CREATE OR REPLACE FUNCTION public.set_updated_at () returns trigger language plpgsql AS $$
begin new.updated_at = now(); return new; end; $$;


CREATE TRIGGER documents_updated_at before
UPDATE ON public.documents FOR each ROW
EXECUTE function public.set_updated_at ();


CREATE OR REPLACE FUNCTION public.match_documents (
  query_embedding extensions.vector (1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
) returns TABLE (
  id uuid,
  title text,
  content text,
  category text,
  tags TEXT[],
  similarity float
) language sql stable AS $$
  select d.id, d.title, d.content, d.category, d.tags,
    (1 - (d.embedding <=> query_embedding))::float as similarity
  from public.documents d
  where d.embedding is not null
    and (1 - (d.embedding <=> query_embedding)) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;


ALTER TABLE public.documents enable ROW level security;


CREATE POLICY "service role full access" ON public.documents FOR ALL TO service_role USING (TRUE)
WITH
  CHECK (TRUE);


CREATE POLICY "public read" ON public.documents FOR
SELECT
  TO anon,
  authenticated USING (TRUE);
