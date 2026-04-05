import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { formatRank, getTierColor, type RankTier } from "@/lib/ranks";

interface Props {
  lang: Lang;
}

interface LegendEntry {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  rank_tier: string;
  division: string;
  lifetime_xp: number;
}

const AllTimeLegends = ({ lang }: Props) => {
  const [entries, setEntries] = useState<LegendEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, rank_tier, division, lifetime_xp")
        .gt("lifetime_xp", 0)
        .order("lifetime_xp", { ascending: false })
        .limit(50);
      setEntries((data as LegendEntry[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-muted rounded-xl h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Star size={28} className="text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-base mb-2">
          {lang === "zh" ? "成為第一個傳奇" : "Be the First Legend"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-[260px]">
          {lang === "zh"
            ? "累計 XP 以登上歷代傳奇排行榜。"
            : "Accumulate lifetime XP to appear on the All-Time Legends board."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => {
        const rank = idx + 1;
        return (
          <div
            key={entry.user_id}
            className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              rank <= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {rank}
            </div>

            <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0">
              {entry.avatar_url ? (
                <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-bold">
                  {(entry.display_name || "?")[0]?.toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {entry.display_name || (lang === "zh" ? "匿名跑者" : "Anonymous Runner")}
              </p>
              <p className="text-xs" style={{ color: getTierColor(entry.rank_tier as RankTier) }}>
                {formatRank(entry.rank_tier, entry.division)}
              </p>
            </div>

            <span className="text-sm font-bold text-foreground">{entry.lifetime_xp} XP</span>
          </div>
        );
      })}
    </div>
  );
};

export default AllTimeLegends;
