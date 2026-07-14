ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS platform_updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_platform ON public.profiles(platform);