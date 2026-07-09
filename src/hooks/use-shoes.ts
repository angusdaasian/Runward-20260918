import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type RunTypeKey = "Recovery" | "Easy" | "Long" | "Tempo" | "Interval" | "Race";
export const RUN_TYPES: RunTypeKey[] = ["Recovery", "Easy", "Long", "Tempo", "Interval", "Race"];

export type ShoeCatalogItem = {
  id: string;
  brand: string;
  model: string;
  category: string;
  year: number | null;
  description: string | null;
};

export type UserShoe = {
  id: string;
  user_id: string;
  catalog_id: string | null;
  custom_brand: string | null;
  custom_model: string | null;
  nickname: string | null;
  purchase_date: string | null;
  max_km: number;
  retired: boolean;
  created_at: string;
  catalog?: ShoeCatalogItem | null;
};

export type ShoeAssignment = {
  id: string;
  user_id: string;
  activity_source: string;
  activity_id: string;
  user_shoe_id: string;
  distance_meters: number;
  run_type: RunTypeKey | null;
};

export function shoeLabel(s: UserShoe): string {
  const brand = s.catalog?.brand || s.custom_brand || "";
  const model = s.catalog?.model || s.custom_model || "";
  const base = `${brand} ${model}`.trim();
  return s.nickname ? `${s.nickname} · ${base}` : base;
}

export function useUserShoes() {
  const { user } = useAuth();
  const [shoes, setShoes] = useState<UserShoe[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user?.id) { setShoes([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_shoes")
      .select("*, catalog:shoes_catalog(id,brand,model,category,year,description)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) console.warn("[useUserShoes]", error);
    setShoes((data as any[]) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  return { shoes, loading, reload };
}

export function useShoeDefaults() {
  const { user } = useAuth();
  const [defaults, setDefaults] = useState<Record<RunTypeKey, string | null>>({
    Recovery: null, Easy: null, Long: null, Tempo: null, Interval: null, Race: null,
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("user_shoe_defaults")
      .select("run_type,user_shoe_id")
      .eq("user_id", user.id);
    const next: Record<RunTypeKey, string | null> = {
      Recovery: null, Easy: null, Long: null, Tempo: null, Interval: null, Race: null,
    };
    for (const row of (data as any[]) || []) next[row.run_type as RunTypeKey] = row.user_shoe_id;
    setDefaults(next);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  const setDefault = async (runType: RunTypeKey, userShoeId: string | null) => {
    if (!user?.id) return;
    if (!userShoeId) {
      await supabase.from("user_shoe_defaults").delete().eq("user_id", user.id).eq("run_type", runType);
    } else {
      await supabase.from("user_shoe_defaults").upsert(
        { user_id: user.id, run_type: runType, user_shoe_id: userShoeId, updated_at: new Date().toISOString() },
        { onConflict: "user_id,run_type" }
      );
    }
    await reload();
  };

  return { defaults, loading, reload, setDefault };
}

export function useShoeAssignments() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ShoeAssignment[]>([]);

  const reload = useCallback(async () => {
    if (!user?.id) { setAssignments([]); return; }
    const { data } = await supabase
      .from("activity_shoe_assignments")
      .select("*")
      .eq("user_id", user.id);
    setAssignments((data as any[]) || []);
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  const assign = async (
    activitySource: string,
    activityId: string,
    userShoeId: string,
    distanceMeters: number,
    runType: RunTypeKey | null
  ) => {
    if (!user?.id) return;
    await supabase.from("activity_shoe_assignments").upsert(
      {
        user_id: user.id,
        activity_source: activitySource,
        activity_id: activityId,
        user_shoe_id: userShoeId,
        distance_meters: distanceMeters,
        run_type: runType,
        auto_assigned: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,activity_source,activity_id" }
    );
    await reload();
  };

  const unassign = async (activitySource: string, activityId: string) => {
    if (!user?.id) return;
    await supabase
      .from("activity_shoe_assignments")
      .delete()
      .eq("user_id", user.id)
      .eq("activity_source", activitySource)
      .eq("activity_id", activityId);
    await reload();
  };

  return { assignments, reload, assign, unassign };
}

export function computeShoeKm(
  shoeId: string,
  assignments: ShoeAssignment[]
): number {
  const meters = assignments
    .filter((a) => a.user_shoe_id === shoeId)
    .reduce((sum, a) => sum + (a.distance_meters || 0), 0);
  return meters / 1000;
}
