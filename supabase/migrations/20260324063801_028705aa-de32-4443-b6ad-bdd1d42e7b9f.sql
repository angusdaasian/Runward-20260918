ALTER TABLE public.premium_subscriptions ADD COLUMN is_trial boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN trial_used boolean NOT NULL DEFAULT false;