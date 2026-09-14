import { useState } from "react";
import { Activity, Trophy, MapPin } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import DesktopPageHeader from "./DesktopPageHeader";
import TerritoryTab from "@/components/rewards/TerritoryTab";
import KmLeaderboard from "@/components/community/KmLeaderboard";
import SocialFeedTab from "@/components/community/SocialFeedTab";

interface Props {
  lang: Lang;
}

type SubTab = "leaderboards" | "social" | "territory";

export default function DashboardCommunity({ lang }: Props) {
  const zh = lang === "zh";
  const [sub, setSub] = useState<SubTab>("leaderboards");

  const tabs: { id: SubTab; label: string; icon: typeof Activity }[] = [
    { id: "leaderboards", label: zh ? "排行榜" : "Leaderboards", icon: Trophy },
    { id: "social", label: zh ? "跑步動態" : "Social", icon: Activity },
    { id: "territory", label: zh ? "城市獵人" : "CityHunter", icon: MapPin },
  ];

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "社群" : "Community"}
        subtitle={zh ? "賺取經驗、攻城掠地、登上排行榜" : "Earn XP, claim territory, climb the leaderboard"}
        icon={<Activity className="h-5 w-5" />}
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

      <>
          {sub === "leaderboards" && (
            <Card className="p-6">
              <KmLeaderboard lang={lang} />
            </Card>
          )}
          {sub === "social" && <SocialWall lang={lang} />}

          {sub === "territory" && (
            <Card className="p-2 md:p-6">
              <TerritoryTab lang={lang} />
            </Card>
          )}
      </>
    </div>
  );
}
