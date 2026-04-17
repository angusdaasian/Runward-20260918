// Manual Garmin activity import via public weblink (Firecrawl + AI extraction)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── VDOT helpers ──
function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}
function vo2Cost(velocity: number): number {
  return -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}
function calculateVdot(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  const velocity = distanceMeters / minutes;
  return vo2Cost(velocity) / percentVO2(minutes);
}

const RANK_TIERS = ["Bronze", "Silver", "Gold", "Diamond"];
const DIVISIONS = ["V", "IV", "III", "II", "I"];
const XP_PER_DIVISION = 2000;

function computeRankFromXP(monthlyXp: number) {
  const divisionIndex = Math.min(
    Math.floor(monthlyXp / XP_PER_DIVISION),
    RANK_TIERS.length * DIVISIONS.length - 1,
  );
  const tierIndex = Math.min(Math.floor(divisionIndex / DIVISIONS.length), RANK_TIERS.length - 1);
  const divIndex = divisionIndex % DIVISIONS.length;
  return { tier: RANK_TIERS[tierIndex], division: DIVISIONS[divIndex] };
}

const runningSportTypes = new Set([
  "Run", "TrailRun", "VirtualRun", "Treadmill", "Workout",
  "running", "trail_running", "treadmill_running",
]);

// ── Firecrawl ──
async function scrapeWithFirecrawl(
  url: string,
  apiKey: string,
): Promise<{ markdown: string; screenshotUrl: string | null }> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "screenshot"],
      waitFor: 8000,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Firecrawl failed: ${data.error || "Unknown error"}`);
  return {
    markdown: data.data?.markdown || "",
    screenshotUrl: data.data?.screenshot || null,
  };
}

// ── AI extraction ──
async function extractActivityData(markdown: string, aiKey: string): Promise<any> {
  const todayIso = new Date().toISOString();
  const todayDate = todayIso.slice(0, 10);
  const systemPrompt = `You extract running activity data from Garmin Connect public activity pages. Return ONLY a JSON object, no prose, no markdown fences.

TODAY'S DATE IS ${todayDate} (UTC: ${todayIso}). Use this when the page shows relative dates like "Yesterday", "Today", "2 days ago", or a date with no year (e.g. "Apr 16"). NEVER guess a year — if no year is visible, assume the most recent past occurrence relative to today. The start_time MUST NOT be in the future and MUST NOT be more than 5 years in the past.

Schema:
{
  "activity_name": string,
  "activity_type": "Run" | "TrailRun" | "Treadmill" | "Workout" | "Other",
  "start_time": ISO8601 string (activity start date/time; infer year from TODAY if missing; use Z if no tz),
  "distance_meters": number (convert km/mi to meters),
  "duration_seconds": number (convert hh:mm:ss to seconds),
  "average_pace_seconds_per_km": number | null,
  "average_hr": number | null,
  "max_hr": number | null,
  "elevation_gain_meters": number | null,
  "calories": number | null,
  "laps": [
    {
      "lap_index": number,
      "distance_meters": number | null,
      "duration_seconds": number | null,
      "average_pace_seconds_per_km": number | null,
      "average_hr": number | null,
      "max_hr": number | null,
      "total_ascent_meters": number | null
    }
  ]
}

If a field is not present, use null. If laps are not visible, return an empty array. Never invent values.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: markdown.slice(0, 60000) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI extraction failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) content = jsonMatch[1].trim();
  return JSON.parse(content);
}

