
CREATE TABLE public.territory_cities (
  slug text PRIMARY KEY,
  display_name text NOT NULL,
  display_name_zh text,
  country text,
  admin1 text,
  bbox jsonb NOT NULL,
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  total_hex_count integer NOT NULL DEFAULT 0,
  polygon_filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.territory_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read territory_cities"
ON public.territory_cities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access territory_cities"
ON public.territory_cities FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.territory_city_hexes (
  hex_id text PRIMARY KEY,
  city_slug text NOT NULL REFERENCES public.territory_cities(slug) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_territory_city_hexes_slug ON public.territory_city_hexes(city_slug);

ALTER TABLE public.territory_city_hexes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read territory_city_hexes"
ON public.territory_city_hexes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access territory_city_hexes"
ON public.territory_city_hexes FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.territory_hexes ADD COLUMN IF NOT EXISTS city_slug text;
CREATE INDEX IF NOT EXISTS idx_territory_hexes_city_slug ON public.territory_hexes(city_slug);
CREATE INDEX IF NOT EXISTS idx_territory_hexes_owner ON public.territory_hexes(owner_user_id);
