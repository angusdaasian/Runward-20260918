import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Vertex AI helper ──
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
      // Medium thinking budget to keep latency under edge function CPU limit
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

  try {
    const { goal, distance, targetTime, raceDate, startDate, weeks, daysPerWeek, weeklyKm, longRunDay, restDays, raceName, raceCity, raceCountry, lang } = await req.json();

    const isZh = lang === "zh";
    const distanceFull =
      distance === "10K" ? "10K" : distance === "HM" ? (isZh ? "半馬拉松" : "Half Marathon") : (isZh ? "全馬拉松" : "Full Marathon");

    const langInstruction = isZh
      ? `All "title" and "description" fields MUST be written in Traditional Chinese (繁體中文, Hong Kong variant). The "type" and "day" fields should remain in English.`
      : `All "title" and "description" fields should be in English.`;

    const prompt = `Create a ${weeks}-week running training program.
Goal: ${goal}
Race: ${distanceFull}
Target time: ${targetTime}
Race date: ${raceDate}
Running days per week: ${daysPerWeek || 4}
Preferred weekly volume: approximately ${weeklyKm || 30} km per week (adjust progressively)

${langInstruction}

Structure it as a JSON array of weeks. Each week has a "week" number and "days" array (exactly 7 days per week, ordered Monday → Sunday). DO NOT include "date" or "startDate" fields — the system assigns calendar dates after generation. Just give 7 ordered day entries per week.
Each day has: "day" (Mon/Tue/Wed/Thu/Fri/Sat/Sun, in order), "type" (one of: "Easy Run", "Tempo Run", "Interval", "Long Run", "Recovery", "Rest", "Cross Training", "Race Pace", "Progression Run"), "title" (short workout name), "description" (see format rules below), "distance_km" (number or null for rest), "pace" (target pace per km as string like "5:30/km" or null for rest), "color" (hex color for the workout type: #4CAF50 for Easy, #FF9800 for Tempo, #F44336 for Interval, #2196F3 for Long Run, #9C27B0 for Recovery, #607D8B for Rest, #00BCD4 for Cross Training, #E91E63 for Race Pace, #FF5722 for Progression).

WORKOUT TYPE DESCRIPTIONS (include a brief note of the type purpose in description):
- Easy Run: Comfortable conversational pace to build aerobic base.
- Tempo Run: Sustained comfortably hard effort at lactate threshold pace for 20-40 min.
- Interval: High-intensity repeats to develop VO2max. CRITICAL: The description field for ALL Interval workouts MUST follow EXACTLY this pattern: "{distance} x {reps} at {pace}/km, rest {duration} between sets". Examples: "800m x 6 at 4:00/km, rest 2:00 between sets", "400m x 10 at 4:15/km, rest 1:30 between sets", "1000m x 5 at 3:50/km, rest 2:30 between sets". Do NOT write paragraph-style or sentence-style descriptions for Interval workouts. ONLY the set notation format is acceptable.
- Long Run: Extended distance at easy-to-moderate pace for endurance.
- Recovery: Very easy short run for active recovery.
- Cross Training: Non-running cardio (cycling, swimming, etc.) for active recovery.
- Race Pace: Running at your target race pace to build race-day confidence.
- Progression Run: Start easy and gradually increase pace through the run, finishing at tempo or race pace.
- Rest: Full rest day for recovery.

IMPORTANT: The runner wants to train exactly ${daysPerWeek || 4} days per week. The remaining days should be Rest days. Distribute the weekly volume of ~${weeklyKm || 30} km across the running days, building progressively over the weeks with a taper in the last 1-2 weeks.

CRITICAL SCHEDULING CONSTRAINTS (apply to EVERY week of the plan):
- The runner's preferred LONG RUN day is "${longRunDay || "Sun"}". Schedule the "Long Run" workout on this day every week (except optional taper/race week adjustments).
- The runner's preferred REST day(s) are: ${Array.isArray(restDays) && restDays.length ? restDays.map((d: string) => `"${d}"`).join(", ") : '"Mon"'}. These days MUST be "Rest" type every week.
- Place quality sessions (Tempo, Interval, Progression, Race Pace) on non-rest days, ideally with at least one easy/recovery day between hard efforts and before the long run.

IMPORTANT: Use a VARIETY of workout types throughout the plan. Do NOT only use Easy Run, Tempo Run, Interval, Long Run, and Rest. You MUST include Cross Training days (especially for recovery days) and Progression Run sessions (at least once every 2-3 weeks). A good plan uses ALL available workout types across the training cycle.

IMPORTANT: For each non-rest workout, calculate and include the appropriate pace per km based on the target finish time. Include specific paces for easy runs, tempo runs, intervals, long runs, etc.

The program will start on ${startDate || "today"} (week 1, day 1 = Monday of that week's training cycle) and end on/around the race date ${raceDate}. Be progressive, practical, include taper in the last 1-2 weeks. Use km for distances.

Return ONLY valid JSON, no markdown, no explanation.`;

    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY not configured");

    let response: Response | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        response = await callVertexAI({
          apiKey: VERTEX_API_KEY,
          model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert running coach. Return ONLY valid JSON arrays. No markdown, no code fences, no explanation. Just raw JSON.",
          },
          { role: "user", content: prompt },
        ],
      });

      if (response.ok || (response.status !== 502 && response.status !== 503)) break;

      console.warn(`AI gateway returned ${response.status}, retrying (${attempt + 1}/${maxRetries})...`);
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (!response || !response.ok) {
      const errText = await response?.text() || "No response";
      console.error("AI gateway error:", response?.status, errText);

      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response?.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${response?.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "[]";

    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Validate JSON
    let planData;
    try {
      planData = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response as JSON:", content.substring(0, 500));
      planData = [];
    }

    // Post-process: validate interval descriptions follow set format
    const intervalPattern = /^\d+m?\s*x\s*\d+/i;
    if (Array.isArray(planData)) {
      for (const week of planData) {
        if (week?.days && Array.isArray(week.days)) {
          for (const day of week.days) {
            if (day.type === "Interval" && day.description && !intervalPattern.test(day.description.trim())) {
              // Try to extract numbers from the description and reformat
              const distMatch = day.description.match(/(\d+)\s*m/i);
              const repMatch = day.description.match(/x\s*(\d+)|(\d+)\s*(reps|repeats|sets)/i);
              const paceMatch = day.description.match(/(\d+:\d+)\/km/);
              const restMatch = day.description.match(/rest\s*(\d+:\d+|\d+\s*min)/i);
              if (distMatch && repMatch) {
                const dist = distMatch[1];
                const reps = repMatch[1] || repMatch[2];
                const pace = paceMatch ? ` at ${paceMatch[1]}/km` : (day.pace ? ` at ${day.pace}` : "");
                const rest = restMatch ? `, rest ${restMatch[1]} between sets` : "";
                day.description = `${dist}m x ${reps}${pace}${rest}`;
              }
            }
          }
        }
      }
    }

    // Post-process: assign deterministic dates from startDate so calendar and plan view always match.
    // Week 1 starts on the user's chosen startDate; each week is exactly 7 days, days[0]..days[6].
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const baseStr = (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate))
      ? startDate
      : new Date().toISOString().slice(0, 10);
    const base = new Date(baseStr + "T00:00:00Z");
    if (Array.isArray(planData) && !isNaN(base.getTime())) {
      for (let w = 0; w < planData.length; w++) {
        const week = planData[w];
        if (!week || !Array.isArray(week.days)) continue;
        // Pad/truncate to 7 days defensively
        while (week.days.length < 7) {
          week.days.push({ day: DAY_LABELS[week.days.length], type: "Rest", title: "Rest", description: "", distance_km: null, pace: null, color: "#607D8B" });
        }
        if (week.days.length > 7) week.days.length = 7;
        for (let d = 0; d < 7; d++) {
          const dt = new Date(base.getTime() + ((w * 7 + d) * 86400000));
          const yyyy = dt.getUTCFullYear();
          const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(dt.getUTCDate()).padStart(2, "0");
          week.days[d].date = `${yyyy}-${mm}-${dd}`;
          week.days[d].day = DAY_LABELS[(dt.getUTCDay() + 6) % 7]; // 0=Sun → Sun, shift to Mon=0
        }
        week.startDate = week.days[0].date;
        week.week = w + 1;
      }
    }

    return new Response(JSON.stringify({ plan: planData, raw: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-program error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
