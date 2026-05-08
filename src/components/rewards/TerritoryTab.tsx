import { useState, useEffect, useCallback } from "react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, MapPin, Trophy } from "lucide-react";
import { toast } from "sonner";
import TerritoryMap from "./TerritoryMap";
import { REGION_BOUNDS, type Region } from "@/lib/territory";

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

const REGION_KEY = "territory_region";

const TerritoryTab = ({ lang }: Props) => {
  const { user } = useAuth();
  const [region, setRegion] = useState<Region>(
    () => ((localStorage.getItem(REGION_KEY) as Region) || "HK"),
  );
  const [hexes, setHexes] = useState<Hex[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);

  useEffect(() => {
    localStorage.setItem(REGION_KEY, region);
  }, [region]);

  const loadHexes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("territory_hexes")
      .select("hex_id, region, owner_user_id, owner_display_name, captured_at, capture_count")
      .eq("region", region)
      .limit(5000);
    if (!error && data) setHexes(data as Hex[]);
    setLoading(false);
  }, [region]);

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

  // Auto-sync once on mount when logged in
  useEffect(() => {
    if (user && !autoSynced) {
      setAutoSynced(true);
      sync();
    }
  }, [user, autoSynced, sync]);

  const myHexes = hexes.filter((h) => h.owner_user_id === user?.id).length;
  const totalInRegion = hexes.length;

  if (!user) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {lang === "zh" ? "請登入以開始佔領地塊" : "Sign in to start capturing territory"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Region toggle */}
      <div className="flex gap-2">
        {(["HK", "TW"] as Region[]).map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              region === r
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}
          >
            {lang === "zh" ? REGION_BOUNDS[r].labelZh : REGION_BOUNDS[r].label}
          </button>
        ))}
      </div>

      {/* Stats */}
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
            {lang === "zh" ? "區域總數" : "Total in region"}
          </div>
          <div className="text-2xl font-bold mt-0.5">{totalInRegion}</div>
        </div>
      </div>

      {/* Sync button */}
      <Button
        onClick={sync}
        disabled={syncing}
        variant="outline"
        size="sm"
        className="w-full"
      >
        {syncing ? (
          <><Loader2 className="animate-spin mr-2" size={14} />{lang === "zh" ? "同步中..." : "Syncing..."}</>
        ) : (
          <><RefreshCw className="mr-2" size={14} />{lang === "zh" ? "從跑步同步地塊" : "Sync runs to claim territory"}</>
        )}
      </Button>

      {/* Map */}
      {loading && hexes.length === 0 ? (
        <div className="h-[60vh] rounded-lg border border-border bg-muted/30 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
        </div>
      ) : (
        <TerritoryMap region={region} hexes={hexes} currentUserId={user.id} />
      )}

      <p className="text-[11px] text-muted-foreground text-center px-2">
        {lang === "zh"
          ? "在地塊上跑步即可佔領,最後一位跑過的擁有該地塊"
          : "Run through a hex to claim it. Last runner to cross owns it."}
      </p>
    </div>
  );
};

export default TerritoryTab;
