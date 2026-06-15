import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MODEL = "gemini-3.1-flash-lite-preview";

type ThinkingLevel = "minimal" | "low" | "medium" | "high";

const THINKING_LIMITS: Record<ThinkingLevel, number> = {
  minimal: 100,
  low: 80,
  medium: 60,
  high: 40,
};

// Token budget passed to Gemini's thinkingConfig.thinkingBudget.
// 0 disables thinking; higher = more deliberation.
const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  minimal: 0,
  low: 512,
  medium: 2048,
  high: 8192,
};

function normalizeThinking(v: unknown): ThinkingLevel {
  return v === "low" || v === "medium" || v === "high" ? v : "minimal";
}

// ── Timezone helpers (Asia/Hong_Kong, UTC+8, no DST) ──
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
function toHkDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return new Date(d.getTime() + HKT_OFFSET_MS).toISOString().slice(0, 10);
}
function hkToday(): string {
  return toHkDate(new Date());
}
function hkWeekday(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
}
function hkRelativeLabel(yyyyMmDd: string, todayStr = hkToday()): string {
  if (!yyyyMmDd) return "";
  const a = new Date(`${yyyyMmDd}T00:00:00Z`).getTime();
  const b = new Date(`${todayStr}T00:00:00Z`).getTime();
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  if (diff < 0) return `${-diff}d ago`;
  return `in ${diff}d`;
}

