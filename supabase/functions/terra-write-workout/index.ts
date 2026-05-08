// Push a single day / week / entire AI-generated training plan to Garmin or
// Coros via Terra's POST /v2/plannedWorkout endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, pickEnvFromRequest } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DayPlan {
  day: string;
  date: string;
  type: string;
  title: string;
  description: string;
  distance_km: number | null;
  pace: string | null;
  color: string;
}
interface WeekPlan { week: number; startDate: string; days: DayPlan[]; }

const SKIP_TYPES = new Set(["Rest", "Cross Training"]);

// "5:30/km" -> 330 seconds per km. Returns null if unparseable.
function paceToSecondsPerKm(pace: string | null): number | null {
  if (!pace) return null;
  const m = pace.match(/(\d+):(\d{1,2})/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

// Parse interval description like "800m x 6 at 4:00/km, rest 2:00 between sets"
function parseInterval(desc: string): { distM: number; reps: number; paceSec: number | null; restSec: number | null } | null {
  if (!desc) return null;
  const dm = desc.match(/(\d+)\s*m\s*x\s*(\d+)/i);
  if (!dm) return null;
  const distM = Number(dm[1]);
  const reps = Number(dm[2]);
  const paceMatch = desc.match(/at\s*(\d+):(\d{1,2})\s*\/\s*km/i);
  const paceSec = paceMatch ? Number(paceMatch[1]) * 60 + Number(paceMatch[2]) : null;
  const restMatch = desc.match(/rest\s*(\d+):(\d{1,2})/i) ?? desc.match(/rest\s*(\d+)\s*(?:s|sec|seconds)/i);
  let restSec: number | null = null;
  if (restMatch) {
    if (restMatch.length === 3 && restMatch[2]) restSec = Number(restMatch[1]) * 60 + Number(restMatch[2]);
    else restSec = Number(restMatch[1]);
  }
  return { distM, reps, paceSec, restSec: Number.isFinite(restSec ?? NaN) ? restSec : null };
}

// Build a Terra "data" entry for one day. Returns null for rest / skipped days.
function buildPlannedWorkout(day: DayPlan, provider: "GARMIN" | "COROS"): any | null {
  if (SKIP_TYPES.has(day.type)) return null;
  const paceSec = paceToSecondsPerKm(day.pace);
  // Pace bounds in m/s with ±5% window.
  const buildPaceTarget = (sec: number | null) => {
    if (!sec) return [];
    const center = 1000 / sec;
    return [{
      target_type: 11, // pace/speed target per Terra PlannedWorkoutStepTarget model
      speed_meters_per_second_low: Number((center * 0.95).toFixed(3)),
      speed_meters_per_second_high: Number((center * 1.05).toFixed(3)),
      speed_meters_per_second: Number(center.toFixed(3)),
    }];
  };

  // Wrap any inner step in a Garmin-style repeat container (type:1, reps:1).
  const wrap = (order: number, description: string, inner: any) => ({
    type: 1, order, description,
    durations: [{ duration_type: 9, reps: 1 }],
    steps: [inner],
  });

  const containers: any[] = [];

  if (day.type === "Interval") {
    const parsed = parseInterval(day.description);
    containers.push(wrap(0, "Warm Up", {
      type: 0, order: 0, intensity: 5, description: "Warm Up",
      durations: [{ duration_type: 0, seconds: 600 }],
      targets: [],
    }));
    if (parsed) {
      containers.push({
        type: 1, order: 1,
        description: `${parsed.reps} x ${parsed.distM}m`,
        durations: [{ duration_type: 9, reps: parsed.reps }],
        steps: [
          {
            type: 0, order: 0, intensity: 5,
            description: `${parsed.distM}m work`,
            durations: [{ duration_type: 1, distance_meters: parsed.distM }],
            targets: buildPaceTarget(parsed.paceSec),
          },
          {
            type: 0, order: 1, intensity: 5,
            description: parsed.restSec ? `${parsed.restSec}s recovery` : "Recovery",
            durations: [{ duration_type: 0, seconds: parsed.restSec ?? 90 }],
            targets: [],
          },
        ],
      });
    } else {
      const distM = day.distance_km ? Math.round(day.distance_km * 1000) : 5000;
      containers.push(wrap(1, day.description?.slice(0, 60) || "Interval", {
        type: 0, order: 0, intensity: 5,
        description: (day.description || "Interval").slice(0, 60),
        durations: [{ duration_type: 1, distance_meters: distM }],
        targets: buildPaceTarget(paceSec),
      }));
    }
    containers.push(wrap(2, "Cool Down", {
      type: 0, order: 0, intensity: 5, description: "Cool Down",
      durations: [{ duration_type: 0, seconds: 600 }],
      targets: [],
    }));
  } else {
    const distM = day.distance_km ? Math.round(day.distance_km * 1000) : null;
    containers.push(wrap(0, day.title || day.type, {
      type: 0, order: 0, intensity: 5,
      description: (day.title || day.type).slice(0, 60),
      durations: distM
        ? [{ duration_type: 1, distance_meters: distM }]
        : [{ duration_type: 0, seconds: 1800 }],
      targets: buildPaceTarget(paceSec),
    }));
  }

  const estimatedDistanceMeters = day.distance_km ? Math.round(day.distance_km * 1000) : null;
  const estimatedDurationSeconds = estimatedDistanceMeters && paceSec
    ? Math.round((estimatedDistanceMeters / 1000) * paceSec)
    : null;

  return {
    steps: containers,
    metadata: {
      type: 33, // RUN
      name: (day.title || day.type || "Run").slice(0, 80),
      description: (day.description || day.title || day.type || "Run").slice(0, 240),
      provider,
      planned_date: day.date,
      estimated_distance_meters: estimatedDistanceMeters,
      estimated_duration_seconds: estimatedDurationSeconds,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const planId: string | undefined = body.plan_id;
    const scope: "day" | "week" | "all" = body.scope ?? "day";
    const week: number | undefined = body.week;
    const dayIndex: number | undefined = body.day_index;
    const providerArg: string | undefined = body.provider ? String(body.provider).toUpperCase() : undefined;
    if (!planId) {
      return new Response(JSON.stringify({ error: "plan_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load plan (RLS-safe via user_id check)
    const { data: planRow, error: planErr } = await admin
      .from("training_plans").select("id, user_id, plan_data").eq("id", planId).maybeSingle();
    if (planErr || !planRow || planRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "plan not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const plan: WeekPlan[] = Array.isArray(planRow.plan_data) ? planRow.plan_data : [];

    // Pick connection — prefer requested provider, otherwise first Garmin/Coros.
    const { data: conns } = await admin
      .from("terra_connections").select("*")
      .eq("user_id", user.id).eq("active", true)
      .in("provider", ["GARMIN", "COROS"]);
    let conn = (conns ?? []).find((c) => providerArg ? c.provider === providerArg : true);
    if (!conn) {
      return new Response(JSON.stringify({ error: "no Garmin/Coros connection" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const provider = conn.provider as "GARMIN" | "COROS";

    // Collect (week, dayIdx, day) targets based on scope.
    const targets: Array<{ week: number; dayIdx: number; day: DayPlan }> = [];
    if (scope === "day") {
      const w = plan.find((x) => x.week === week);
      const d = w?.days?.[dayIndex ?? -1];
      if (w && d) targets.push({ week: w.week, dayIdx: dayIndex!, day: d });
    } else if (scope === "week") {
      const w = plan.find((x) => x.week === week);
      if (w) w.days.forEach((d, i) => targets.push({ week: w.week, dayIdx: i, day: d }));
    } else {
      plan.forEach((w) => w.days.forEach((d, i) => targets.push({ week: w.week, dayIdx: i, day: d })));
    }

    const { devId, apiKey } = getTerraCreds(pickEnvFromRequest(req));
    const headers = {
      "dev-id": devId, "x-api-key": apiKey, "Content-Type": "application/json",
    };

    const errors: any[] = [];
    let pushed = 0;
    let skipped = 0;
    for (const { week: wkNum, dayIdx, day } of targets) {
      const payload = buildPlannedWorkout(day, provider);
      if (!payload) { skipped++; continue; }
      const url = `https://api.tryterra.co/v2/plannedWorkout?user_id=${encodeURIComponent(conn.terra_user_id)}`;
      try {
        const bodyStr = JSON.stringify({ data: [payload] });
        const resp = await fetch(url, { method: "POST", headers, body: bodyStr });
        const text = await resp.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* keep as text */ }
        if (!resp.ok) {
          console.error("[terra-write-workout] Terra error", resp.status, text, "payload:", bodyStr);
          errors.push({ week: wkNum, dayIdx, status: resp.status, body: json ?? text });
          continue;
        }
        const logId = Array.isArray(json?.log_ids) ? String(json.log_ids[0] ?? "") : null;
        await admin.from("pushed_workouts").upsert({
          user_id: user.id, plan_id: planId,
          week: wkNum, day_index: dayIdx, provider,
          terra_log_id: logId, pushed_at: new Date().toISOString(),
        }, { onConflict: "user_id,plan_id,week,day_index,provider" });
        pushed++;
      } catch (e: any) {
        errors.push({ week: wkNum, dayIdx, error: e?.message ?? String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, provider, pushed, skipped, failed: errors.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[terra-write-workout]", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
