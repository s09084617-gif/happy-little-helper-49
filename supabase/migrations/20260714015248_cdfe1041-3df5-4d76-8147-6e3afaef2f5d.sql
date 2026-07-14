CREATE TABLE public.analytics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_hash text NOT NULL UNIQUE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.analytics_cache TO service_role;
ALTER TABLE public.analytics_cache ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (server-side) can read/write.
CREATE INDEX analytics_cache_created_at_idx ON public.analytics_cache (created_at DESC);