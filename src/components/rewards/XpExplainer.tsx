import { Info, Zap, Flame, Trophy, ArrowDown } from "lucide-react";
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
      icon: <ArrowDown size={14} className="text-destructive" />,
      label: isZh ? "每日 XP 衰減（不活躍）" : "Daily XP Decay (inactive)",
      value: "-2%",
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
        <h3 className="text-xs font-bold text-foreground">
          {isZh ? "XP 系統說明" : "How XP Works"}
        </h3>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-xs">
            {item.icon}
            <span className="text-muted-foreground flex-1">{item.label}</span>
            {item.value && (
              <span className="font-bold text-foreground">{item.value}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        {isZh
          ? "每月排名重置。高級用戶前 10 名和免費用戶前 3 名可獲得 App Store 兌換碼獎勵！"
          : "Rankings reset monthly. Top 10 Premium and Top 3 Free users win App Store redeem codes!"}
      </p>
    </div>
  );
};

export default XpExplainer;
