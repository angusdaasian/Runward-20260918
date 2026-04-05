import { useEffect, useState } from "react";
import { Clock, TrendingUp } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { formatRank, getTierColor, getSeasonCountdown, type RankInfo, type RankTier } from "@/lib/ranks";
import { RANK_EMBLEMS } from "@/lib/rankEmblems";

interface Props {
  lang: Lang;
  monthlyXp: number;
  lifetimeXp: number;
  rankInfo: RankInfo | null;
}

const HeroSection = ({ lang, monthlyXp, lifetimeXp, rankInfo }: Props) => {
  const [countdown, setCountdown] = useState(getSeasonCountdown());
  const tier = (rankInfo?.tier ?? "Bronze") as RankTier;
  const division = rankInfo?.division ?? "V";
  const tierColor = getTierColor(tier);
  const progressPct = rankInfo
    ? Math.min(100, (rankInfo.xpInCurrentDivision / rankInfo.xpToNextDivision) * 100)
    : 0;
  const isDiamond = tier === "Diamond";

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getSeasonCountdown()), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-5">
      {/* Shimmer effect for Diamond */}
      {isDiamond && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent animate-shimmer" />
        </div>
      )}

      {/* Season Countdown */}
      <div className="flex items-center gap-2 mb-4">
        <Clock size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {lang === "zh" ? "賽季結束" : "Season ends in"}
        </span>
        <span className="text-xs font-bold text-foreground ml-auto">
          {countdown.days}d {countdown.hours}h {countdown.minutes}m
        </span>
      </div>

      {/* Emblem + Rank */}
      <div className="flex flex-col items-center">
        <div className={`relative w-28 h-28 mb-3 ${isDiamond ? "animate-pulse-slow" : ""}`}>
          <img
            src={RANK_EMBLEMS[tier]}
            alt={`${tier} emblem`}
            className="w-full h-full object-contain drop-shadow-2xl"
            width={512}
            height={512}
          />
        </div>

        <h2 className="text-xl font-black tracking-wide" style={{ color: tierColor }}>
          {formatRank(tier, division)}
        </h2>

        <p className="text-3xl font-black mt-1 text-foreground">
          {monthlyXp.toLocaleString()} <span className="text-base font-medium text-muted-foreground">XP</span>
        </p>

        {/* Progress Bar */}
        <div className="w-full mt-4">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5 font-medium">
            <span>{formatRank(tier, division)}</span>
            <span>{rankInfo?.xpInCurrentDivision ?? 0} / {rankInfo?.xpToNextDivision ?? 2000}</span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out relative"
              style={{
                width: `${progressPct}%`,
                background: `linear-gradient(90deg, ${tierColor}88, ${tierColor})`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>

        {/* Lifetime XP */}
        <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
          <TrendingUp size={12} />
          <span>{lang === "zh" ? "累計" : "Lifetime"}: {lifetimeXp.toLocaleString()} XP</span>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
