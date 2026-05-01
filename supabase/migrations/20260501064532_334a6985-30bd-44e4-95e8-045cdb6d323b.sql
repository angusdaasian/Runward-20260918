-- Relabel April winners (were mislabeled as 2026-05 because admin entered the current month)
UPDATE public.used_codes
SET month_year = '2026-04'
WHERE month_year = '2026-05';

-- Restore today's daily check-in XP for Raymond and ManOnEarth
UPDATE public.profiles
SET monthly_xp = monthly_xp + 150,
    lifetime_xp = lifetime_xp + 150
WHERE user_id IN (
  '94413c1a-c9ce-47ab-b98b-e62e0b6182ed',
  '46997d86-299a-4d87-9b90-2fd212bc4926'
);