import { useEffect, useState } from "react";
import { Award, Clock, TrendingUp, Gift } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getRankFromXP, formatRank, getTierColor, getTierBg, getSeasonCountdown, type RankTier } from "@/lib/ranks";

interface Props {
  lang: Lang;
}

const MyProgress = ({ lang }: Props) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    monthly_xp: number;
    lifetime_xp: number;
    rank_tier: string;
    division: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(getSeasonCountdown());
  const [rewards, setRewards] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("monthly_xp, lifetime_xp, rank_tier, division")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data);

      const { data: rw } = await supabase
        .from("reward_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_assigned", true)
        .order("created_at", { ascending: false })
        .limit(5);
      if (rw) setRewards(rw);
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getSeasonCountdown()), 60000);
    return () => clearInterval(interval);
  }, []);

  const rankInfo = profile ? getRankFromXP(profile.monthly_xp) : null;
  const tierColor = rankInfo ? getTierColor(rankInfo.tier) : "#CD7F32";
  const tierBg = rankInfo ? getTierBg(rankInfo.tier) : "rgba(205,127,50,0.15)";
  const progressPct = rankInfo
    ? Math.min(100, (rankInfo.xpInCurrentDivision / rankInfo.xpToNextDivision) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Season Countdown */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
        <Clock size={18} className="text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "賽季結束倒數" : "Season ends in"}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {countdown.days}d {countdown.hours}h {countdown.minutes}m
          </p>
        </div>
      </div>

      {/* Rank Card */}
      <div
        className="rounded-xl p-5 border-2 text-center"
        style={{ borderColor: tierColor, backgroundColor: tierBg }}
      >
        <div className="flex justify-center mb-3">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: tierColor + "30" }}
          >
            <Award size={32} style={{ color: tierColor }} />
          </div>
        </div>
        <h3 className="text-lg font-bold text-foreground">
          {rankInfo ? formatRank(rankInfo.tier, rankInfo.division) : "Bronze V"}
        </h3>
        <p className="text-2xl font-bold mt-1" style={{ color: tierColor }}>
          {profile?.monthly_xp ?? 0} XP
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {lang === "zh" ? "本月 XP" : "This month's XP"}
        </p>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{rankInfo ? formatRank(rankInfo.tier, rankInfo.division) : ""}</span>
            <span>{rankInfo?.xpInCurrentDivision ?? 0} / {rankInfo?.xpToNextDivision ?? 2000}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: tierColor }}
            />
          </div>
        </div>
      </div>

      {/* Lifetime XP */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
        <TrendingUp size={18} className="text-primary shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "累計 XP" : "Lifetime XP"}
          </p>
          <p className="text-sm font-semibold text-foreground">{profile?.lifetime_xp ?? 0}</p>
        </div>
      </div>

      {/* Past Rewards */}
      {rewards.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} className="text-primary" />
            <h4 className="text-sm font-semibold text-foreground">
              {lang === "zh" ? "我的獎勵" : "My Rewards"}
            </h4>
          </div>
          <div className="space-y-2">
            {rewards.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{r.month_year}</span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                  {r.promo_code}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      {!user && (
        <p className="text-center text-sm text-muted-foreground py-8">
          {lang === "zh" ? "請登入以查看你的進度" : "Sign in to view your progress"}
        </p>
      )}
    </div>
  );
};

export default MyProgress;
