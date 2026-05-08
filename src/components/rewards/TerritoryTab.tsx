import { useState, useEffect, useCallback } from "react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, MapPin, Trophy, Share2 } from "lucide-react";
import { toast } from "sonner";
import TerritoryMap from "./TerritoryMap";
import ShareTerritoryDialog from "./ShareTerritoryDialog";

interface Hex {
  hex_id: string;
  region: string;
  owner_user_id: string;
  owner_display_name: string | null;
  captured_at: string;
  capture_count: number;
}

interface Props {
  lang: Lang;
}

const TerritoryTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const [hexes, setHexes] = useState<Hex[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>("Runner");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
  }, [user]);

  const loadHexes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("territory_hexes")
      .select("hex_id, region, owner_user_id, owner_display_name, captured_at, capture_count")
      .order("captured_at", { ascending: false })
      .limit(10000);
    if (!error && data) setHexes(data as Hex[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadHexes(); }, [loadHexes]);

  const sync = useCallback(async () => {
    if (!user || syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-territory");
      if (error) throw error;
      const d = data as { processedActivities: number; newHexes: number; stolenHexes: number };
      if (d.processedActivities > 0) {
        toast.success(
          lang === "zh"
            ? `處理 ${d.processedActivities} 次跑步 · 新地塊 ${d.newHexes} · 搶占 ${d.stolenHexes}`
            : `Processed ${d.processedActivities} runs · ${d.newHexes} new · ${d.stolenHexes} stolen`,
        );
      }
      await loadHexes();
    } catch (e: any) {
      toast.error(lang === "zh" ? "同步失敗" : "Sync failed");
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }, [user, syncing, lang, loadHexes]);

  useEffect(() => {
    if (user && !autoSynced) {
      setAutoSynced(true);
      sync();
    }
  }, [user, autoSynced, sync]);

  const myHexes = hexes.filter((h) => h.owner_user_id === user?.id).length;
  const totalHexes = hexes.length;

  if (!user) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {lang === "zh" ? "請登入以開始佔領地塊" : "Sign in to start capturing territory"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={12} />
            {lang === "zh" ? "我的地塊" : "Hexes owned"}
          </div>
          <div className="text-2xl font-bold mt-0.5">{myHexes}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trophy size={12} />
            {lang === "zh" ? "全球總數" : "Global total"}
          </div>
          <div className="text-2xl font-bold mt-0.5">{totalHexes}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={sync}
          disabled={syncing}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          {syncing ? (
            <><Loader2 className="animate-spin mr-2" size={14} />{lang === "zh" ? "同步中..." : "Syncing..."}</>
          ) : (
            <><RefreshCw className="mr-2" size={14} />{lang === "zh" ? "同步" : "Sync runs"}</>
          )}
        </Button>
        <Button
          onClick={() => setShareOpen(true)}
          disabled={myHexes === 0}
          size="sm"
          className="flex-1"
        >
          <Share2 className="mr-2" size={14} />
          {lang === "zh" ? "分享" : "Share"}
        </Button>
      </div>

      {loading && hexes.length === 0 ? (
        <div className="h-[60vh] rounded-lg border border-border bg-muted/30 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
        </div>
      ) : (
        <TerritoryMap hexes={hexes} currentUserId={user.id} />
      )}

      <p className="text-[11px] text-muted-foreground text-center px-2">
        {lang === "zh"
          ? "在地塊上跑步即可佔領,最後一位跑過的擁有該地塊"
          : "Run through a hex to claim it. Last runner to cross owns it."}
      </p>

      <ShareTerritoryDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        hexes={hexes.filter((h) => h.owner_user_id === user.id)}
        displayName={displayName}
        lang={lang}
      />
    </div>
  );
};

export default TerritoryTab;
