import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { Progress } from "@/components/ui/progress";
import { getCityBadge, nextCityBadge } from "@/lib/cityBadges";
import { MapPin } from "lucide-react";

interface City {
  slug: string;
  display_name: string;
  display_name_zh: string | null;
  total_hex_count: number;
  bbox: [number, number, number, number];
}

interface Props {
  userId: string;
  lang: Lang;
  onCityFocus: (city: { slug: string; bbox: [number, number, number, number] } | null) => void;
  focusedSlug: string | null;
  refreshKey: number;
}

interface Row {
  city: City;
  owned: number;
  percent: number;
}

const CityProgressList = ({ userId, lang, onCityFocus, focusedSlug, refreshKey }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Get hex_ids the user has captured
      const { data: caps } = await supabase
        .from("territory_captures")
        .select("hex_id")
        .eq("user_id", userId);
      const hexIds = Array.from(new Set((caps ?? []).map((r: any) => r.hex_id as string)));
      if (hexIds.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      // Look up city_slug for each captured hex
      const { data: hexRows } = await supabase
        .from("territory_hexes")
        .select("hex_id, city_slug")
        .in("hex_id", hexIds)
        .not("city_slug", "is", null);
      const counts = new Map<string, number>();
      for (const r of (hexRows ?? []) as { hex_id: string; city_slug: string }[]) {
        counts.set(r.city_slug, (counts.get(r.city_slug) ?? 0) + 1);
      }
      const slugs = Array.from(counts.keys());
      if (slugs.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      const { data: cities } = await supabase
        .from("territory_cities")
        .select("slug, display_name, display_name_zh, total_hex_count, bbox")
        .in("slug", slugs);
      const out: Row[] = [];
      for (const c of (cities ?? []) as any[]) {
        const owned = counts.get(c.slug) ?? 0;
        const total = c.total_hex_count || 0;
        const percent = total > 0 ? (owned / total) * 100 : 0;
        out.push({ city: c, owned, percent });
      }
      out.sort((a, b) => b.percent - a.percent);
      if (!cancelled) { setRows(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  if (loading) return null;
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-3 text-xs text-muted-foreground text-center">
        {lang === "zh" ? "完成同步以解鎖城市進度" : "Sync to unlock city progress"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1.5">
        <MapPin size={12} />
        {lang === "zh" ? "城市探索進度" : "City exploration"}
      </div>
      {rows.map(({ city, owned, percent }) => {
        const badge = getCityBadge(percent);
        const next = nextCityBadge(percent);
        const name = lang === "zh" && city.display_name_zh ? city.display_name_zh : city.display_name;
        const isFocused = focusedSlug === city.slug;
        return (
          <button
            key={city.slug}
            onClick={() => onCityFocus(isFocused ? null : { slug: city.slug, bbox: city.bbox })}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              isFocused ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm truncate">{name}</span>
                {badge && (
                  <span className="text-base shrink-0" title={lang === "zh" ? badge.labelZh : badge.label}>
                    {badge.icon}
                  </span>
                )}
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0">
                {percent.toFixed(percent < 1 ? 2 : 1)}%
              </span>
            </div>
            <Progress value={Math.min(100, percent)} className="h-1.5" />
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                {owned.toLocaleString()} / {city.total_hex_count.toLocaleString()} {lang === "zh" ? "地塊" : "hexes"}
              </span>
              {next && (
                <span>
                  {lang === "zh" ? `下一徽章 ${next}%` : `Next badge ${next}%`}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default CityProgressList;
