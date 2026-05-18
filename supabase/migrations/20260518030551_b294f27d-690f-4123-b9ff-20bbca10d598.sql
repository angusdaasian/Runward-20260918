INSERT INTO public.premium_subscriptions (user_id, plan, activated_at, expires_at, is_trial, rc_entitlement)
VALUES ('54576cb1-3ef4-4fff-8859-a0e610283def', 'lifetime_grant', now(), now() + interval '100 years', false, 'premium')
ON CONFLICT (user_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  activated_at = EXCLUDED.activated_at,
  expires_at = EXCLUDED.expires_at,
  is_trial = false,
  rc_entitlement = 'premium';

UPDATE public.profiles SET is_premium = true WHERE user_id = '54576cb1-3ef4-4fff-8859-a0e610283def';