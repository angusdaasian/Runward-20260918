
CREATE TABLE public.territory_hexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hex_id text NOT NULL UNIQUE,
  region text NOT NULL,
  owner_user_id uuid NOT NULL,
  owner_display_name text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_activity_id text,
  capture_count integer NOT NULL DEFAULT 1
);
CREATE INDEX idx_territory_hexes_region ON public.territory_hexes(region);
CREATE INDEX idx_territory_hexes_owner ON public.territory_hexes(owner_user_id);
ALTER TABLE public.territory_hexes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read all hexes" ON public.territory_hexes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access territory_hexes" ON public.territory_hexes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.territory_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hex_id text NOT NULL,
  user_id uuid NOT NULL,
  activity_id text,
  region text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_territory_captures_user ON public.territory_captures(user_id);
CREATE INDEX idx_territory_captures_hex ON public.territory_captures(hex_id);
ALTER TABLE public.territory_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own captures" ON public.territory_captures FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access territory_captures" ON public.territory_captures FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.territory_processed_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_source text NOT NULL,
  activity_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_source, activity_id)
);
ALTER TABLE public.territory_processed_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own processed" ON public.territory_processed_activities FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access territory_processed" ON public.territory_processed_activities FOR ALL TO service_role USING (true) WITH CHECK (true);
