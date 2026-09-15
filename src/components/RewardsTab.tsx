import { useState } from "react";
import { Lang } from "@/lib/i18n";
import FadeIn from "@/components/ui/FadeIn";
import TerritoryTab from "@/components/rewards/TerritoryTab";
import KmLeaderboard from "@/components/community/KmLeaderboard";
import SocialFeedTab from "@/components/community/SocialFeedTab";
import GroupChatTab from "@/components/community/GroupChatTab";
import { useGroupChatSummaries } from "@/hooks/use-group-chat-summaries";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { underlineTabsListClass, underlineTabsTriggerClass } from "@/components/ui/underline-tabs";

interface Props {
  lang: Lang;
}

const RewardsTab = ({ lang }: Props) => {
  const [tab, setTab] = useState("leaderboards");
  const { totalUnread } = useGroupChatSummaries();

  return (
    <>
      <FadeIn className="px-5 pt-4 max-w-lg mx-auto pb-24 space-y-5">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className={underlineTabsListClass}>
            <TabsTrigger value="leaderboards" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "排行榜" : "Leaderboards"}
            </TabsTrigger>
            <TabsTrigger value="social" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "跑步動態" : "Social"}
            </TabsTrigger>
            <TabsTrigger value="chat" className={underlineTabsTriggerClass}>
              <span className="inline-flex items-center gap-1">
                {lang === "zh" ? "群組" : "Groups"}
                {totalUnread > 0 && (
                  <span className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="territory" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "城市獵人" : "CityHunter"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboards" className="mt-4">
            <KmLeaderboard lang={lang} />
          </TabsContent>
          <TabsContent value="social" className="mt-4">
            <SocialFeedTab lang={lang} />
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            <GroupChatTab lang={lang} />
          </TabsContent>

          <TabsContent value="territory" className="mt-4">
            <TerritoryTab lang={lang} />
          </TabsContent>
        </Tabs>
      </FadeIn>

    </>
  );
};

export default RewardsTab;
