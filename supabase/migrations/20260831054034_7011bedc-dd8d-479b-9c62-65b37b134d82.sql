CREATE OR REPLACE FUNCTION public.validate_plan_auto_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind NOT IN ('auto', 'recalibrate', 'recalibration') THEN
    RAISE EXCEPTION 'invalid kind: %', NEW.kind;
  END IF;
  IF NEW.status NOT IN ('applied', 'reverted') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;