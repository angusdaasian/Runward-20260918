import { Info, Zap, Flame, Trophy, ArrowDown, Activity, Star, Instagram } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
}

const XpExplainer = ({ lang }: Props) => {
  const isZh = lang === "zh";

  const items = [
    {
      icon: <Zap size={14} className="text-primary" />,
      label: isZh ? "每日簽到" : "Daily Check-in",
      value: "+150 XP",
    },
    {
      icon: <Flame size={14} className="text-orange-500" />,
      label: isZh ? "連續 7 天簽到獎勵" : "7-Day Streak Bonus",
      value: "+300 XP",
    },
    {
      icon: <Activity size={14} className="text-emerald-500" />,
      label: isZh ? "運動同步（Strava/Garmin/Coros）(即將推出)" : "Activity Sync (Strava/Garmin/Coros)(Coming Soon)",
      value: isZh ? "(公里×20)+(分鐘×10)+(分數×5)" : "(km×20)+(min×10)+(score×5)",
    },
    {
      icon: <ArrowDown size={14} className="text-destructive" />,
      label: isZh ? "每日 XP 衰減（不活躍）" : "Daily XP Decay (inactive)",
      value: "-2%",
    },
    {
      icon: <Instagram size={14} className="text-pink-500" />,
      label: isZh ? "關注 Instagram（一次性）" : "Follow on Instagram (one-time)",
      value: "+3,000 XP",
    },
    {
      icon: <Star size={14} className="text-amber-500 fill-amber-500" />,
      label: isZh ? "為應用程式評分（一次性）" : "Rate the app (one-time)",
      value: "+5,000 XP",
    },
    {
      icon: <Trophy size={14} className="text-amber-500" />,
      label: isZh ? "每 2,000 XP 晉升一個段位" : "Rank up every 2,000 XP",
      value: "",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Info size={14} className="text-muted-foreground" />
        <h3 className="text-xs font-bold text-foreground">{isZh ? "XP 系統說明" : "How XP Works"}</h3>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-xs">
            {item.icon}
            <span className="text-muted-foreground flex-1">{item.label}</span>
            {item.value && <span className="font-bold text-foreground">{item.value}</span>}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        {isZh
          ? "每月排名重置。高級用戶前 10 名和免費用戶前 3 名可獲得 7 天 App Store 兌換碼獎勵！"
          : "Rankings reset monthly. Top 10 Premium and Top 3 Free users win a 7-day App Store redeem code!"}
      </p>
    </div>
  );
};

export default XpExplainer;
