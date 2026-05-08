import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { Trophy, Lock } from "lucide-react";

interface Landmark {
  hex_id: string;
  name: string;
  name_zh: string | null;
  category: string;
  icon: string | null;
  country: string | null;
}

interface CapturedRow {
  hex_id: string;
  first_captured_at: string;
}

interface Props {
  userId: string;
  lang: Lang;
  refreshKey: number;
  onLandmarkFocus?: (hex_id: string) => void;
}

const TrophyCase = ({ userId, lang, refreshKey, onLandmarkFocus }: Props) => {
  const [captured, setCaptured] = useState<(Landmark & { first_captured_at: string })[]>([]);
  const [totalLandmarks, setTotalLandmarks] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [capRes, totalRes] = await Promise.all([
        supabase
          .from("territory_landmark_captures")
          .select("hex_id, first_captured_at")
          .eq("user_id", userId)
          .order("first_captured_at", { ascending: false }),
        supabase.from("territory_landmarks").select("hex_id", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      const caps = (capRes.data ?? []) as CapturedRow[];
      setTotalLandmarks(totalRes.count ?? 0);
      if (caps.length === 0) { setCaptured([]); setLoading(false); return; }
      const { data: lmRows } = await supabase
        .from("territory_landmarks")
        .select("hex_id, name, name_zh, category, icon, country")
        .in("hex_id", caps.map((c) => c.hex_id));
      const byHex = new Map<string, Landmark>();
      for (const l of (lmRows ?? []) as Landmark[]) byHex.set(l.hex_id, l);
      const merged = caps
        .map((c) => {
          const lm = byHex.get(c.hex_id);
          return lm ? { ...lm, first_captured_at: c.first_captured_at } : null;
        })
        .filter(Boolean) as (Landmark & { first_captured_at: string })[];
      setCaptured(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  if (loading) return null;

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-amber-500/5 to-yellow-500/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Trophy size={13} className="text-amber-500" />
          {lang === "zh" ? "地標獎盃櫃" : "Landmark Trophy Case"}
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {captured.length} / {totalLandmarks}
        </span>
      </div>

      {captured.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-3 flex flex-col items-center gap-1.5">
          <Lock size={16} className="opacity-40" />
          {lang === "zh"
            ? "跑經太平山、台北101等知名地標即可解鎖"
            : "Run through Victoria Peak, Taipei 101, marathon finish lines & more to unlock"}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {captured.map((l) => (
            <button
              key={l.hex_id}
              onClick={() => onLandmarkFocus?.(l.hex_id)}
              title={`${lang === "zh" && l.name_zh ? l.name_zh : l.name} · ${new Date(l.first_captured_at).toLocaleDateString()}`}
              className="aspect-square rounded-md bg-card border border-amber-500/30 hover:border-amber-500 transition-colors flex flex-col items-center justify-center gap-0.5 p-1"
            >
              <span className="text-xl leading-none">{l.icon ?? "📍"}</span>
              <span className="text-[9px] truncate w-full text-center text-muted-foreground">
                {lang === "zh" && l.name_zh ? l.name_zh : l.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrophyCase;
