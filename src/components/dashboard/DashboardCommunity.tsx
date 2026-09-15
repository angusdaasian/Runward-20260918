import { useState } from "react";
import { Activity, MessageCircle, Trophy, MapPin } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import DesktopPageHeader from "./DesktopPageHeader";
import TerritoryTab from "@/components/rewards/TerritoryTab";
import KmLeaderboard from "@/components/community/KmLeaderboard";
import SocialFeedTab from "@/components/community/SocialFeedTab";
import GroupChatTab from "@/components/community/GroupChatTab";
import { useGroupChatSummaries } from "@/hooks/use-group-chat-summaries";

interface Props {
  lang: Lang;
}

type SubTab = "leaderboards" | "social" | "chat" | "territory";

export default function DashboardCommunity({ lang }: Props) {
  const zh = lang === "zh";
  const [sub, setSub] = useState<SubTab>("leaderboards");
  const { totalUnread } = useGroupChatSummaries();

  const tabs: { id: SubTab; label: string; icon: typeof Activity }[] = [
    { id: "leaderboards", label: zh ? "排行榜" : "Leaderboards", icon: Trophy },
    { id: "social", label: zh ? "跑步動態" : "Social", icon: Activity },
    { id: "chat", label: zh ? "群組" : "Groups", icon: MessageCircle },
    { id: "territory", label: zh ? "城市獵人" : "CityHunter", icon: MapPin },
  ];

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "社群" : "Community"}
        subtitle={zh ? "跟跑班聊天、攻城掠地、登上排行榜" : "Chat with your group, claim territory, climb the leaderboard"}
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
                {t.id === "chat" && totalUnread > 0 && (
                  <span className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
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
          {sub === "social" && <SocialFeedTab lang={lang} />}
          {sub === "chat" && (
            <Card className="p-2 md:p-4">
              <GroupChatTab lang={lang} />
            </Card>
          )}

          {sub === "territory" && (
            <Card className="p-2 md:p-6">
              <TerritoryTab lang={lang} />
            </Card>
          )}
      </>
    </div>
  );
}
