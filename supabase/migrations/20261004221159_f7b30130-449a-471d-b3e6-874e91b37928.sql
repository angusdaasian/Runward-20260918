DELETE FROM public.terra_activities
WHERE user_id = 'c7a7d1ca-c7bf-4288-bb9d-794006a04087'
  AND terra_activity_id LIKE 'stridee_%'
  AND created_at BETWEEN '2026-10-04 21:24:00+00' AND '2026-10-04 21:29:00+00';