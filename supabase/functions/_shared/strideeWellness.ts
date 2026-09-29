// Stridee wellness (daily / hrv) -> terra_daily_health (steps, resting HR, HRV).
import { strideeFetch } from "./stridee.ts";

const num = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/** Upsert one Stridee wellness record; only fills fields the record carries. */
export async function ingestStrideeWellness(admin: any, userId: string, w: any): Promise<boolean> {
  const kind = w?.kind;
  if (kind !== "daily" && kind !== "hrv" && kind !== "sleep") return false;
  const date = String(w.calendar_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const provider = String(w.provider ?? "garmin").toUpperCase();
  const m = w.metrics ?? {};
  const s = w.summary ?? {};
  const patch: Record<string, unknown> = {};
  if (kind === "daily") {
    const steps = num(m.steps, m.total_steps, s.steps, s.totalSteps);
    const rhr = num(m.resting_heart_rate, m.resting_hr, m.resting_heart_rate_bpm, s.restingHeartRateInBeatsPerMinute, s.rhr, s.restingHeartRate);
    const cal = num(m.calories, m.total_calories, m.active_calories, s.activeKilocalories);
    const dist = num(m.distance_meters, m.distance_metres, m.distance, s.distanceInMeters);
    if (steps != null) patch.steps = Math.round(steps);
    if (rhr != null) patch.resting_hr = Math.round(rhr);
    if (cal != null) patch.calories = Math.round(cal);
    if (dist != null) patch.distance_metres = Math.round(dist);
  } else {
    const hrv = num(m.hrv_avg, m.last_night_avg, m.hrv, s.lastNightAvg, s.hrvAvg);
    if (hrv != null) patch.hrv = Math.round(hrv);
  }
  if (!Object.keys(patch).length) return false;
  const { data: existing } = await admin.from("terra_daily_health").select("id")
    .eq("user_id", userId).eq("provider", provider).eq("date", date).maybeSingle();
  const now = new Date().toISOString();
  if (existing) {
    await admin.from("terra_daily_health").update({ ...patch, fetched_at: now }).eq("id", existing.id);
  } else {
    await admin.from("terra_daily_health").insert({ user_id: userId, provider, date, ...patch, fetched_at: now });
  }
  return true;
}

/** Pull daily + hrv summaries for the past `days` days. */
export async function syncStrideeWellness(admin: any, userId: string, stridreeUserId: string | null, days: number) {
  const from = new Date(Date.now() - Math.min(days, 400) * 86400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  let stored = 0;
  for (const kind of ["daily", "hrv"]) {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const qs = new URLSearchParams({ kind, from_date: from, to_date: to, limit: "200" });
      if (stridreeUserId) qs.set("user_id", stridreeUserId);
      else qs.set("external_user_id", userId);
      if (cursor) qs.set("starting_after", cursor);
      const res = await strideeFetch("GET", `/v1/wellness?${qs}`);
      if (!res.ok) { console.warn("[stridee-wellness]", kind, res.status, (await res.text()).slice(0, 200)); break; }
      const b = await res.json();
      const rows = b.data ?? b.wellness ?? b.items ?? [];
      for (const w of rows) { try { if (await ingestStrideeWellness(admin, userId, w)) stored++; } catch (e) { console.error("[stridee-wellness] row", e); } }
      cursor = b.has_more ? (b.next_starting_after ?? rows[rows.length - 1]?.id) : undefined;
      if (!cursor) break;
    }
  }
  return stored;
}
