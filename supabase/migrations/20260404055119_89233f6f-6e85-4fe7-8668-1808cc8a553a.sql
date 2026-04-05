
CREATE TABLE public.races (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  race_date DATE NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  category TEXT NOT NULL,
  website_url TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read races"
ON public.races FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins can insert races"
ON public.races FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update races"
ON public.races FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete races"
ON public.races FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
