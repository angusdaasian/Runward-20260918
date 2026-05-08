
CREATE TABLE public.territory_landmarks (
  hex_id text PRIMARY KEY,
  name text NOT NULL,
  name_zh text,
  category text NOT NULL,
  icon text,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  country text,
  city_slug text,
  osm_id bigint,
  osm_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_landmarks_city ON public.territory_landmarks(city_slug);
CREATE INDEX idx_landmarks_category ON public.territory_landmarks(category);

ALTER TABLE public.territory_landmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read landmarks"
  ON public.territory_landmarks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access landmarks"
  ON public.territory_landmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.territory_landmark_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hex_id text NOT NULL REFERENCES public.territory_landmarks(hex_id) ON DELETE CASCADE,
  activity_id text,
  first_captured_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, hex_id)
);

CREATE INDEX idx_landmark_caps_user ON public.territory_landmark_captures(user_id);
CREATE INDEX idx_landmark_caps_hex ON public.territory_landmark_captures(hex_id);

ALTER TABLE public.territory_landmark_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own landmark captures"
  ON public.territory_landmark_captures FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access landmark captures"
  ON public.territory_landmark_captures FOR ALL TO service_role
  USING (true) WITH CHECK (true);
