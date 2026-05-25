
-- Make support_feedback work as a support ticket system
ALTER TABLE public.support_feedback
  ALTER COLUMN name DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS admin_response text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS support_feedback_set_updated_at ON public.support_feedback;
CREATE TRIGGER support_feedback_set_updated_at
BEFORE UPDATE ON public.support_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Let users read their own tickets
DROP POLICY IF EXISTS "Users can read own feedback" ON public.support_feedback;
CREATE POLICY "Users can read own feedback"
ON public.support_feedback
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Let admins update (respond to) tickets
DROP POLICY IF EXISTS "Admins can update feedback" ON public.support_feedback;
CREATE POLICY "Admins can update feedback"
ON public.support_feedback
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_support_feedback_user ON public.support_feedback(user_id, created_at DESC);
