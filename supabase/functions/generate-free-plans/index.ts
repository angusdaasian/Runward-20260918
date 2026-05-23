import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_PLANS = [
  { distance: "5K", target_time: "25:00", days_per_week: 3, weekly_km_min: 20, weekly_km_max: 30, weeks: 10 },
  { distance: "5K", target_time: "30:00", days_per_week: 3, weekly_km_min: 15, weekly_km_max: 25, weeks: 10 },
  { distance: "5K", target_time: "35:00", days_per_week: 3, weekly_km_min: 15, weekly_km_max: 20, weeks: 10 },
  { distance: "10K", target_time: "50:00", days_per_week: 4, weekly_km_min: 30, weekly_km_max: 40, weeks: 12 },
  { distance: "10K", target_time: "55:00", days_per_week: 3, weekly_km_min: 25, weekly_km_max: 40, weeks: 12 },
  { distance: "10K", target_time: "60:00", days_per_week: 3, weekly_km_min: 20, weekly_km_max: 30, weeks: 12 },
  { distance: "10K", target_time: "70:00", days_per_week: 3, weekly_km_min: 15, weekly_km_max: 25, weeks: 12 },
  { distance: "HM", target_time: "1:50:00", days_per_week: 4, weekly_km_min: 35, weekly_km_max: 55, weeks: 14 },
  { distance: "HM", target_time: "1:55:00", days_per_week: 4, weekly_km_min: 30, weekly_km_max: 50, weeks: 14 },
  { distance: "HM", target_time: "2:00:00", days_per_week: 3, weekly_km_min: 25, weekly_km_max: 45, weeks: 14 },
  { distance: "HM", target_time: "2:30:00", days_per_week: 3, weekly_km_min: 25, weekly_km_max: 35, weeks: 14 },
  { distance: "FM", target_time: "3:45:00", days_per_week: 5, weekly_km_min: 55, weekly_km_max: 60, weeks: 16 },
  { distance: "FM", target_time: "3:50:00", days_per_week: 5, weekly_km_min: 50, weekly_km_max: 55, weeks: 16 },
  { distance: "FM", target_time: "3:55:00", days_per_week: 4, weekly_km_min: 45, weekly_km_max: 55, weeks: 16 },
  { distance: "FM", target_time: "4:00:00", days_per_week: 4, weekly_km_min: 45, weekly_km_max: 50, weeks: 16 },
  { distance: "FM", target_time: "4:30:00", days_per_week: 4, weekly_km_min: 40, weekly_km_max: 45, weeks: 16 },
];

