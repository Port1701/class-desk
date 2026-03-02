-- Ensure admin_emails table doesn't already exist
DO $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_emails'
  ) then
    raise exception 'admin_emails table already exists';
  end if;
end $$;


CREATE TABLE public.admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_emails_email_unique UNIQUE (email)
);


CREATE INDEX admin_emails_email_idx ON public.admin_emails (email);


ALTER TABLE public.admin_emails enable ROW level security;


CREATE POLICY "service role full access" ON public.admin_emails FOR ALL TO service_role USING (TRUE)
WITH
  CHECK (TRUE);
