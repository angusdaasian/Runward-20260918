-- races: restrict read to authenticated users
DROP POLICY IF EXISTS "Anyone can read races" ON public.races;
CREATE POLICY "Authenticated can read races"
  ON public.races FOR SELECT TO authenticated USING (true);

-- announcements: restrict read to authenticated users
DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.announcements;
CREATE POLICY "Authenticated can read active announcements"
  ON public.announcements FOR SELECT TO authenticated USING (is_active = true);

-- profiles: scope existing public-role policies to authenticated
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- personal_bests: scope to authenticated
DROP POLICY IF EXISTS "Users can view their own PBs" ON public.personal_bests;
CREATE POLICY "Users can view their own PBs"
  ON public.personal_bests FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own PBs" ON public.personal_bests;
CREATE POLICY "Users can insert their own PBs"
  ON public.personal_bests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own PBs" ON public.personal_bests;
CREATE POLICY "Users can update their own PBs"
  ON public.personal_bests FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own PBs" ON public.personal_bests;
CREATE POLICY "Users can delete their own PBs"
  ON public.personal_bests FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Ensure RLS enabled on all listed tables (idempotent)
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_bests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terra_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmin_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terra_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_push_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plan_reviews ENABLE ROW LEVEL SECURITY;

-- leaderboard_view: ensure it runs as the caller so RLS applies to underlying tables
ALTER VIEW public.leaderboard_view SET (security_invoker = on);