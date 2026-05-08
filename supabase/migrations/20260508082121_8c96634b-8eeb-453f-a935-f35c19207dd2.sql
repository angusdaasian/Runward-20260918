
-- Recompute capture_count on territory_hexes as the number of distinct users who captured each hex
UPDATE public.territory_hexes h
SET capture_count = sub.distinct_users
FROM (
  SELECT hex_id, COUNT(DISTINCT user_id) AS distinct_users
  FROM public.territory_captures
  GROUP BY hex_id
) sub
WHERE h.hex_id = sub.hex_id;

-- Helpful index for "owned by user" lookups via captures
CREATE INDEX IF NOT EXISTS idx_territory_captures_user_hex ON public.territory_captures(user_id, hex_id);
CREATE INDEX IF NOT EXISTS idx_territory_captures_hex ON public.territory_captures(hex_id);
