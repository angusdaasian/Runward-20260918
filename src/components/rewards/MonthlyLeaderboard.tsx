import { useEffect, useState } from "react";
import { Crown, Trophy, Shield } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { formatRank, getTierColor, getSeasonCountdown, type RankTier } from "@/lib/ranks";

interface Props {
  lang: Lang;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  rank_tier: string;
  division: string;
  monthly_xp: number;
  is_premium: boolean;
}

const MonthlyLeaderboard = ({ lang }: Props) => {
  const [league, setLeague] = useState<"premium" | "free">("premium");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const countdown = getSeasonCountdown();

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, rank_tier, division, monthly_xp, is_premium")
        .eq("is_premium", league === "premium")
        .gt("monthly_xp", 0)
        .order("monthly_xp", { ascending: false })
        .limit(50);
      setEntries((data as LeaderboardEntry[]) || []);
      setLoading(false);
    };
    fetch();
  }, [league]);

  const rewardZone = league === "premium" ? 10 : 3;

  return (
    <div className="space-y-4">
      {/* Countdown */}
      <div className="text-center bg-card border border-border rounded-xl p-3">
        <p className="text-xs text-muted-foreground">
          {lang === "zh" ? "賽季結束倒數" : "Season ends in"}
        </p>
        <p className="text-base font-bold text-foreground">
          {countdown.days}d {countdown.hours}h {countdown.minutes}m
        </p>
      </div>

      {/* League Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setLeague("premium")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            league === "premium"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Crown size={14} />
          {lang === "zh" ? "Premium 聯賽" : "Premium League"}
        </button>
        <button
          onClick={() => setLeague("free")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            league === "free"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Shield size={14} />
          {lang === "zh" ? "免費聯賽" : "Free League"}
        </button>
      </div>

      {/* Reward Zone Label */}
      <div className="flex items-center gap-2 px-1">
        <Trophy size={14} className="text-amber-500" />
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? `前 ${rewardZone} 名可獲得獎勵`
            : `Top ${rewardZone} earn rewards`}
        </p>
      </div>

      {/* Leaderboard List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-muted rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {lang === "zh" ? "本月暫無數據" : "No entries this month yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const rank = idx + 1;
            const inRewardZone = rank <= rewardZone;
            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  inRewardZone
                    ? "bg-amber-500/10 border-2 border-amber-500/30"
                    : "bg-card border border-border"
                }`}
              >
                {/* Rank number */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  rank <= 3 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {rank}
                </div>

                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-bold">
                      {(entry.display_name || "?")[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.display_name || (lang === "zh" ? "匿名跑者" : "Anonymous Runner")}
                  </p>
                  <p className="text-xs" style={{ color: getTierColor(entry.rank_tier as RankTier) }}>
                    {formatRank(entry.rank_tier, entry.division)}
                  </p>
                </div>

                {/* XP */}
                <span className="text-sm font-bold text-foreground">{entry.monthly_xp} XP</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MonthlyLeaderboard;
