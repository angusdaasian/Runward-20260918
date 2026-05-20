import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callVertexAI(opts: { apiKey: string; model: string; messages: Array<{ role: string; content: string }> }) {
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${opts.model}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") { systemParts.push({ text: m.content }); continue; }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  const body: any = {
    contents,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 2048 },
      maxOutputTokens: 2048,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vertex error ${res.status}: ${text}`);
  const data = JSON.parse(text);
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { distance, distanceKm, raceDate, activities, lang } = await req.json();
    if (!distance) {
      return new Response(JSON.stringify({ error: "distance required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const distLabel = distance === "TR" && distanceKm ? `Trail race (${distanceKm}km)`
      : distanceKm ? `${distanceKm}km race`
      : distance === "5K" ? "5K (5km)"
      : distance === "10K" ? "10K (10km)"
      : distance === "HM" ? "Half Marathon (21.0975km)"
      : distance === "FM" ? "Full Marathon (42.195km)"
      : String(distance);

    const recentRuns = (Array.isArray(activities) ? activities : [])
      .filter((a: any) => {
        const s = String(a.sport_type || "").toLowerCase();
        return s.includes("run") || s === "treadmill" || s.includes("trail");
      })
      .slice(0, 30)
      .map((a: any) => ({
        date: a.start_date,
        km: a.distance ? +(a.distance / 1000).toFixed(2) : null,
        duration_s: a.moving_time || a.elapsed_time || null,
        avg_hr: a.average_heartrate || null,
        elev_m: a.total_elevation_gain || null,
      }))
      .filter((a: any) => a.km && a.duration_s);

    if (recentRuns.length === 0) {
      return new Response(JSON.stringify({ error: "no_recent_runs" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY not configured");

    const today = new Date().toISOString().slice(0, 10);
    const weeksToRace = raceDate
      ? Math.max(0, Math.round((new Date(raceDate).getTime() - Date.now()) / (7 * 86400000)))
      : null;

    const prompt = `You are an elite running coach and sports scientist. Predict a realistic but ambitious target finish time for the runner's upcoming ${distLabel} race.

Today: ${today}
Race date: ${raceDate || "unspecified"}
Weeks until race: ${weeksToRace ?? "unknown"}

Recent running activities (most recent first, distance in km, duration in seconds):
${JSON.stringify(recentRuns)}

Method:
1. Estimate the runner's current VDOT / fitness from their recent paces, weighting longer and harder efforts more.
2. Apply standard Daniels/Riegel scaling to the target race distance. For trail races, account for elevation using effort-adjusted pace and recent vertical gain.
3. If there are ${weeksToRace ?? 0} weeks of training remaining, assume modest fitness gain (roughly +1–3% pace improvement for 8+ weeks of consistent training, less for shorter horizons, none if <2 weeks).
4. Return a realistic target finish time the runner can train toward — not a fantasy PR, not a soft cruise.

Return STRICT JSON only, no prose, no code fences:
{"hours": <int>, "minutes": <int>, "seconds": <int>, "rationale": "<one short sentence, ${lang === "zh" ? "in Chinese" : "in English"}>"}`;

    const raw = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      model: "gemini-3.1-flash-lite-preview",
      messages: [
        { role: "system", content: "You are a precise running performance predictor. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    let parsed: any = null;
    try {
      const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    if (!parsed || typeof parsed.minutes !== "number") {
      throw new Error("Invalid AI response: " + raw.slice(0, 200));
    }

    const hours = Math.max(0, Math.min(9, parseInt(parsed.hours ?? 0, 10) || 0));
    const minutes = Math.max(0, Math.min(59, parseInt(parsed.minutes, 10) || 0));
    const seconds = Math.max(0, Math.min(59, parseInt(parsed.seconds ?? 0, 10) || 0));

    return new Response(
      JSON.stringify({ hours, minutes, seconds, rationale: parsed.rationale || "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("predict-race-time error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Failed to predict" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
