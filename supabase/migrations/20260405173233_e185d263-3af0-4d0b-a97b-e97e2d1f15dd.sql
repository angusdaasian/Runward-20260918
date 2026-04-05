
ALTER TABLE public.profiles
  ADD COLUMN check_in_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN last_check_in_date date;
