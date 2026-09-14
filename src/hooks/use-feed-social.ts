import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FeedRunSocial } from "@/components/community/FeedRunCard";

interface Ref { source: string; source_id: string }

/** Like/comment counts for a list of feed runs, keyed by `source-source_id`. */
export function useFeedSocial(runs: Ref[]) {
  const [map, setMap] = useState<Record<string, FeedRunSocial>>({});
  const key = runs.map((r) => `${r.source}-${r.source_id}`).join(",");

  const refresh = useCallback(async () => {
    if (runs.length === 0) { setMap({}); return; }
    const { data } = await (supabase.rpc as any)("get_activity_social_counts", {
      p_sources: runs.map((r) => r.source),
      p_source_ids: runs.map((r) => r.source_id),
    });
    const next: Record<string, FeedRunSocial> = {};
    for (const row of (data || []) as Array<{ source: string; source_id: string; like_count: number; comment_count: number; liked_by_me: boolean }>) {
      next[`${row.source}-${row.source_id}`] = {
        like_count: Number(row.like_count || 0),
        comment_count: Number(row.comment_count || 0),
        liked_by_me: Boolean(row.liked_by_me),
      };
    }
    setMap(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);

  return { social: map, refreshSocial: refresh };
}
