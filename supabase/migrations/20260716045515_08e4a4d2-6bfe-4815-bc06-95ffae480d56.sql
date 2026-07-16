
CREATE TABLE public.scheduled_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_date DATE NOT NULL,
  slot SMALLINT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  pillar TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Idea',
  score INTEGER NOT NULL DEFAULT 70,
  notes TEXT,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.scheduled_posts TO service_role;

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE INDEX scheduled_posts_date_idx ON public.scheduled_posts (scheduled_date, slot);

CREATE TRIGGER update_scheduled_posts_updated_at
  BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
