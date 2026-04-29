-- Backfill Kenneth's premium trial subscription (RC: Monthly LCRA promo)
INSERT INTO public.premium_subscriptions (user_id, plan, activated_at, expires_at, is_trial, rc_entitlement)
VALUES (
  '0ed6a94b-1e42-479d-ad51-468c007310e8',
  'promo_monthly_lcra',
  now(),
  now() + interval '30 days',
  true,
  'premium'
)
ON CONFLICT (user_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  expires_at = GREATEST(public.premium_subscriptions.expires_at, EXCLUDED.expires_at),
  is_trial = true,
  rc_entitlement = 'premium';

UPDATE public.profiles SET is_premium = true WHERE user_id = '0ed6a94b-1e42-479d-ad51-468c007310e8';