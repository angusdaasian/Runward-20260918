import { useEffect, useState } from "react";
import { Crown, Shield, Trophy } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { formatRank, getTierColor, type RankTier } from "@/lib/ranks";
import { RANK_EMBLEMS } from "@/lib/rankEmblems";

interface Props {
  lang: Lang;
  refreshKey?: number;
}

type League = "premium" | "free";

interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  rank_tier: string;
  division: string;
  monthly_xp: number;
  is_premium: boolean;
}

const LeaderboardTabs = ({ lang }: Props) => {
  const [league, setLeague] = useState<League>("premium");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const limit = league === "premium" ? 10 : 3;
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, rank_tier, division, monthly_xp, is_premium")
        .eq("is_premium", league === "premium")
        .gt("monthly_xp", 0)
        .order("monthly_xp", { ascending: false })
        .limit(limit);
      setEntries((data as LeaderboardEntry[]) || []);
      setLoading(false);
    };
    fetch();
  }, [league]);

  const rewardZone = league === "premium" ? 10 : 3;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-foreground">
        {lang === "zh" ? "排行榜" : "Leaderboards"}
      </h3>

      {/* League Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setLeague("premium")}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            league === "premium"
              ? "bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/25"
              : "bg-white/5 text-muted-foreground border border-white/10"
          }`}
        >
          <Crown size={14} />
          {lang === "zh" ? "Elite 聯賽" : "Elite League"}
        </button>
        <button
          onClick={() => setLeague("free")}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            league === "free"
              ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25"
              : "bg-white/5 text-muted-foreground border border-white/10"
          }`}
        >
          <Shield size={14} />
          {lang === "zh" ? "Challenger 聯賽" : "Challenger League"}
        </button>
      </div>

      {/* Reward Zone Label */}
      <div className="flex items-center gap-2 px-1">
        <Trophy size={14} className="text-amber-500" />
        <p className="text-[11px] text-muted-foreground font-medium">
          {lang === "zh"
            ? `前 ${rewardZone} 名進入獎勵區`
            : `Top ${rewardZone} enter the Reward Zone`}
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {lang === "zh" ? "本月暫無數據" : "No entries this month yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const rank = idx + 1;
            const inRewardZone = rank <= rewardZone;
            const tier = entry.rank_tier as RankTier;

            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  inRewardZone
                    ? "bg-gradient-to-r from-amber-500/10 to-amber-600/5 border-2 border-amber-500/40 shadow-lg shadow-amber-500/5"
                    : "bg-white/[0.03] border border-white/5"
                }`}
              >
                {/* Rank Badge */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  rank === 1 ? "bg-amber-500 text-black" :
                  rank === 2 ? "bg-gray-300 text-black" :
                  rank === 3 ? "bg-amber-700 text-white" :
                  "bg-white/10 text-muted-foreground"
                }`}>
                  {rank}
                </div>

                {/* Emblem */}
                <img
                  src={RANK_EMBLEMS[tier] || RANK_EMBLEMS.Bronze}
                  alt={tier}
                  className="w-8 h-8 object-contain shrink-0"
                  loading="lazy"
                  width={64}
                  height={64}
                />

                {/* Name + Rank */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {entry.display_name || (lang === "zh" ? "匿名跑者" : "Anonymous")}
                  </p>
                  <p className="text-[10px] font-medium" style={{ color: getTierColor(tier) }}>
                    {formatRank(entry.rank_tier, entry.division)}
                  </p>
                </div>

                {/* XP */}
                <span className="text-sm font-black text-foreground tabular-nums">
                  {entry.monthly_xp.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Compliance */}
      <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
        {lang === "zh"
          ? "排行榜僅顯示顯示名稱、排名及 XP。不會公開任何運動數據。"
          : "Leaderboards only show display name, rank & XP. No raw activity data is shared."}
      </p>
    </div>
  );
};

export default LeaderboardTabs;
