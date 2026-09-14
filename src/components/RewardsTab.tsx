import { useState } from "react";
import { Lang } from "@/lib/i18n";
import FadeIn from "@/components/ui/FadeIn";
import TerritoryTab from "@/components/rewards/TerritoryTab";
import KmLeaderboard from "@/components/community/KmLeaderboard";
import SocialWall from "@/components/community/SocialWall";
import FriendsFeed from "@/components/community/FriendsFeed";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { underlineTabsListClass, underlineTabsTriggerClass } from "@/components/ui/underline-tabs";

interface Props {
  lang: Lang;
}

const RewardsTab = ({ lang }: Props) => {
  const [tab, setTab] = useState("leaderboards");

  return (
    <>
      <FadeIn className="px-5 pt-4 max-w-lg mx-auto pb-24 space-y-5">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className={underlineTabsListClass}>
            <TabsTrigger value="leaderboards" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "排行榜" : "Leaderboards"}
            </TabsTrigger>
            <TabsTrigger value="social" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "公開動態" : "Public"}
            </TabsTrigger>
            <TabsTrigger value="friends" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "好友動態" : "Friends"}
            </TabsTrigger>
            <TabsTrigger value="territory" className={underlineTabsTriggerClass}>
              {lang === "zh" ? "城市獵人" : "CityHunter"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboards" className="mt-4">
            <KmLeaderboard lang={lang} />
          </TabsContent>
          <TabsContent value="social" className="mt-4">
            <SocialWall lang={lang} />
          </TabsContent>
          <TabsContent value="friends" className="mt-4">
            <FriendsFeed lang={lang} />
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