// ── Vertex AI helper ──
async function callVertexAI(opts: {
  apiKey: string;
  systemPrompt?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
}): Promise<string> {
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODEL}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  if (opts.systemPrompt) systemParts.push({ text: opts.systemPrompt });
  for (const m of opts.messages) {
    if (m.role === "system") {
      systemParts.push({ text: m.content });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  const generationConfig: any = {
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 1024,
  };
  if (typeof opts.thinkingBudget === "number") {
    generationConfig.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  }
  const body: any = { contents, generationConfig };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Vertex AI error ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  return (
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || ""
  );
}

function pace(distMeters: number, secs: number): string {
  if (!distMeters || !secs) return "—";
  const km = distMeters / 1000;
  if (km < 0.05) return "—";
  const paceSecPerKm = secs / km;
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function fmtPaceSec(paceSecPerKm: number): string {
  if (!Number.isFinite(paceSecPerKm)) return "—";
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

// Detect interval/fartlek structure from raw lap arrays (Garmin/Terra format).
// Returns a compact summary string or null when there isn't a clear interval pattern.
function summarizeLaps(rawLaps: any[] | null | undefined): string | null {
  if (!Array.isArray(rawLaps) || rawLaps.length < 3) return null;
  const norm = rawLaps
    .map((lap: any, idx: number) => {
      const distance = Number(lap.distance ?? lap.distance_meters ?? lap.total_distance_meters ?? 0) || 0;
      const elapsed = Number(
        lap.elapsed_time ?? lap.duration_seconds ?? lap.moving_time ?? lap.total_timer_time_seconds ?? 0,
      ) || 0;
      let speed = Number(lap.avg_speed ?? lap.average_speed ?? lap.avg_speed_meters_per_second ?? 0) || 0;
      if (!speed && distance > 0 && elapsed > 0) speed = distance / elapsed;
      const paceSecPerKm = speed > 0 ? 1000 / speed : Infinity;
      const avgHr = Number(lap.avg_hr ?? lap.average_hr ?? lap.avg_hr_bpm ?? 0) || null;
      return { number: idx + 1, distance, elapsed, paceSecPerKm, avgHr };
    })
    // Drop GPS-noise laps (tiny dist+duration → unrealistic pace)
    .filter((l) => !(l.distance < 50 && l.elapsed < 10));
  if (norm.length < 3) return null;
  const validPaces = norm.filter((l) => Number.isFinite(l.paceSecPerKm)).map((l) => l.paceSecPerKm);
  if (validPaces.length < 3) return null;
  const fastest = Math.min(...validPaces);
  const slowest = Math.max(...validPaces);
  // Need clear pace contrast for interval pattern.
  if (slowest < fastest * 1.4) return null;
  const tagged = norm.map((l) => ({
    ...l,
    isRest: Number.isFinite(l.paceSecPerKm) ? l.paceSecPerKm > fastest * 1.4 : (l.distance === 0),
  }));
  const work = tagged.filter((l) => !l.isRest);
  const rest = tagged.filter((l) => l.isRest);
  if (work.length < 2 || rest.length < 1) return null;

  // Group consecutive work laps into sets separated by rest laps.
  const sets: { dist: number; reps: number[] }[] = [];
  let cur: number[] = [];
  let curDist = 0;
  const flush = () => {
    if (cur.length) sets.push({ dist: curDist, reps: cur });
    cur = [];
    curDist = 0;
  };
  for (const l of tagged) {
    if (l.isRest) flush();
    else { cur.push(Math.round(l.distance)); curDist += l.distance; }
  }
  flush();

  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const workPaces = work.filter((l) => Number.isFinite(l.paceSecPerKm)).map((l) => l.paceSecPerKm);
  const restPaces = rest.filter((l) => Number.isFinite(l.paceSecPerKm)).map((l) => l.paceSecPerKm);
  const setStr = sets
    .map((s, i) => `set${i + 1}=${Math.round(s.dist)}m(${s.reps.join("+")})`)
    .join(", ");
  const workHr = work.map((l) => l.avgHr).filter((x): x is number => !!x);
  const restHr = rest.map((l) => l.avgHr).filter((x): x is number => !!x);
  let s = ` [INTERVAL: ${work.length} work / ${rest.length} rest laps; work pace ${fmtPaceSec(avg(workPaces))} (fastest ${fmtPaceSec(fastest)}), rest pace ${fmtPaceSec(avg(restPaces))}`;
  if (workHr.length) s += `; work HR ${Math.round(avg(workHr))}`;
  if (restHr.length) s += `, rest HR ${Math.round(avg(restHr))}`;
  s += `; sets: ${setStr}]`;
  return s;
}

function buildActivitySummary(rows: any[], units: string): string {
  if (!rows.length) return "No recent runs in last 7 days.";
  const conv = units === "miles" ? 0.000621371 : 0.001;
  const unit = units === "miles" ? "mi" : "km";
  return rows
    .slice(0, 10)
    .map((a) => {
      const hk = toHkDate(a.start_time || a.start_date);
      const date = hk ? `${hk} (${hkWeekday(hk)}, ${hkRelativeLabel(hk)})` : "(unknown date)";
      const distRaw = a.distance_meters ?? (a.distance ? a.distance : 0);
      const dist = (distRaw * conv).toFixed(2);
      const dur = a.duration_seconds ?? a.moving_time ?? 0;
      const min = Math.round(dur / 60);
      const intervalTag = summarizeLaps(a.laps) || "";
      return `- ${date}: ${dist}${unit}, ${min}min, ${pace(distRaw, dur)}, HR avg ${a.average_hr ?? a.average_heartrate ?? "—"}${intervalTag}`;
    })
    .join("\n");
}

// Read today's usage row and return the effective used count converted to the
// CURRENT thinking level using the ratio rule.
async function getTodayUsage(
  admin: any,
  userId: string,
  currentLevel: ThinkingLevel,
): Promise<{ used: number; limit: number; remaining: number; row: any }> {
  const today = hkToday();
  const { data: row } = await admin
    .from("ai_coach_usage")
    .select("message_count, thinking_level")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  const limit = THINKING_LIMITS[currentLevel];
  if (!row) {
    return { used: 0, limit, remaining: limit, row: null };
  }
  const storedLevel = normalizeThinking(row.thinking_level);
  const storedLimit = THINKING_LIMITS[storedLevel];
  let used = row.message_count ?? 0;
  if (storedLevel !== currentLevel) {
    // Convert by ratio: ceil(used / oldLimit * newLimit)
    used = Math.min(limit, Math.ceil((used / storedLimit) * limit));
  }
  return { used, limit, remaining: Math.max(0, limit - used), row };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) return json({ error: "AI not configured" }, 500);

    // Internal service mode (used by telegram-webhook): bypass JWT auth when a
    // valid x-internal-secret + internalUserId are provided.
    const internalSecret = req.headers.get("x-internal-secret") || "";
    let user: { id: string } | null = null;
    let internalBody: any = null;
    if (internalSecret && internalSecret === SERVICE_ROLE) {
      try { internalBody = await req.clone().json(); } catch { internalBody = null; }
      const uid = internalBody?.internalUserId;
      if (typeof uid === "string" && UUID_RE.test(uid)) {
        user = { id: uid };
      }
    }
    if (!user) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      if (!token) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user: authUser },
        error: authErr,
      } = await userClient.auth.getUser(token);
      if (authErr || !authUser) return json({ error: "Unauthorized" }, 401);
      user = { id: authUser.id };
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Helper to get the user's current thinking level.
    const getThinkingLevel = async (): Promise<ThinkingLevel> => {
      const { data } = await admin
        .from("ai_coach_preferences")
        .select("thinking_level")
        .eq("user_id", user.id)
        .maybeSingle();
      return normalizeThinking(data?.thinking_level);
    };

    // ── PREFERENCES (read/write) ──
    if (action === "preferences") {
      if (req.method === "GET") {
        const { data } = await admin
          .from("ai_coach_preferences")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        return json({ preferences: data || null });
      }
      if (req.method === "POST") {
        const patch = await req.json();
        const allowed = [
          "preferred_units",
          "training_goal",
          "target_race_date",
          "experience_level",
          "training_days",
          "injuries_concerns",
          "training_intensity",
          "thinking_level",
        ];
        const cleaned: any = { user_id: user.id };
        for (const k of allowed) if (k in patch) cleaned[k] = patch[k];
        if ("thinking_level" in cleaned) {
          cleaned.thinking_level = normalizeThinking(cleaned.thinking_level);
        }
        const { data, error } = await admin
          .from("ai_coach_preferences")
          .upsert(cleaned, { onConflict: "user_id" })
          .select()
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ preferences: data });
      }
    }

    // ── INSIGHTS (read) ──
    if (action === "insights" && req.method === "GET") {
      const { data } = await admin
        .from("ai_coach_insights")
        .select("*")
        .eq("user_id", user.id)
        .order("confidence", { ascending: false })
        .limit(20);
      return json({ insights: data || [] });
    }

    // ── HISTORY (read) ──
    if (action === "history" && req.method === "GET") {
      const sessionId = url.searchParams.get("session_id");
      let resolvedSession = sessionId && UUID_RE.test(sessionId) ? sessionId : null;

      // If no session_id provided, find the most recent session for this user
      if (!resolvedSession) {
        const { data: latest } = await admin
          .from("ai_coach_conversations")
          .select("session_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedSession = latest?.session_id || null;
      }

      if (!resolvedSession) {
        return json({ messages: [], session_id: null });
      }

      const { data } = await admin
        .from("ai_coach_conversations")
        .select("id, role, content, session_id, created_at")
        .eq("user_id", user.id)
        .eq("session_id", resolvedSession)
        .order("created_at", { ascending: true })
        .limit(50);
      return json({ messages: data || [], session_id: resolvedSession });
    }

    // ── SESSIONS LIST (read) ──
    if (action === "sessions" && req.method === "GET") {
      const { data } = await admin
        .from("ai_coach_conversations")
        .select("session_id, content, role, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      const map = new Map<string, { session_id: string; last_at: string; first_user_message: string; message_count: number }>();
      const firstUserBySession = new Map<string, string>();
      const ordered = [...(data || [])].reverse();
      for (const row of ordered) {
        if (row.role === "user" && !firstUserBySession.has(row.session_id)) {
          firstUserBySession.set(row.session_id, row.content);
        }
      }
      for (const row of (data || [])) {
        const existing = map.get(row.session_id);
        if (!existing) {
          map.set(row.session_id, {
            session_id: row.session_id,
            last_at: row.created_at,
            first_user_message: firstUserBySession.get(row.session_id) || row.content,
            message_count: 1,
          });
        } else {
          existing.message_count += 1;
        }
      }
      const sessions = Array.from(map.values())
        .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
        .slice(0, 50);
      return json({ sessions });
    }

    // ── DELETE SESSION ──
    if (action === "delete_session" && req.method === "POST") {
      const { session_id } = await req.json();
      if (!session_id) return json({ error: "session_id required" }, 400);
      await admin
        .from("ai_coach_conversations")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", session_id);
      return json({ ok: true });
    }

    // ── RESET MEMORY ──
    if (action === "reset" && req.method === "POST") {
      await admin.from("ai_coach_conversations").delete().eq("user_id", user.id);
      await admin.from("ai_coach_insights").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    // ── USAGE (read) ──
    if (action === "usage" && req.method === "GET") {
      const level = await getThinkingLevel();
      const { used, limit, remaining } = await getTodayUsage(admin, user.id, level);
      return json({ remaining, used, limit, thinking_level: level });
    }

    // ── CHAT ──
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    // Premium check
    const { data: profile } = await admin
      .from("profiles")
      .select("is_premium, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.is_premium) {
      return json({ error: "Premium required", code: "premium_required" }, 403);
    }

    const thinkingLevel = await getThinkingLevel();
    const today = hkToday();
    // Look back ~9 days from UTC now to safely cover the last 7 HKT days
    // (TZ buffer) — we still display HKT-converted dates downstream.
    const lookbackIso = new Date(Date.now() - 9 * 86400000).toISOString();
    const { used: usedToday, limit: dailyLimit } = await getTodayUsage(
      admin,
      user.id,
      thinkingLevel,
    );
    if (usedToday >= dailyLimit) {
      return json(
        {
          error: "Daily limit reached",
          code: "rate_limited",
          remaining_messages_today: 0,
          limit: dailyLimit,
          thinking_level: thinkingLevel,
        },
        429,
      );
    }

    const { message, session_id, new_session, lang } = await req.json();
    if (!message || typeof message !== "string" || message.length > 4000) {
      return json({ error: "Invalid message" }, 400);
    }
    const requestedSessionId =
      typeof session_id === "string" && UUID_RE.test(session_id) ? session_id : null;
    const sessionId = new_session || !requestedSessionId ? crypto.randomUUID() : requestedSessionId;

    // Load context in parallel
    const [prefsR, historyR, insightsR, garminR, stravaR, appleR, terraR, racesR, planR] =
      await Promise.all([
        admin.from("ai_coach_preferences").select("*").eq("user_id", user.id).maybeSingle(),
        admin
          .from("ai_coach_conversations")
          .select("role, content")
          .eq("user_id", user.id)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(10),
        admin
          .from("ai_coach_insights")
          .select("insight_key, insight_value, confidence")
          .eq("user_id", user.id)
          .order("confidence", { ascending: false })
          .limit(15),
        admin
          .from("garmin_activities")
          .select("start_time, distance_meters, duration_seconds, average_hr, activity_type, laps")
          .eq("user_id", user.id)
          .gte("start_time", lookbackIso)
          .order("start_time", { ascending: false })
          .limit(10),
        admin
          .from("strava_activities")
          .select("start_date, distance, moving_time, average_heartrate, sport_type")
          .eq("user_id", user.id)
          .gte("start_date", lookbackIso)
          .order("start_date", { ascending: false })
          .limit(10),
        admin
          .from("apple_health_activities")
          .select("start_date, distance, moving_time, average_heartrate, sport_type")
          .eq("user_id", user.id)
          .gte("start_date", lookbackIso)
          .order("start_date", { ascending: false })
          .limit(10),
        admin
          .from("terra_activities")
          .select("start_time, distance_meters, duration_seconds, average_hr, activity_type, provider, laps")
          .eq("user_id", user.id)
          .gte("start_time", lookbackIso)
          .order("start_time", { ascending: false })
          .limit(10),
        admin
          .from("user_races")
          .select("race_name, race_date, category, city, country, finish_time_seconds, notes, priority")
          .eq("user_id", user.id)
          .order("race_date", { ascending: true }),
        admin
          .from("training_plans")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    const prefs = prefsR.data;
    const history = historyR.data || [];
    const insights = insightsR.data || [];
    const allActs = [
      ...(garminR.data || []).map((a: any) => ({
        ...a,
        start_date: a.start_time,
        distance: a.distance_meters,
        moving_time: a.duration_seconds,
        average_heartrate: a.average_hr,
      })),
      ...(stravaR.data || []),
      ...(appleR.data || []),
      ...(terraR.data || []).map((a: any) => ({
        ...a,
        start_date: a.start_time,
        distance: a.distance_meters,
        moving_time: a.duration_seconds,
        average_heartrate: a.average_hr,
        sport_type: a.activity_type,
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
    );

    const units = prefs?.preferred_units || "kilometers";
    const userLang = lang === "zh" ? "Traditional Chinese (Hong Kong)" : "English";
    const distUnit = units === "miles" ? "miles" : "kilometers";

    const insightsBlock = insights.length
      ? insights
          .map((i: any) => `- ${i.insight_key}: ${i.insight_value} (conf ${i.confidence})`)
          .join("\n")
      : "(none yet)";

    const prefsBlock = prefs
      ? `
- Preferred units: ${prefs.preferred_units}
- Training goal: ${prefs.training_goal || "not set"}
- Target race date: ${prefs.target_race_date || "not set"}
- Experience level: ${prefs.experience_level || "not set"}
- Available training days: ${JSON.stringify(prefs.training_days || [])}
- Injuries/concerns: ${prefs.injuries_concerns || "none reported"}
- Training intensity preference: ${prefs.training_intensity || "moderate"}`
      : "(no preferences set yet — gently ask onboarding questions across replies)";

    const todayIso = new Date().toISOString().slice(0, 10);
    const racesData = (racesR.data || []) as any[];
    const upcomingRaces = racesData.filter((r) => r.race_date >= todayIso).slice(0, 8);
    const pastRaces = racesData.filter((r) => r.race_date < todayIso).slice(-8);
    const fmtFinish = (secs: number | null) => {
      if (!secs || secs <= 0) return null;
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.round(secs % 60);
      return h > 0
        ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
        : `${m}:${s.toString().padStart(2, "0")}`;
    };
    const fmtRace = (r: any) => {
      const loc = [r.city, r.country].filter(Boolean).join(", ");
      const finish = fmtFinish(r.finish_time_seconds);
      const pr = r.priority && r.priority !== "none" ? `[${r.priority}-GOAL] ` : "";
      const parts = [`${pr}${r.race_date}: ${r.race_name} (${r.category})`];
      if (loc) parts.push(`@ ${loc}`);
      if (finish) parts.push(`— finished ${finish}`);
      return `- ${parts.join(" ")}`;
    };
    // Sort upcoming by priority (A > B > C > none) then date
    const PRIO_RANK: Record<string, number> = { A: 0, B: 1, C: 2, none: 3 };
    const upcomingSorted = [...upcomingRaces].sort((a, b) => {
      const pa = PRIO_RANK[a.priority || "none"] ?? 3;
      const pb = PRIO_RANK[b.priority || "none"] ?? 3;
      if (pa !== pb) return pa - pb;
      return a.race_date.localeCompare(b.race_date);
    });
    const aGoal = upcomingSorted.find((r) => r.priority === "A");
    const priorityLine = aGoal
      ? `\nPRIMARY (A-GOAL) RACE: ${aGoal.race_name} on ${aGoal.race_date} (${aGoal.category}). Build the training plan around peaking for this race. Treat B-goal races as tune-ups and C-goal races as training/fun runs (do not taper fully for them).`
      : upcomingSorted.some((r) => r.priority === "B" || r.priority === "C")
        ? `\nThe runner has B/C-goal races but no A-goal yet — ask which race is their main goal so you can plan the peak.`
        : "";
    const racesBlock = racesData.length
      ? `UPCOMING RACES (${upcomingSorted.length}, sorted by priority):\n${upcomingSorted.length ? upcomingSorted.map(fmtRace).join("\n") : "(none)"}\n\nPAST RACES (most recent):\n${pastRaces.length ? pastRaces.map(fmtRace).join("\n") : "(none)"}${priorityLine}`
      : "USER RACE SCHEDULE: (none yet — encourage them to add races to their schedule)";

    // ── Active training plan context ──
    const plan = (planR.data || [])[0] as any;
    const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    let planBlock = "ACTIVE TRAINING PLAN: (none — the runner is not following a structured plan)";
    if (plan) {
      const planData = asArr<any>(plan.plan_data);
      const raceDate = plan.race_date ? new Date(plan.race_date) : null;
      const planStartSeed = asArr<any>(planData[0]?.days)[0]?.date;
      const parsedStart = planStartSeed ? new Date(planStartSeed) : null;
      const fallbackStart = raceDate && Number.isFinite(Number(plan.weeks))
        ? new Date(raceDate.getTime() - Number(plan.weeks) * 7 * 86400000)
        : null;
      const planStart = parsedStart && !isNaN(parsedStart.getTime())
        ? parsedStart
        : fallbackStart && !isNaN(fallbackStart.getTime()) ? fallbackStart : null;

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      let weekNumber: number | null = null;
      if (planStart && today >= planStart) {
        const diffMs = today.getTime() - planStart.getTime();
        weekNumber = Math.max(1, Math.floor(diffMs / (7 * 86400000)) + 1);
      }

      // Collect upcoming planned days (today + next 13 days)
      const upcomingDays: string[] = [];
      const horizonEnd = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
      for (const week of planData) {
        for (const d of asArr<any>(week?.days)) {
          if (!d?.date) continue;
          if (d.date >= todayStr && d.date <= horizonEnd) {
            const dist = d.distance_km ?? d.distance;
            const workout = d.workout || d.description || d.type || "Rest";
            upcomingDays.push(`- ${d.date} (W${week.week}): ${workout}${dist ? ` — ${dist} km` : ""}`);
          }
        }
      }

      planBlock = `ACTIVE TRAINING PLAN:
- Distance/goal: ${plan.distance} (${plan.goal === "custom" ? "Custom" : plan.goal})
- Target finishing time: ${plan.target_time || "n/a"}
- Race date: ${plan.race_date || "n/a"}
- Plan length: ${plan.weeks || "?"} weeks
- Plan start: ${planStart ? planStart.toISOString().slice(0, 10) : "unknown"}
- Current week: ${weekNumber ? `Week ${weekNumber}` : "Plan has not started yet"}

PLANNED WORKOUTS (today + next 14 days):
${upcomingDays.length ? upcomingDays.join("\n") : "(no scheduled workouts in this window)"}`;
    }

    const systemPrompt = `You are an expert AI Running Coach for an athlete named ${profile?.display_name || "the runner"}.

REPLY LANGUAGE: ${userLang}. Always answer in this language regardless of the language of the user's question.

USER PROFILE:${prefsBlock}

LEARNED INSIGHTS:
${insightsBlock}

RECENT 7-DAY ACTIVITY:
${buildActivitySummary(allActs, units)}

NOTE on activity lines: a trailing "[INTERVAL: …]" tag means the run was an interval/fartlek workout — NOT an easy run. The tag shows work vs rest lap counts, paces, HR, and the per-set structure (e.g. "set1=2000m(2000), set2=1600m(1600)"). When the user asks about that run, treat it as the structured workout shown — never call it an easy/tempo run.

TRAIL AWARENESS: If the user trains for or asks about Trail Run / Trail Race / Ultramarathon, evaluate effort using EpH (Effort per Hour = distance_km + elevation_m/100 per hour) instead of flat pace. Recommend weekly trail/hill long runs, vertical-specific workouts (hill repeats), and progressive elevation buildup. Reference total elevation gain from activity stats when commenting on trail runs.

${racesBlock}

${planBlock}

PLAN ADHERENCE RULES:
- If an ACTIVE TRAINING PLAN is shown above, the runner is already following it. When recommending workouts for today / tomorrow / this week, your suggestion MUST match the planned workout for that date — do NOT invent a different workout.
- You may ANALYZE the plan when asked: comment on its structure, weekly load progression, balance of easy/quality/long runs, taper, and how well recent runs are tracking against it. Suggest tweaks if you see issues, but be explicit that it's a suggestion to adjust the plan rather than a replacement workout.
- If the runner asks for a workout on a date covered by the plan, restate the planned workout (with pace/HR guidance) instead of proposing something new.
- Only suggest a fully different workout when (a) there is no active plan, (b) the date is outside the plan window, or (c) the runner explicitly asks to deviate / replace the planned session.

COACHING STYLE:
- Address the runner by name when natural.
- Reference their actual recent runs, past race results, and upcoming races when relevant.
- When recommending workouts/plans, ALWAYS prioritize the runner's A-goal race (peak for it). Use B-goal races as sharpening tune-ups and C-goal races as training runs — do not taper fully for B/C races.
- Use ${distUnit} for all distances and paces.
- Adapt to experience level (beginner gets simple language; elite gets technical detail).
- Keep responses concise: 2-4 short paragraphs. Use markdown for lists where it helps.
- Be encouraging, supportive, consistent.

SAFETY:
- Never diagnose injuries — recommend a medical professional for any pain.
- Encourage rest days and listening to the body.
- Don't prescribe extreme training jumps.

If the user has no preferences set yet, ask ONE friendly onboarding question per reply (experience, goal, days/week) — not all at once.`;

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: message },
    ];

    const aiText = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      systemPrompt,
      messages,
      temperature: 0.7,
      // Gemini counts thinking tokens against maxOutputTokens, so scale the
      // budget with the thinking level — otherwise high thinking returns blank.
      maxOutputTokens: 1500 + THINKING_BUDGETS[thinkingLevel],
      thinkingBudget: THINKING_BUDGETS[thinkingLevel],
    });

    // Persist messages + usage (write under current thinking level so future
    // ratio conversions stay consistent)
    const { error: insertError } = await admin.from("ai_coach_conversations").insert([
      { user_id: user.id, session_id: sessionId, role: "user", content: message },
      { user_id: user.id, session_id: sessionId, role: "assistant", content: aiText },
    ]);
    if (insertError) {
      console.error("failed to persist ai coach conversation", insertError);
      return json({ error: "Failed to save conversation" }, 500);
    }
    await admin
      .from("ai_coach_usage")
      .upsert(
        {
          user_id: user.id,
          date: today,
          message_count: usedToday + 1,
          thinking_level: thinkingLevel,
        },
        { onConflict: "user_id,date" },
      );

    // Fire-and-forget insight extraction
    (async () => {
      try {
        const extractPrompt = `From this exchange, extract up to 3 short, durable insights about the runner (preferences, goals, challenges, achievements, style). Return ONLY a JSON array, no other text. Each item: {"type":"preference|goal|challenge|achievement","key":"snake_case_key","value":"short value","confidence":0..1}. If nothing notable, return [].

USER: ${message}
COACH: ${aiText}`;
        const out = await callVertexAI({
          apiKey: VERTEX_API_KEY,
          messages: [{ role: "user", content: extractPrompt }],
          temperature: 0.2,
          maxOutputTokens: 400,
          thinkingBudget: 0,
        });
        const m = out.match(/\[[\s\S]*\]/);
        if (!m) return;
        const arr = JSON.parse(m[0]);
        if (!Array.isArray(arr)) return;
        const rows = arr
          .filter((x: any) => x?.key && x?.value)
          .slice(0, 3)
          .map((x: any) => ({
            user_id: user.id,
            insight_type: String(x.type || "preference").slice(0, 32),
            insight_key: String(x.key).slice(0, 64),
            insight_value: String(x.value).slice(0, 240),
            confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0.5)),
          }));
        if (rows.length) {
          await admin
            .from("ai_coach_insights")
            .upsert(rows, { onConflict: "user_id,insight_key" });
        }
      } catch (e) {
        console.warn("insight extraction failed", e);
      }
    })();

    return json({
      response: aiText,
      session_id: sessionId,
      remaining_messages_today: Math.max(0, dailyLimit - (usedToday + 1)),
      limit: dailyLimit,
      thinking_level: thinkingLevel,
    });
  } catch (e) {
    console.error("ai-running-coach error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
