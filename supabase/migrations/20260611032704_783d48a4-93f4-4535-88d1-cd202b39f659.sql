
CREATE TABLE public.polar_webhooks (
  id text PRIMARY KEY,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['EXERCISE']::text[],
  signature_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.polar_webhooks TO authenticated;
GRANT ALL ON public.polar_webhooks TO service_role;

ALTER TABLE public.polar_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polar_webhooks admin read"
  ON public.polar_webhooks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
