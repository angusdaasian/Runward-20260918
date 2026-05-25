UPDATE public.races SET updated_at = now();

CREATE TABLE public.roadmap_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  idea TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit own ideas"
ON public.roadmap_ideas FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own ideas"
ON public.roadmap_ideas FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all ideas"
ON public.roadmap_ideas FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));