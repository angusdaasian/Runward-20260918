
CREATE TABLE public.user_races (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  race_name TEXT NOT NULL,
  race_name_zh TEXT,
  race_date DATE NOT NULL,
  city TEXT,
  country TEXT,
  category TEXT NOT NULL DEFAULT 'Full Marathon',
  source_race_id UUID,
  source TEXT NOT NULL DEFAULT 'manual',
  website_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own user_races"
ON public.user_races
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user_races"
ON public.user_races
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_races"
ON public.user_races
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own user_races"
ON public.user_races
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_user_races_user_date ON public.user_races(user_id, race_date);

CREATE TRIGGER update_user_races_updated_at
BEFORE UPDATE ON public.user_races
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
