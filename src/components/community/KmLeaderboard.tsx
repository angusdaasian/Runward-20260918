import { useCallback, useEffect, useState } from "react";
import { Medal, Route, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import GroupManager, { type LeaderboardGroup } from "./GroupManager";
import CommunityPrivacy from "./CommunityPrivacy";
import type { Lang } from "@/lib/i18n";

interface Entry { user_id: string; display_name: string | null; avatar_url: string | null; distance_km: number; run_count: number }
interface Props { lang: Lang }

export default function KmLeaderboard({ lang }: Props) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [groups, setGroups] = useState<LeaderboardGroup[]>([]);
  const [active, setActive] = useState("global");
  const [summary, setSummary] = useState({ distance_km: 0, run_count: 0 });
  const [loading, setLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("get_my_leaderboard_groups");
    setGroups((data || []) as LeaderboardGroup[]);
  }, [user]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const ranking = active === "global" ? supabase.rpc("get_km_leaderboard", { p_limit: 100 }) : supabase.rpc("get_group_leaderboard", { p_group_id: active });
    Promise.all([ranking, supabase.rpc("get_my_month_km")]).then(([rankResult, myResult]) => {
      setEntries((rankResult.data || []) as Entry[]);
      const mine = myResult.data?.[0]; if (mine) setSummary(mine);
      setLoading(false);
    });
  }, [active, user]);

  if (!user) return <div className="py-12 text-center text-sm text-muted-foreground">{zh ? "請登入以查看排行榜" : "Sign in to view leaderboards"}</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4"><Route size={17} className="text-primary" /><p className="mt-2 text-2xl font-bold">{Number(summary.distance_km).toFixed(1)} <span className="text-sm font-medium text-muted-foreground">km</span></p><p className="text-xs text-muted-foreground">{zh ? "本月距離" : "This month"}</p></div>
        <div className="rounded-lg border border-border bg-card p-4"><Trophy size={17} className="text-primary" /><p className="mt-2 text-2xl font-bold">{summary.run_count}</p><p className="text-xs text-muted-foreground">{zh ? "跑步次數" : "Runs"}</p></div>
      </div>
      <CommunityPrivacy lang={lang} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={active === "global" ? "default" : "outline"} onClick={() => setActive("global")}>{zh ? "全球" : "Global"}</Button>
        {groups.map((g) => <Button key={g.id} size="sm" variant={active === g.id ? "default" : "outline"} onClick={() => setActive(g.id)}>{g.emoji} {g.name}</Button>)}
        <GroupManager lang={lang} groups={groups} onChanged={loadGroups} />
      </div>
      {loading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : entries.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">{zh ? "本月尚未有排行榜資料" : "No leaderboard entries this month"}</div> : <div className="divide-y divide-border rounded-lg border border-border bg-card">{entries.map((entry, index) => <div key={entry.user_id} className="flex items-center gap-3 p-3"><span className="w-7 text-center font-bold text-muted-foreground">{index < 3 ? <Medal className="mx-auto text-primary" size={18} /> : index + 1}</span><Avatar><AvatarImage src={entry.avatar_url || undefined} /><AvatarFallback>{(entry.display_name || "R")[0]}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.display_name || (zh ? "跑者" : "Runner")}</p><p className="text-xs text-muted-foreground">{entry.run_count} {zh ? "次跑步" : "runs"}</p></div><strong className="tabular-nums">{Number(entry.distance_km).toFixed(1)} km</strong></div>)}</div>}
    </div>
  );
}