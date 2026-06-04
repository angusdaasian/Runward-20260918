import { supabase } from "@/integrations/supabase/client";

export type WidgetId =
  | "hrv"
  | "health"
  | "hr_zones"
  | "race_predictor"
  | "training_load"
  | "trends"
  | "year_heatmap"
  | "steps_today"
  | "calories_today"
  | "sleep_last_night"
  | "sleep_score"
  | "rhr"
  | "duration_week";

export interface AnalyticsWidgetPrefs {
  order: WidgetId[];
  hidden: WidgetId[];
}

export const ALL_WIDGETS: WidgetId[] = [
  "hrv",
  "health",
  "training_load",
  "race_predictor",
  "hr_zones",
  "trends",
  "year_heatmap",
  "steps_today",
  "calories_today",
  "duration_week",
  "sleep_last_night",
  "sleep_score",
  "rhr",
];

export const PREMIUM_WIDGETS: WidgetId[] = [
  "hr_zones",
  "race_predictor",
  "training_load",
];

export const DEFAULT_PREFS: AnalyticsWidgetPrefs = {
  order: ALL_WIDGETS,
  hidden: ["year_heatmap"],
};

export function normalizePrefs(raw: any): AnalyticsWidgetPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const order: WidgetId[] = Array.isArray(raw.order)
    ? raw.order.filter((id: any) => ALL_WIDGETS.includes(id))
    : [];
  // append any new widgets that weren't saved yet (so new releases show up)
  for (const id of ALL_WIDGETS) if (!order.includes(id)) order.push(id);
  const hidden: WidgetId[] = Array.isArray(raw.hidden)
    ? raw.hidden.filter((id: any) => ALL_WIDGETS.includes(id))
    : [];
  return { order, hidden };
}

export async function loadPrefs(userId: string): Promise<AnalyticsWidgetPrefs> {
  const { data } = await supabase
    .from("profiles")
    .select("analytics_widgets")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = (data as any)?.analytics_widgets;
  if (raw == null) return DEFAULT_PREFS;
  return normalizePrefs(raw);
}

export async function savePrefs(userId: string, prefs: AnalyticsWidgetPrefs) {
  await supabase
    .from("profiles")
    .update({ analytics_widgets: prefs as any })
    .eq("user_id", userId);
}
