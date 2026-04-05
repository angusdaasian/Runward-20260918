import { useState } from "react";
import { Lang } from "@/lib/i18n";
import FadeIn from "@/components/ui/FadeIn";
import MyProgress from "@/components/rewards/MyProgress";
import MonthlyLeaderboard from "@/components/rewards/MonthlyLeaderboard";
import AllTimeLegends from "@/components/rewards/AllTimeLegends";

interface Props {
  lang: Lang;
}

const tabs = (lang: Lang) => [
  { id: "progress" as const, label: lang === "zh" ? "我的進度" : "My Progress" },
  { id: "leaderboard" as const, label: lang === "zh" ? "月度排行" : "Monthly Leaderboard" },
  { id: "legends" as const, label: lang === "zh" ? "歷代傳奇" : "All-Time Legends" },
];

type TabId = "progress" | "leaderboard" | "legends";

const RewardsTab = ({ lang }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>("progress");

  return (
    <FadeIn className="px-5 pt-6 max-w-lg mx-auto pb-24">
      <h1 className="font-display text-2xl font-bold text-foreground mb-1">
        {lang === "zh" ? "排名賽季" : "Ranked Season"}
      </h1>
      <p className="text-sm text-muted-foreground mb-5">
        {lang === "zh" ? "賺取 XP、晉級、贏取獎勵" : "Earn XP, climb ranks, win rewards"}
      </p>

      {/* Tab selector */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6">
        {tabs(lang).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "progress" && <MyProgress lang={lang} />}
      {activeTab === "leaderboard" && <MonthlyLeaderboard lang={lang} />}
      {activeTab === "legends" && <AllTimeLegends lang={lang} />}
    </FadeIn>
  );
};

export default RewardsTab;
