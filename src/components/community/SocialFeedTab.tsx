import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Lang } from "@/lib/i18n";
import SocialWall from "./SocialWall";
import FriendsFeed from "./FriendsFeed";
import GroupManager, { type LeaderboardGroup } from "./GroupManager";
import GroupInvitations from "./GroupInvitations";

export default function SocialFeedTab({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const [groups, setGroups] = useState<LeaderboardGroup[]>([]);
  const [view, setView] = useState<"public" | "private">("public");
  const [loaded, setLoaded] = useState(false);

  const loadGroups = async () => {
    if (!user) { setLoaded(true); return; }
    const { data } = await supabase.rpc("get_my_leaderboard_groups");
    setGroups((data || []) as LeaderboardGroup[]);
    setLoaded(true);
  };
  useEffect(() => { loadGroups(); /* eslint-disable-next-line */ }, [user]);

  const hasGroup = groups.length > 0;

  return (
    <div className="space-y-4">
      <GroupInvitations lang={lang} onJoined={loadGroups} />
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setView("public")}
          className={`py-2 rounded-xl text-sm font-medium transition-colors ${
            view === "public" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {zh ? "公開動態" : "Public"}
        </button>
        <button
          onClick={() => hasGroup && setView("private")}
          disabled={!hasGroup}
          aria-disabled={!hasGroup}
          className={`py-2 rounded-xl text-sm font-medium transition-colors ${
            view === "private"
              ? "bg-primary text-primary-foreground"
              : hasGroup
                ? "bg-muted text-muted-foreground"
                : "bg-muted/60 text-muted-foreground/40 cursor-not-allowed"
          }`}
        >
          {zh ? "好友動態" : "Friends"}
        </button>
      </div>

      {!hasGroup && (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          {zh ? "加入或建立私人群組後即可查看好友動態。" : "Join or create a private group to see your friends' runs."}{" "}
          <span className="inline-flex align-middle">
            <GroupManager lang={lang} groups={groups} onChanged={loadGroups} />
          </span>
        </p>
      )}

      {view === "public" ? <SocialWall lang={lang} /> : hasGroup ? <FriendsFeed lang={lang} /> : null}
    </div>
  );
}
