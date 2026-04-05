
CREATE TABLE public.support_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone (authenticated or not) can submit feedback
CREATE POLICY "Anyone can insert feedback"
ON public.support_feedback
FOR INSERT
TO public
WITH CHECK (true);

-- Admins can read all feedback
CREATE POLICY "Admins can read all feedback"
ON public.support_feedback
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete feedback
CREATE POLICY "Admins can delete feedback"
ON public.support_feedback
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
