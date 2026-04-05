import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, distance, targetTime, raceDate, weeks, daysPerWeek, weeklyKm, lang } = await req.json();

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

Structure it as a JSON array of weeks. Each week has a "week" number, "startDate" (YYYY-MM-DD), and "days" array.
Each day has: "day" (Mon/Tue/Wed/Thu/Fri/Sat/Sun), "date" (YYYY-MM-DD), "type" (one of: "Easy Run", "Tempo Run", "Interval", "Long Run", "Recovery", "Rest", "Cross Training", "Race Pace", "Progression Run"), "title" (short workout name), "description" (see format rules below), "distance_km" (number or null for rest), "pace" (target pace per km as string like "5:30/km" or null for rest), "color" (hex color for the workout type: #4CAF50 for Easy, #FF9800 for Tempo, #F44336 for Interval, #2196F3 for Long Run, #9C27B0 for Recovery, #607D8B for Rest, #00BCD4 for Cross Training, #E91E63 for Race Pace, #FF5722 for Progression).

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

IMPORTANT: The runner wants to train exactly ${daysPerWeek || 4} days per week. The remaining days should be Rest days. Distribute the weekly volume of ~${weeklyKm || 30} km across the running days, building progressively over the weeks with a taper in the last 1-2 weeks.

IMPORTANT: Use a VARIETY of workout types throughout the plan. Do NOT only use Easy Run, Tempo Run, Interval, Long Run, and Rest. You MUST include Cross Training days (especially for recovery days) and Progression Run sessions (at least once every 2-3 weeks). A good plan uses ALL available workout types across the training cycle.

IMPORTANT: For each non-rest workout, calculate and include the appropriate pace per km based on the target finish time. Include specific paces for easy runs, tempo runs, intervals, long runs, etc.

The program should start from today working backward from race date. Be progressive, practical, include taper in the last 1-2 weeks. Use km for distances.

Return ONLY valid JSON, no markdown, no explanation.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let response: Response | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are an expert running coach. Return ONLY valid JSON arrays. No markdown, no code fences, no explanation. Just raw JSON.",
            },
            { role: "user", content: prompt },
          ],
        }),
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
