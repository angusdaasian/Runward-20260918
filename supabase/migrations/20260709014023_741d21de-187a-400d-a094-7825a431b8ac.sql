
-- run_type enum
DO $$ BEGIN
  CREATE TYPE public.run_type_enum AS ENUM ('Recovery','Easy','Long','Tempo','Interval','Race');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shoe_category_enum AS ENUM ('daily','easy','tempo','interval','race','trail','recovery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Shoes catalog (AI-generated master list)
CREATE TABLE IF NOT EXISTS public.shoes_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  category public.shoe_category_enum NOT NULL DEFAULT 'daily',
  description text,
  year integer,
  image_url text,
  source text NOT NULL DEFAULT 'ai',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, model)
);
CREATE INDEX IF NOT EXISTS idx_shoes_catalog_brand ON public.shoes_catalog(brand);
CREATE INDEX IF NOT EXISTS idx_shoes_catalog_category ON public.shoes_catalog(category);

GRANT SELECT ON public.shoes_catalog TO authenticated;
GRANT SELECT ON public.shoes_catalog TO anon;
GRANT ALL ON public.shoes_catalog TO service_role;
ALTER TABLE public.shoes_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active catalog" ON public.shoes_catalog
  FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage catalog" ON public.shoes_catalog
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) User shoes
CREATE TABLE IF NOT EXISTS public.user_shoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  catalog_id uuid REFERENCES public.shoes_catalog(id) ON DELETE SET NULL,
  custom_brand text,
  custom_model text,
  nickname text,
  purchase_date date,
  max_km numeric NOT NULL DEFAULT 700,
  retired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (catalog_id IS NOT NULL OR (custom_brand IS NOT NULL AND custom_model IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_user_shoes_user ON public.user_shoes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_shoes TO authenticated;
GRANT ALL ON public.user_shoes TO service_role;
ALTER TABLE public.user_shoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shoes" ON public.user_shoes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_shoes_updated
  BEFORE UPDATE ON public.user_shoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) User shoe defaults per run type
CREATE TABLE IF NOT EXISTS public.user_shoe_defaults (
  user_id uuid NOT NULL,
  run_type public.run_type_enum NOT NULL,
  user_shoe_id uuid NOT NULL REFERENCES public.user_shoes(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, run_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_shoe_defaults TO authenticated;
GRANT ALL ON public.user_shoe_defaults TO service_role;
ALTER TABLE public.user_shoe_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own defaults" ON public.user_shoe_defaults
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Activity -> shoe assignments (explicit)
CREATE TABLE IF NOT EXISTS public.activity_shoe_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_source text NOT NULL,
  activity_id text NOT NULL,
  user_shoe_id uuid NOT NULL REFERENCES public.user_shoes(id) ON DELETE CASCADE,
  distance_meters numeric NOT NULL DEFAULT 0,
  run_type public.run_type_enum,
  auto_assigned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_source, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_asa_user ON public.activity_shoe_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_asa_shoe ON public.activity_shoe_assignments(user_shoe_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_shoe_assignments TO authenticated;
GRANT ALL ON public.activity_shoe_assignments TO service_role;
ALTER TABLE public.activity_shoe_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assignments" ON public.activity_shoe_assignments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_asa_updated
  BEFORE UPDATE ON public.activity_shoe_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