async function callVertexAI(opts: { apiKey: string; model?: string; messages: Array<{ role: string; content: any }> }): Promise<Response> {
  const VERTEX_MODEL_MAP: Record<string, string> = {
    "google/gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
    "google/gemini-3.1-flash-preview": "gemini-3.1-flash-preview",
    "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
  };
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-3.1-pro-preview").replace(/^google\//, "");
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") { systemParts.push({ text: typeof m.content === "string" ? m.content : "" }); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: typeof m.content === "string" ? m.content : String(m.content) }] });
  }
  const body: any = {
    contents,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 4096 },
      maxOutputTokens: 16384,
      temperature: 0.7,
    },
  };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const vRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!vRes.ok) return new Response(await vRes.text(), { status: vRes.status });
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authenticated admin user
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const sbAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: claimsData, error: claimsErr } = await sbAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;
    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await sbAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check which plans already exist
    const { data: existing } = await supabase.from("free_training_plans").select("distance, target_time");
    const existingKeys = new Set((existing || []).map((e: any) => `${e.distance}_${e.target_time}`));

    const toGenerate = FREE_PLANS.filter(p => !existingKeys.has(`${p.distance}_${p.target_time}`));

    if (toGenerate.length === 0) {
      return new Response(JSON.stringify({ message: "All free plans already generated", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: string[] = [];

    for (const planDef of toGenerate) {
      const distanceFull =
        planDef.distance === "10K" ? "10K" :
        planDef.distance === "HM" ? "Half Marathon" :
        planDef.distance === "FM" ? "Full Marathon" : planDef.distance;

      const prompt = `Create a ${planDef.weeks}-week running training program.
Goal: race
Race: ${distanceFull}
Target time: ${planDef.target_time}
Running days per week: ${planDef.days_per_week}
Preferred weekly volume: approximately ${planDef.weekly_km_min}-${planDef.weekly_km_max} km per week (adjust progressively)

All "title" and "description" fields should be in English. The "type" and "day" fields should remain in English.

Structure it as a JSON array of weeks. Each week has a "week" number and "days" array.
Each day has: "day" (Mon/Tue/Wed/Thu/Fri/Sat/Sun), "type" (one of: "Easy Run", "Tempo Run", "Interval", "Long Run", "Recovery", "Rest", "Cross Training", "Race Pace", "Progression Run", "Trail Run", "Trail Race"), "title" (short workout name), "description" (see format rules below), "distance_km" (number or null for rest), "pace" (target pace per km as string like "5:30/km" or null for rest/trail), "color" (hex color: #4CAF50 for Easy, #FF9800 for Tempo, #F44336 for Interval, #2196F3 for Long Run, #9C27B0 for Recovery, #607D8B for Rest, #00BCD4 for Cross Training, #E91E63 for Race Pace, #FF5722 for Progression, #84CC16 for Trail Run, #65A30D for Trail Race). For "Trail Run" and "Trail Race" days ALSO include numeric fields "elevation_m" (total ascent in meters) and "eph" (target Effort per Hour, where EpH = distance_km + elevation_m/100 per hour). For all other types set "elevation_m" and "eph" to null.

WORKOUT TYPE DESCRIPTIONS (include a brief note of the type purpose in description):
- Easy Run: Comfortable conversational pace to build aerobic base.
- Tempo Run: Sustained comfortably hard effort at lactate threshold pace for 20-40 min.
- Interval: High-intensity repeats to develop VO2max. DESCRIPTION FORMAT MUST be sets-based, e.g. "400m x 10 at 4:15/km, rest 1:30 between sets" or "800m x 6 at 4:00/km, rest 2:00 between sets". Always specify the rep distance, number of reps, target pace, and rest duration.
- Long Run: Extended distance at easy-to-moderate pace for endurance.
- Recovery: Very easy short run for active recovery.
- Cross Training: Non-running cardio (cycling, swimming, etc.) for active recovery.
- Race Pace: Running at your target race pace to build race-day confidence.
- Progression Run: Start easy and gradually increase pace through the run, finishing at tempo or race pace.
- Rest: Full rest day for recovery.

IMPORTANT: Exactly ${planDef.days_per_week} running days per week. Remaining days are Rest. Distribute ~${planDef.weekly_km_min}-${planDef.weekly_km_max} km across running days, building progressively with taper in the last 1-2 weeks.

For each non-rest workout, include appropriate pace per km based on the target finish time.

Return ONLY valid JSON, no markdown, no explanation.`;

      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await callVertexAI({
          apiKey: VERTEX_API_KEY,
          model: "google/gemini-3.1-flash-lite-preview",
          messages: [
            { role: "system", content: "You are an expert running coach. Return ONLY valid JSON arrays. No markdown, no code fences, no explanation." },
            { role: "user", content: prompt },
          ],
        });
        if (response.ok || (response.status !== 502 && response.status !== 503)) break;
        console.warn(`Retry ${attempt + 1} for ${planDef.distance} ${planDef.target_time}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }

      if (!response || !response.ok) {
        console.error(`Failed to generate ${planDef.distance} ${planDef.target_time}: ${response?.status}`);
        results.push(`FAILED: ${planDef.distance} ${planDef.target_time}`);
        continue;
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || "[]";
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      let planData;
      try { planData = JSON.parse(content); } catch { planData = []; }

      const { error } = await supabase.from("free_training_plans").upsert({
        distance: planDef.distance,
        target_time: planDef.target_time,
        days_per_week: planDef.days_per_week,
        weekly_km_min: planDef.weekly_km_min,
        weekly_km_max: planDef.weekly_km_max,
        weeks: planDef.weeks,
        plan_data: planData,
      }, { onConflict: "distance,target_time" });

      if (error) {
        console.error(`DB error for ${planDef.distance} ${planDef.target_time}:`, error);
        results.push(`DB_ERROR: ${planDef.distance} ${planDef.target_time}`);
      } else {
        results.push(`OK: ${planDef.distance} ${planDef.target_time}`);
      }

      // Small delay between generations to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(JSON.stringify({ message: "Generation complete", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-free-plans error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
