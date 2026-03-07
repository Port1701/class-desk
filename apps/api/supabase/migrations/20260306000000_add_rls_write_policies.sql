-- Add explicit RLS write policies to restrict database mutations to service_role only
-- This prevents unauthorized writes from anonymous and authenticated users
-- Documents table: Restrict INSERT, UPDATE, DELETE to service_role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND policyname = 'service role insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role insert" ON public.documents
        FOR INSERT TO service_role WITH CHECK (TRUE)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND policyname = 'service role update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role update" ON public.documents
        FOR UPDATE TO service_role USING (TRUE) WITH CHECK (TRUE)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND policyname = 'service role delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role delete" ON public.documents
        FOR DELETE TO service_role USING (TRUE)
    $policy$;
  END IF;
END $$;


-- Admin emails table: Restrict INSERT, UPDATE, DELETE to service_role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_emails'
      AND policyname = 'service role insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role insert" ON public.admin_emails
        FOR INSERT TO service_role WITH CHECK (TRUE)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_emails'
      AND policyname = 'service role update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role update" ON public.admin_emails
        FOR UPDATE TO service_role USING (TRUE) WITH CHECK (TRUE)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_emails'
      AND policyname = 'service role delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role delete" ON public.admin_emails
        FOR DELETE TO service_role USING (TRUE)
    $policy$;
  END IF;
END $$;


-- Document chunks table: Restrict INSERT, UPDATE, DELETE to service_role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_chunks'
      AND policyname = 'service role insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role insert" ON public.document_chunks
        FOR INSERT TO service_role WITH CHECK (TRUE)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_chunks'
      AND policyname = 'service role update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role update" ON public.document_chunks
        FOR UPDATE TO service_role USING (TRUE) WITH CHECK (TRUE)
    $policy$;
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_chunks'
      AND policyname = 'service role delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service role delete" ON public.document_chunks
        FOR DELETE TO service_role USING (TRUE)
    $policy$;
  END IF;
END $$;
