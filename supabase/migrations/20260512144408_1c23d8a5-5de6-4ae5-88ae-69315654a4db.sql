INSERT INTO public.terra_connections (user_id, terra_user_id, provider, reference_id, scopes, active, last_webhook_at)
VALUES (
  'c7a7d1ca-c7bf-4288-bb9d-794006a04087',
  'ad136c06-f187-43a9-b94b-847b0467dea3',
  'GARMIN',
  'c7a7d1ca-c7bf-4288-bb9d-794006a04087',
  ARRAY['ACTIVITY_EXPORT','HISTORICAL_DATA_EXPORT','HEALTH_EXPORT','WORKOUT_IMPORT','MCT_EXPORT'],
  true,
  now()
)
ON CONFLICT (user_id, provider) DO UPDATE SET
  terra_user_id = EXCLUDED.terra_user_id,
  reference_id = EXCLUDED.reference_id,
  scopes = EXCLUDED.scopes,
  active = true,
  last_webhook_at = now();