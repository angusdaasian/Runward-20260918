-- 1. Per-plan opt-in flag
ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS auto_adjust_enabled boolean NOT NULL DEFAULT false;

-- 2. Adjustment / recalibration history (also powers Undo via snapshots)
CREATE TABLE public.plan_auto_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'auto',
  trigger_reason text,
  deviation jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit jsonb,
  plan_data_before jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_data_after jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_en text,
  summary_zh text,
  revised_target_time text,
  status text NOT NULL DEFAULT 'applied',
  triggered_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_auto_adjustments TO authenticated;
GRANT ALL ON public.plan_auto_adjustments TO service_role;

ALTER TABLE public.plan_auto_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own plan adjustments"
  ON public.plan_auto_adjustments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own plan adjustments"
  ON public.plan_auto_adjustments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plan adjustments"
  ON public.plan_auto_adjustments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plan adjustments"
  ON public.plan_auto_adjustments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_plan_auto_adjustments_updated_at
  BEFORE UPDATE ON public.plan_auto_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation via trigger (CHECK constraints must stay immutable)
CREATE OR REPLACE FUNCTION public.validate_plan_auto_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind NOT IN ('auto', 'recalibration') THEN
    RAISE EXCEPTION 'invalid kind: %', NEW.kind;
  END IF;
  IF NEW.status NOT IN ('applied', 'reverted') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_plan_auto_adjustments
  BEFORE INSERT OR UPDATE ON public.plan_auto_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.validate_plan_auto_adjustment();

CREATE INDEX idx_plan_auto_adjustments_user_plan
  ON public.plan_auto_adjustments (user_id, plan_id, triggered_at DESC);

CREATE INDEX idx_plan_auto_adjustments_recent
  ON public.plan_auto_adjustments (plan_id, kind, triggered_at DESC);