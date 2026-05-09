ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS custom_hr_zones integer[];

COMMENT ON COLUMN public.profiles.custom_hr_zones IS
'Optional manual heart-rate zone lower bounds in bpm: [Z1, Z2, Z3, Z4, Z5]. When set, overrides Karvonen %HRR computation.';