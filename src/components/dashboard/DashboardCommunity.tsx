import { useState, useEffect, useCallback } from "react";
import { Award, Trophy, MapPin } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { supabase } from "@/integrations/supabase/client";
import { getRankFromXP } from "@/lib/ranks";
import type { RankTier } from "@/lib/ranks";
import DesktopPageHeader from "./DesktopPageHeader";
import HeroSection from "@/components/rewards/HeroSection";
import DailyCheckIn from "@/components/rewards/DailyCheckIn";
import ClaimRewards from "@/components/rewards/ClaimRewards";
import InstagramFollow from "@/components/rewards/InstagramFollow";
import RateAppReward from "@/components/rewards/RateAppReward";
import LeaderboardTabs from "@/components/rewards/LeaderboardTabs";
import RankUpOverlay from "@/components/rewards/RankUpOverlay";
import XpExplainer from "@/components/rewards/XpExplainer";
import TerritoryTab from "@/components/rewards/TerritoryTab";

interface Props {
  lang: Lang;
}

type SubTab = "rewards" | "leaderboards" | "territory";

export default function DashboardCommunity({ lang }: Props) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const { onPurchaseConfirmed } = usePremium();
  const [sub, setSub] = useState<SubTab>("rewards");
  const [leaderboardKey, setLeaderboardKey] = useState(0);
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
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("monthly_xp, lifetime_xp, rank_tier, division, last_login")
      .eq("user_id", user.id)
      .single();
    if (data) setProfile(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const unsub = onPurchaseConfirmed(() => setLeaderboardKey((k) => k + 1));
    return unsub;
  }, [onPurchaseConfirmed]);

  const handleXpGain = useCallback(
    (newXp: number) => {
      if (!profile) return;
      const oldRank = getRankFromXP(profile.monthly_xp);
      const newRank = getRankFromXP(newXp);
      if (newRank.tier !== oldRank.tier || newRank.division !== oldRank.division) {
        setRankUpTier(newRank.tier);
        setRankUpDivision(newRank.division);
        setShowRankUp(true);
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              monthly_xp: newXp,
              lifetime_xp: prev.lifetime_xp + (newXp - prev.monthly_xp),
              rank_tier: newRank.tier,
              division: newRank.division,
              last_login: new Date().toISOString(),
            }
          : prev
      );
    },
    [profile]
  );

  const rankInfo = profile ? getRankFromXP(profile.monthly_xp) : null;

  const tabs: { id: SubTab; label: string; icon: typeof Award }[] = [
    { id: "rewards", label: zh ? "獎勵" : "Rewards", icon: Award },
    { id: "leaderboards", label: zh ? "排行榜" : "Leaderboards", icon: Trophy },
    { id: "territory", label: zh ? "城市獵人" : "CityHunter", icon: MapPin },
  ];

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "社群" : "Community"}
        subtitle={zh ? "賺取經驗、攻城掠地、登上排行榜" : "Earn XP, claim territory, climb the leaderboard"}
        icon={<Award className="h-5 w-5" />}
        actions={
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setSub(t.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  sub === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          {sub === "rewards" && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 space-y-4">
                <HeroSection
                  lang={lang}
                  monthlyXp={profile?.monthly_xp ?? 0}
                  lifetimeXp={profile?.lifetime_xp ?? 0}
                  rankInfo={rankInfo}
                />
                <XpExplainer lang={lang} />
                {!user && (
                  <Card className="p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {zh ? "請登入以參與排名賽季" : "Sign in to join the Ranked Season"}
                    </p>
                  </Card>
                )}
              </div>
              <div className="space-y-4">
                {user && (
                  <DailyCheckIn
                    lang={lang}
                    userId={user.id}
                    lastLogin={profile?.last_login ?? null}
                    currentXp={profile?.monthly_xp ?? 0}
                    onXpGain={handleXpGain}
                  />
                )}
                {user && (
                  <InstagramFollow
                    lang={lang}
                    userId={user.id}
                    currentXp={profile?.monthly_xp ?? 0}
                    onXpGain={handleXpGain}
                  />
                )}
                {user && (
                  <RateAppReward
                    lang={lang}
                    userId={user.id}
                    currentXp={profile?.monthly_xp ?? 0}
                    onXpGain={handleXpGain}
                  />
                )}
                {user && <ClaimRewards lang={lang} userId={user.id} />}
              </div>
            </div>
          )}

          {sub === "leaderboards" && (
            <Card className="p-6">
              <LeaderboardTabs lang={lang} refreshKey={leaderboardKey} />
            </Card>
          )}

          {sub === "territory" && (
            <Card className="p-2 md:p-6">
              <TerritoryTab lang={lang} />
            </Card>
          )}
        </>
      )}

      <RankUpOverlay
        show={showRankUp}
        tier={rankUpTier}
        division={rankUpDivision}
        onDismiss={() => setShowRankUp(false)}
      />
    </div>
  );
}
