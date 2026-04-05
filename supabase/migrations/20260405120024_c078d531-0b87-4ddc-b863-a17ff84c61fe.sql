
-- Fix 1: Remove user self-insert and self-update on premium_subscriptions
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.premium_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.premium_subscriptions;

-- Fix 2: Tighten support_feedback INSERT to prevent user_id spoofing
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.support_feedback;
CREATE POLICY "Anyone can insert feedback"
ON public.support_feedback
FOR INSERT
TO public
WITH CHECK (user_id IS NULL OR user_id = auth.uid());
