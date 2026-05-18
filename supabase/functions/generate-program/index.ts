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
    const { goal, distance, targetTime, raceDate, startDate, weeks, daysPerWeek, weeklyKm, longRunDay, restDays, raceName, raceCity, raceCountry, lang, races, trailDistanceKm, trailElevationM } = await req.json();

    // Normalise race schedule. Expect [{name, race_date, category, priority}]
    const raceList: Array<{ name: string; race_date: string; category?: string; priority?: string }> =
      Array.isArray(races) ? races.filter((r: any) => r && r.race_date && r.name) : [];
    raceList.sort((a, b) => a.race_date.localeCompare(b.race_date));
    const distanceForCategory = (category?: string): number | null => {
      const c = String(category || "").trim().toUpperCase();
      if (c === "5K") return 5;
      if (c === "10K") return 10;
      if (["HM", "HALF", "HALF MARATHON"].includes(c)) return 21.1;
      if (["FM", "FULL", "FULL MARATHON", "MARATHON"].includes(c)) return 42.2;
      return null;
    };
    const raceScheduleBlock = raceList.length
      ? `\nRACE SCHEDULE (the runner has these races on the calendar — adapt the plan accordingly):\n${raceList
          .map(
            (r) =>
              `- ${r.race_date} · ${r.name}${r.category ? ` (${r.category})` : ""} — priority ${r.priority || "none"}`,
          )
          .join("\n")}\n\nRACE-AWARE RULES:\n- The "A" priority race is the GOAL race; structure the entire plan to peak for it (use Race Date above).\n- For each "B" race: insert a short mini-taper (1 reduced volume week before, with the 2 days post-race kept easy/recovery). Replace the race day workout with a "Race" type entry titled with the race name and distance from its category.\n- For each "C" race: treat as a hard training run / tune-up. Schedule it as a "Race" type entry on the day; the day after must be Recovery or Rest. No special week-level taper.\n- The +10% weekly mileage rule may be temporarily relaxed during a race week's deload (volume can drop more than 10%). It still applies to all build weeks.\n- For every race in the schedule, the day entry on the race date MUST have type "Race", title equal to the race name, distance_km equal to the race category distance (5K=5, 10K=10, HM=21.1, FM=42.2), color "#E91E63", and a description noting it's a priority ${"{A|B|C}"} race. Race dates override the normal long-run/rest-day preference.\n`
      : "";

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
${raceName ? `Target race event: "${raceName}"${raceCity ? ` in ${raceCity}${raceCountry ? `, ${raceCountry}` : ""}` : ""}. Tailor the plan to this specific race — consider its typical course profile (hills, flat, elevation), climate/weather for the race date, and any well-known characteristics of this event when shaping long runs, race-pace sessions, and the taper. Briefly mention the race-specific rationale in the description of key workouts (e.g. hill sessions if the course is hilly, heat acclimation if the race is in a hot climate).` : ""}
Running days per week: ${daysPerWeek || 4}
Preferred weekly volume: approximately ${weeklyKm || 30} km per week (adjust progressively)

${langInstruction}
${raceScheduleBlock}

