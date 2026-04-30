
INSERT INTO public.premium_subscriptions (user_id, plan, activated_at, expires_at, is_trial, rc_entitlement)
VALUES (
  '3ea42539-f316-4e30-8a20-647cce23d9f1',
  'com.despia.runward.monthly',
  '2026-04-25 20:59:00+00',
  '2026-05-25 20:59:00+00',
  true,
  'premium'
)
ON CONFLICT (user_id) DO UPDATE
SET plan = EXCLUDED.plan,
    expires_at = EXCLUDED.expires_at,
    is_trial = EXCLUDED.is_trial,
    rc_entitlement = EXCLUDED.rc_entitlement;

UPDATE public.profiles
SET is_premium = true
WHERE user_id = '3ea42539-f316-4e30-8a20-647cce23d9f1';
