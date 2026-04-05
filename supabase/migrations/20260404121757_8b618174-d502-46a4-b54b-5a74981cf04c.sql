CREATE TABLE public.pending_races (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  race_date DATE NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  category TEXT NOT NULL,
  submitted_by UUID NOT NULL,
  ai_verification_result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit pending races"
ON public.pending_races FOR INSERT TO authenticated
WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Users can view own pending races"
ON public.pending_races FOR SELECT TO authenticated
USING (auth.uid() = submitted_by);

CREATE POLICY "Admins can view all pending races"
ON public.pending_races FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pending races"
ON public.pending_races FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pending races"
ON public.pending_races FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pending_races_updated_at
BEFORE UPDATE ON public.pending_races
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();