Structure it as a JSON array of weeks. Each week has a "week" number and "days" array (exactly 7 days per week, ordered Monday → Sunday). DO NOT include "date" or "startDate" fields — the system assigns calendar dates after generation. Just give 7 ordered day entries per week.
Each day has: "day" (Mon/Tue/Wed/Thu/Fri/Sat/Sun, in order), "type" (one of: "Easy Run", "Tempo Run", "Interval", "Long Run", "Recovery", "Rest", "Cross Training", "Race Pace", "Progression Run", "Trail Run", "Trail Race", "Race"), "title" (short workout name), "description" (see format rules below), "distance_km" (number or null for rest), "pace" (target pace per km as string like "5:30/km" or null for rest/trail), "color" (hex color for the workout type: #4CAF50 for Easy, #FF9800 for Tempo, #F44336 for Interval, #2196F3 for Long Run, #9C27B0 for Recovery, #607D8B for Rest, #00BCD4 for Cross Training, #E91E63 for Race Pace, #FF5722 for Progression, #84CC16 for Trail Run, #65A30D for Trail Race, #E91E63 for Race). For "Trail Run" and "Trail Race" days ALSO include numeric fields "elevation_m" (total ascent in meters) and "eph" (target Effort per Hour, where EpH = distance_km + elevation_m/100 per hour). For all other types, set "elevation_m" and "eph" to null.

WORKOUT TYPE DESCRIPTIONS (include a brief note of the type purpose in description):
- Easy Run: Comfortable conversational pace to build aerobic base.
- Tempo Run: Sustained comfortably hard effort at lactate threshold pace for 20-40 min.
- Interval: High-intensity repeats to develop VO2max. CRITICAL: The description field for ALL Interval workouts MUST follow EXACTLY this pattern: "{distance} x {reps} at {pace}/km, rest {duration} between sets". Examples: "800m x 6 at 4:00/km, rest 2:00 between sets", "400m x 10 at 4:15/km, rest 1:30 between sets", "1000m x 5 at 3:50/km, rest 2:30 between sets". Do NOT write paragraph-style or sentence-style descriptions for Interval workouts. ONLY the set notation format is acceptable.
- Long Run: Extended distance at easy-to-moderate pace for endurance.
- Recovery: Very easy short run for active recovery.
- Cross Training: Non-running cardio (cycling, swimming, etc.) for active recovery.
- Race Pace: Running at your target race pace to build race-day confidence.
- Progression Run: Start easy and gradually increase pace through the run, finishing at tempo or race pace.
- Trail Run: Off-road run with elevation. Effort is guided by EpH instead of flat pace. Specify distance_km, elevation_m, and a target eph.
- Trail Race: Trail race effort. Specify distance_km, elevation_m, and target eph for the race effort.
- Rest: Full rest day for recovery.

IMPORTANT: The runner wants to train exactly ${daysPerWeek || 4} days per week. The remaining days should be Rest days. Distribute the weekly volume across the running days.

WEEKLY MILEAGE PROGRESSION RULES (MUST follow strictly):
- Peak weekly volume target: approximately ${weeklyKm || 30} km (reach this near the end of the build phase, before the taper).
- 10% rule: weekly mileage MUST NOT increase by more than 10% from the previous week. Calculate week N km ≤ 1.10 × week (N-1) km. This is a safety/injury-prevention hard constraint.
- 3:1 build/taper cycle: structure training in repeating 4-week blocks of 3 build weeks followed by 1 recovery/down week. In each block: weeks 1, 2, 3 progressively increase mileage (each ≤ +10%), and week 4 is a recovery week reduced by ~20-30% from week 3 to allow adaptation.
- Final taper: the last 2 weeks before race date are a dedicated taper. Week (N-1) ≈ 70-80% of peak; race week ≈ 40-50% of peak with the race itself on race day.
- Start the program at a sensible base (e.g. ~50-60% of target peak km) so the 10% rule can be respected across all weeks.
- Verify your generated plan: for every consecutive non-recovery week pair, (next_week_km / prev_week_km) ≤ 1.10. If a week would violate this, reduce its volume.

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

      const daysFlat = planData.flatMap((week: any) => Array.isArray(week?.days) ? week.days : []);
      for (let i = 0; i < daysFlat.length; i++) {
        const race = raceList.find((r) => r.race_date === daysFlat[i]?.date);
        if (!race) continue;
        const priority = ["A", "B", "C"].includes(String(race.priority)) ? String(race.priority) : "none";
        daysFlat[i] = Object.assign(daysFlat[i], {
          type: "Race",
          title: race.name,
          description: isZh
            ? `${race.name}（${priority === "none" ? "未設定" : priority} 優先級）。此日按賽事行程安排為比賽。`
            : `${race.name} (${priority === "none" ? "unprioritized" : `${priority}-priority`} race). Scheduled from the runner's race calendar.`,
          distance_km: distanceForCategory(race.category),
          color: "#E91E63",
        });
        if (daysFlat[i + 1] && !["Rest", "Recovery"].includes(daysFlat[i + 1].type)) {
          daysFlat[i + 1] = Object.assign(daysFlat[i + 1], {
            type: "Recovery",
            title: isZh ? "賽後恢復" : "Post-race Recovery",
            description: isZh ? "非常輕鬆的賽後恢復跑。" : "Very easy post-race recovery run.",
            color: "#9C27B0",
          });
        }
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
