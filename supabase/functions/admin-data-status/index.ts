// Admin-only overview of all data received from every provider.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const WATCHES = ["GARMIN", "COROS", "POLAR", "FITBIT", "ZEPP", "SUUNTO"];

type Row = {
  source: string; watch: string | null; kind: "activity" | "daily";
  user_id: string; date: string | null; title: string; detail: string; received_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing authorization" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await uc.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const source: string = body.source ?? "all";
    const watch: string = body.watch ?? "all";
    const kind: string = body.kind ?? "all";
    const limit = Math.min(Number(body.limit) || 100, 300);

    // Users with a Stridee connection — used to attribute shared daily health rows.
    const { data: sc } = await db.from("stridee_connections").select("user_id");
    const strideeUsers = [...new Set((sc ?? []).map((r: any) => r.user_id))];
    const inList = `(${strideeUsers.length ? strideeUsers.join(",") : "00000000-0000-0000-0000-000000000000"})`;

    const count = async (q: any) => (await q).count ?? 0;
    const latest = async (table: string, col: string, f: (q: any) => any) => {
      const { data } = await f(db.from(table).select(col).order(col, { ascending: false }).limit(1));
      return (data?.[0] as any)?.[col] ?? null;
    };

    // Summary
    const summary: any[] = [];
    const multi = async (src: "stridee" | "terra") => {
      const watches: any[] = [];
      for (const w of WATCHES) {
        const actF = (q: any) => {
          q = q.eq("provider", w);
          return src === "stridee" ? q.like("terra_activity_id", "stridee_%") : q.not("terra_activity_id", "like", "stridee_%");
        };
        const dayF = (q: any) => {
          q = q.eq("provider", w);
          return src === "stridee" ? q.in("user_id", strideeUsers.length ? strideeUsers : ["00000000-0000-0000-0000-000000000000"]) : q.not("user_id", "in", inList);
        };
        const a = await count(actF(db.from("terra_activities").select("id", { count: "exact", head: true })));
        const d = await count(dayF(db.from("terra_daily_health").select("id", { count: "exact", head: true })));
        if (!a && !d) continue;
        watches.push({
          watch: w, activities: a, daily: d,
          last_activity: a ? await latest("terra_activities", "created_at", actF) : null,
          last_daily: d ? await latest("terra_daily_health", "fetched_at", dayF) : null,
        });
      }
      summary.push({
        source: src, activities: watches.reduce((s, x) => s + x.activities, 0), daily: watches.reduce((s, x) => s + x.daily, 0),
        last_activity: watches.map((x) => x.last_activity).filter(Boolean).sort().pop() ?? null,
        last_daily: watches.map((x) => x.last_daily).filter(Boolean).sort().pop() ?? null,
        watches,
      });
    };
    await multi("stridee");
    await multi("terra");
    const single = async (src: string, table: string, dailyTable?: string) => {
      const id = (q: any) => q;
      const a = await count(db.from(table).select("id", { count: "exact", head: true }));
      const d = dailyTable ? await count(db.from(dailyTable).select("id", { count: "exact", head: true })) : 0;
      summary.push({
        source: src, activities: a, daily: d,
        last_activity: a ? await latest(table, "created_at", id) : null,
        last_daily: d && dailyTable ? await latest(dailyTable, "fetched_at", id) : null,
        watches: [],
      });
    };
    await single("railway", "garmin_activities", "garmin_daily_health");
    await single("strava", "strava_activities");
    await single("suunto", "suunto_activities");
    await single("intervals", "intervals_activities");
    await single("apple", "apple_health_activities");
    await single("polar", "polar_activities");

    // Live connection counts per provider, for the dashboard reference panel.
    const connTables: [string, string][] = [
      ["stridee", "stridee_connections"], ["terra", "terra_connections"], ["railway", "garmin_connections"],
      ["strava", "strava_connections"], ["suunto", "suunto_connections"], ["intervals", "intervals_connections"],
      ["apple", "apple_health_connections"], ["polar", "polar_connections"],
    ];
    const connections: Record<string, { total: number; live: number }> = {};
    const connUsers = new Set<string>();
    for (const [src, table] of connTables) {
      const { data } = await db.from(table).select("user_id");
      const rows = data ?? [];
      for (const r of rows) connUsers.add(r.user_id);
      let live = rows.length;
      if (src === "stridee") live = (await db.from(table).select("user_id", { count: "exact", head: true }).eq("status", "connected")).count ?? 0;
      if (src === "terra") live = (await db.from(table).select("user_id", { count: "exact", head: true }).eq("active", true)).count ?? 0;
      connections[src] = { total: rows.length, live };
    }
    for (const s of summary) s.connections = connections[s.source] ?? { total: 0, live: 0 };

    // Recent rows
    const rows: Row[] = [];
    const wantA = kind !== "daily", wantD = kind !== "activity";
    const want = (s: string) => source === "all" || source === s;
    const km = (m: any) => (m ? `${(Number(m) / 1000).toFixed(2)} km` : "");
    const dur = (s: any) => (s ? `${Math.round(Number(s) / 60)} min` : "");

    for (const src of ["stridee", "terra"] as const) {
      if (!want(src)) continue;
      if (wantA) {
        let q = db.from("terra_activities").select("user_id,provider,terra_activity_id,activity_name,activity_type,start_time,distance_meters,duration_seconds,created_at,device_model")
          .order("created_at", { ascending: false }).limit(limit);
        q = src === "stridee" ? q.like("terra_activity_id", "stridee_%") : q.not("terra_activity_id", "like", "stridee_%");
        if (watch !== "all") q = q.eq("provider", watch);
        const { data } = await q;
        for (const r of data ?? []) rows.push({
          source: src, watch: r.provider, kind: "activity", user_id: r.user_id, date: r.start_time,
          title: r.activity_name || r.activity_type || "Activity",
          detail: [r.activity_type, km(r.distance_meters), dur(r.duration_seconds), r.device_model].filter(Boolean).join(" · "),
          received_at: r.created_at,
        });
      }
      if (wantD) {
        let q = db.from("terra_daily_health").select("user_id,provider,date,steps,hrv,resting_hr,sleep_seconds,vo2max,calories,fetched_at")
          .order("fetched_at", { ascending: false }).limit(limit);
        q = src === "stridee" ? q.in("user_id", strideeUsers.length ? strideeUsers : ["00000000-0000-0000-0000-000000000000"]) : q.not("user_id", "in", inList);
        if (watch !== "all") q = q.eq("provider", watch);
        const { data } = await q;
        for (const r of data ?? []) rows.push({
          source: src, watch: r.provider, kind: "daily", user_id: r.user_id, date: r.date, title: "Daily health",
          detail: [
            r.steps != null && `${r.steps} steps`, r.hrv != null && `HRV ${r.hrv}`, r.resting_hr != null && `RHR ${r.resting_hr}`,
            r.sleep_seconds && `Sleep ${(r.sleep_seconds / 3600).toFixed(1)}h`, r.vo2max != null && `VO₂max ${r.vo2max}`,
            r.calories != null && `${r.calories} kcal`,
          ].filter(Boolean).join(" · "),
          received_at: r.fetched_at,
        });
      }
    }
    if (want("railway") && (watch === "all" || watch === "GARMIN")) {
      if (wantA) {
        const { data } = await db.from("garmin_activities").select("user_id,activity_name,activity_type,start_time,distance_meters,duration_seconds,created_at,device_model")
          .order("created_at", { ascending: false }).limit(limit);
        for (const r of data ?? []) rows.push({
          source: "railway", watch: "GARMIN", kind: "activity", user_id: r.user_id, date: r.start_time, title: r.activity_name || "Activity",
          detail: [r.activity_type, km(r.distance_meters), dur(r.duration_seconds), r.device_model].filter(Boolean).join(" · "), received_at: r.created_at,
        });
      }
      if (wantD) {
        const { data } = await db.from("garmin_daily_health").select("user_id,date,vo2max,resting_hr,sleep_seconds,fetched_at")
          .order("fetched_at", { ascending: false }).limit(limit);
        for (const r of data ?? []) rows.push({
          source: "railway", watch: "GARMIN", kind: "daily", user_id: r.user_id, date: r.date, title: "Daily health",
          detail: [r.resting_hr != null && `RHR ${r.resting_hr}`, r.sleep_seconds && `Sleep ${(r.sleep_seconds / 3600).toFixed(1)}h`, r.vo2max != null && `VO₂max ${r.vo2max}`].filter(Boolean).join(" · "),
          received_at: r.fetched_at,
        });
      }
    }
    if (wantA && watch === "all") {
      const simple: [string, string, string, string, string][] = [
        ["strava", "strava_activities", "name", "start_date", "moving_time"],
        ["suunto", "suunto_activities", "name", "start_date", "moving_time"],
        ["intervals", "intervals_activities", "name", "start_date", "moving_time"],
        ["apple", "apple_health_activities", "name", "start_date", "moving_time"],
        ["polar", "polar_activities", "sport_type", "start_date", "duration"],
      ];
      for (const [src, table, nameCol, dateCol, durCol] of simple) {
        if (!want(src)) continue;
        const { data } = await db.from(table).select(`user_id,sport_type,distance,${nameCol},${dateCol},${durCol},created_at`)
          .order("created_at", { ascending: false }).limit(limit);
        for (const r of (data ?? []) as any[]) rows.push({
          source: src, watch: null, kind: "activity", user_id: r.user_id, date: r[dateCol], title: r[nameCol] || r.sport_type || "Activity",
          detail: [r.sport_type, km(r.distance), typeof r[durCol] === "number" ? dur(r[durCol]) : ""].filter(Boolean).join(" · "),
          received_at: r.created_at,
        });
      }
    }
    rows.sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? ""));
    const trimmed = rows.slice(0, limit);

    const ids = [...new Set(trimmed.map((r) => r.user_id))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data } = await db.from("profiles").select("user_id,display_name").in("user_id", ids);
      for (const p of data ?? []) names[p.user_id] = p.display_name;
    }
    return json({ summary, connections, connection_users: connUsers.size, rows: trimmed.map((r) => ({ ...r, user_name: names[r.user_id] ?? null })) });
  } catch (e) {
    console.error("[admin-data-status]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