// ── URL → stable id ──
function deriveActivityId(url: string): string {
  const m = url.match(/\/activity\/(\d+)/i);
  if (m) return `manual_${m[1]}`;
  // fallback: hash the URL
  let h = 0;
  for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  return `manual_${Math.abs(h)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const url: string = (body?.url || "").trim();

    if (!url || !/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/garmin/i.test(url)) {
      return new Response(JSON.stringify({ error: "URL must be a Garmin Connect activity link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Eligibility check: no fitness app must be connected
    const [stravaConn, garminConn] = await Promise.all([
      supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("garmin_connections").select("id").eq("user_id", user.id).maybeSingle(),
    ]);
    if (stravaConn.data || garminConn.data) {
      return new Response(JSON.stringify({
        error: "Manual import is only available when no fitness app is connected. Please disconnect Strava/Garmin first.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Scrape + extract
    console.log(`[manual-import] scraping ${url} for user ${user.id}`);
    const { markdown: md, screenshotUrl } = await scrapeWithFirecrawl(url, FIRECRAWL_API_KEY);
    if (!md || md.length < 100) {
      return new Response(JSON.stringify({ error: "Could not read the activity page. Make sure the activity is set to Public." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: any;
    try {
      extracted = await extractActivityData(md, LOVABLE_API_KEY);
    } catch (e) {
      console.error("AI extraction error:", e);
      return new Response(JSON.stringify({ error: "Failed to extract activity data from page" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    const distance = Number(extracted?.distance_meters) || 0;
    const duration = Number(extracted?.duration_seconds) || 0;
    if (distance < 100 || duration < 30) {
      return new Response(JSON.stringify({ error: "Could not extract valid distance/duration. Ensure the activity is public and has data." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanity-check the extracted start_time. The Garmin Connect public page
    // renders timestamps in the viewer's local timezone (the user is in HKT,
    // UTC+8). The AI returns a naive ISO string with "Z" appended, which the
    // Date constructor then interprets as UTC — making the activity appear
    // 8 hours ahead. Treat any "Z"-suffixed extraction as HKT wall-clock and
    // subtract 8h to get the true UTC instant.
    const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
    const rawStart: string | undefined = extracted?.start_time;
    let startMs = rawStart ? new Date(rawStart).getTime() : NaN;
    // If the AI returned a naive timestamp (no explicit non-UTC offset), treat
    // it as HKT wall-clock time and convert to true UTC.
    if (isFinite(startMs) && rawStart) {
      const hasExplicitOffset = /[+-]\d{2}:?\d{2}$/.test(rawStart);
      if (!hasExplicitOffset) {
        startMs = startMs - HKT_OFFSET_MS;
      }
    }
    if (!isFinite(startMs) || startMs > nowMs + 24 * 60 * 60 * 1000 || startMs < nowMs - fiveYearsMs) {
      console.warn(`[manual-import] invalid extracted start_time "${rawStart}" — falling back to now`);
      startMs = nowMs;
    }
    const startTime = new Date(startMs).toISOString();

    const garminActivityId = deriveActivityId(url);

    // Insert / update activity row
    const row = {
      user_id: user.id,
      garmin_activity_id: garminActivityId,
      activity_name: extracted?.activity_name || "Manual Garmin Import",
      activity_type: extracted?.activity_type || "Run",
      start_time: startTime,
      distance_meters: distance,
      duration_seconds: duration,
      elevation_gain: extracted?.elevation_gain_meters ?? null,
      average_hr: extracted?.average_hr ?? null,
      max_hr: extracted?.max_hr ?? null,
      calories: extracted?.calories ?? null,
      average_pace: extracted?.average_pace_seconds_per_km ?? null,
      average_speed: duration > 0 ? distance / duration : null,
      laps: Array.isArray(extracted?.laps) ? extracted.laps : [],
      has_details: true,
      has_gps: !!screenshotUrl,
      raw_json: { source: "manual_import", url, extracted, map_screenshot_url: screenshotUrl },
    };

    const { error: upsertError } = await supabase
      .from("garmin_activities")
      .upsert(row, { onConflict: "garmin_activity_id,user_id", ignoreDuplicates: false });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(JSON.stringify({ error: `Failed to save activity: ${upsertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apple Health activities are less accurate than Garmin (no per-lap data,
    // approximate HR, no GPS). Once the user starts manually importing Garmin
    // activities we wipe their Apple Health data to avoid double-counting and
    // mixed-accuracy stats.
    let appleHealthRemoved = 0;
    const { count: ahCount } = await supabase
      .from("apple_health_activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((ahCount || 0) > 0) {
      const { error: ahDelErr } = await supabase
        .from("apple_health_activities")
        .delete()
        .eq("user_id", user.id);
      if (ahDelErr) {
        console.error("[manual-import] failed to clear Apple Health activities:", ahDelErr);
      } else {
        appleHealthRemoved = ahCount || 0;
        console.log(`[manual-import] removed ${appleHealthRemoved} Apple Health activities for user ${user.id}`);
      }
    }

    // ── Recompute training score (last 50 manual+garmin activities) ──
    const { data: recent } = await supabase
      .from("garmin_activities")
      .select("duration_seconds, distance_meters, activity_type, start_time")
      .eq("user_id", user.id)
      .order("start_time", { ascending: false })
      .limit(50);

    const vdotScores: number[] = [];
    for (const act of recent || []) {
      const st = act.activity_type || "";
      if (runningSportTypes.has(st) && (act.distance_meters || 0) >= 400 && (act.duration_seconds || 0) >= 60) {
        const vdot = calculateVdot(act.distance_meters || 0, act.duration_seconds || 0);
        if (vdot >= 5 && vdot <= 100 && isFinite(vdot)) vdotScores.push(vdot);
      }
      if (vdotScores.length >= 20) break;
    }
    const trainingScore = vdotScores.length > 0
      ? Math.round(vdotScores.reduce((a, b) => a + b, 0) / vdotScores.length)
      : 0;

    await supabase.from("profiles").update({ training_score: trainingScore }).eq("user_id", user.id);

    // ── Recompute monthly XP ──
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

    const { data: monthActs } = await supabase
      .from("garmin_activities")
      .select("distance_meters, duration_seconds")
      .eq("user_id", user.id)
      .gte("start_time", monthStart)
      .lt("start_time", monthEnd);

    let totalMonthlyXp = 0;
    for (const act of monthActs || []) {
      const km = (act.distance_meters || 0) / 1000;
      const minutes = (act.duration_seconds || 0) / 60;
      const xp = Math.round(km * 20) + Math.round(minutes * 10) + Math.round(trainingScore * 5);
      if (xp > 0) totalMonthlyXp += xp;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("monthly_xp, lifetime_xp")
      .eq("user_id", user.id)
      .single();

    let xpGained = 0;
    if (profile) {
      const oldMonthlyXp = profile.monthly_xp || 0;
      const xpDelta = totalMonthlyXp - oldMonthlyXp;
      xpGained = Math.max(0, xpDelta);
      const newLifetimeXp = Math.max(0, (profile.lifetime_xp || 0) + xpDelta);
      const rank = computeRankFromXP(totalMonthlyXp);

      await supabase.from("profiles").update({
        monthly_xp: totalMonthlyXp,
        lifetime_xp: newLifetimeXp,
        rank_tier: rank.tier,
        division: rank.division,
      }).eq("user_id", user.id);
    }

    return new Response(JSON.stringify({
      success: true,
      activity: {
        name: row.activity_name,
        distance_km: Math.round(distance / 100) / 10,
        duration_seconds: duration,
        start_time: startTime,
        laps_count: row.laps.length,
      },
      training_score: trainingScore,
      monthly_xp: totalMonthlyXp,
      xp_gained: xpGained,
      apple_health_removed: appleHealthRemoved,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("garmin-manual-import error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
