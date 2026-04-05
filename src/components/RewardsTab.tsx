import { useState, useEffect, useCallback } from "react";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getRankFromXP, getSeasonCountdown } from "@/lib/ranks";
import FadeIn from "@/components/ui/FadeIn";
import HeroSection from "@/components/rewards/HeroSection";
import DailyCheckIn from "@/components/rewards/DailyCheckIn";
import ClaimRewards from "@/components/rewards/ClaimRewards";
import LeaderboardTabs from "@/components/rewards/LeaderboardTabs";
import RankUpOverlay from "@/components/rewards/RankUpOverlay";
import type { RankTier } from "@/lib/ranks";

interface Props {
  lang: Lang;
}

const RewardsTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    monthly_xp: number;
    lifetime_xp: number;
    rank_tier: string;
    division: string;
    last_login: string | null;
  } | null>(null);
  const [showRankUp, setShowRankUp] = useState(false);
  const [rankUpTier, setRankUpTier] = useState<RankTier>("Bronze");
  const [rankUpDivision, setRankUpDivision] = useState("V");
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("monthly_xp, lifetime_xp, rank_tier, division, last_login")
      .eq("user_id", user.id)
      .single();
    if (data) setProfile(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleXpGain = useCallback((newXp: number) => {
    if (!profile) return;
    const oldRank = getRankFromXP(profile.monthly_xp);
    const newRank = getRankFromXP(newXp);

    if (newRank.tier !== oldRank.tier || newRank.division !== oldRank.division) {
      setRankUpTier(newRank.tier);
      setRankUpDivision(newRank.division);
      setShowRankUp(true);
    }

    setProfile(prev => prev ? {
      ...prev,
      monthly_xp: newXp,
      lifetime_xp: prev.lifetime_xp + (newXp - prev.monthly_xp),
      rank_tier: newRank.tier,
      division: newRank.division,
      last_login: new Date().toISOString(),
    } : prev);
  }, [profile]);

  const rankInfo = profile ? getRankFromXP(profile.monthly_xp) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <FadeIn className="px-5 pt-4 max-w-lg mx-auto pb-24 space-y-5">
        {/* Hero — Rank Emblem + Progress */}
        <HeroSection
          lang={lang}
          monthlyXp={profile?.monthly_xp ?? 0}
          lifetimeXp={profile?.lifetime_xp ?? 0}
          rankInfo={rankInfo}
        />

        {/* Daily Check-in */}
        {user && (
          <DailyCheckIn
            lang={lang}
            userId={user.id}
            lastLogin={profile?.last_login ?? null}
            currentXp={profile?.monthly_xp ?? 0}
            onXpGain={handleXpGain}
          />
        )}

        {/* Claim Rewards */}
        {user && <ClaimRewards lang={lang} userId={user.id} />}

        {/* Leaderboards */}
        <LeaderboardTabs lang={lang} />

        {!user && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              {lang === "zh" ? "請登入以參與排名賽季" : "Sign in to join the Ranked Season"}
            </p>
          </div>
        )}
      </FadeIn>

      <RankUpOverlay
        show={showRankUp}
        tier={rankUpTier}
        division={rankUpDivision}
        onDismiss={() => setShowRankUp(false)}
      />
    </>
  );
};

export default RewardsTab;
