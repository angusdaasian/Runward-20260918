import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

// ── Vertex AI helper (OpenAI-compatible response shape) ──
const VERTEX_MODEL_MAP: Record<string, string> = {
  "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
  "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
  "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
  "google/gemini-3-flash-preview": "gemini-3.1-flash-lite-preview",
};

async function callVertexAI(opts: {
  apiKey: string;
  model?: string;
  messages: Array<{ role: string; content: any }>;
}): Promise<Response> {
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-3.1-flash-lite-preview").replace(/^google\//, "");
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${opts.apiKey}`;

  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") {
      const text = typeof m.content === "string" ? m.content : (m.content?.[0]?.text || "");
      systemParts.push({ text });
      continue;
    }
    const role = m.role === "assistant" ? "model" : "user";
    let parts: any[];
    if (typeof m.content === "string") {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map((p: any) => {
        if (p.type === "text") return { text: p.text };
        if (p.type === "image_url") {
          const url = p.image_url?.url || "";
          // data URL: data:image/png;base64,xxxx
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
          return { fileData: { fileUri: url, mimeType: "image/jpeg" } };
        }
        return { text: String(p) };
      });
    } else {
      parts = [{ text: String(m.content) }];
    }
    contents.push({ role, parts });
  }

  const body: any = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };

  const vRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!vRes.ok) {
    const errText = await vRes.text();
    return new Response(errText, { status: vRes.status });
  }
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  // Return OpenAI-compatible shape
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

// --- Open-Meteo helpers ---
async function geocodeCity(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const r = data?.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude, name: `${r.name}${r.country ? ", " + r.country : ""}` };
  } catch (e) {
    console.error("geocodeCity error:", e);
    return null;
  }
}

async function fetchHistoricalWeather(lat: number, lon: number, dateStr: string): Promise<any | null> {
  try {
    // Open-Meteo archive API. dateStr should be YYYY-MM-DD.
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean&timezone=auto`;
    const resp = await fetch(url);
    if (!resp.ok) {
      // Fall back to forecast API for very recent dates not yet in archive
      const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
      const fResp = await fetch(fUrl);
      if (!fResp.ok) return null;
      return await fResp.json();
    }
    return await resp.json();
  } catch (e) {
    console.error("fetchHistoricalWeather error:", e);
    return null;
  }
}

// Use Lovable AI to extract a likely city/country from a free-text race name.
// Returns "City, Country" suitable for Open-Meteo geocoding, or null.
async function extractCityFromRaceName(raceName: string, apiKey: string): Promise<string | null> {
  try {
    const resp = await callVertexAI({
      apiKey,
      model: "google/gemini-3.1-flash-lite-preview",
      messages: [
        {
          role: "system",
          content:
            "You extract the host city of a running race from its name. Reply with ONLY the city and country in the format 'City, Country' (English). If you cannot determine the city with reasonable confidence, reply with exactly 'UNKNOWN'. No other text.",
        },
        { role: "user", content: `Race name: ${raceName}` },
      ],
    });
    if (!resp.ok) {
      console.error("extractCityFromRaceName: AI error", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();
    if (!raw || /^unknown$/i.test(raw)) return null;
    // Strip surrounding quotes/markdown if any
    const cleaned = raw.replace(/^["'`*]+|["'`*]+$/g, "").trim();
    return cleaned || null;
  } catch (e) {
    console.error("extractCityFromRaceName error:", e);
    return null;
  }
}

function summarizeWeather(weather: any): string {
  if (!weather?.daily) return "";
  const d = weather.daily;
  const parts: string[] = [];
  if (d.temperature_2m_max?.[0] != null && d.temperature_2m_min?.[0] != null) {
    parts.push(`Temp ${d.temperature_2m_min[0]}°C–${d.temperature_2m_max[0]}°C`);
  }
  if (d.temperature_2m_mean?.[0] != null) parts.push(`avg ${d.temperature_2m_mean[0]}°C`);
  if (d.relative_humidity_2m_mean?.[0] != null) parts.push(`humidity ${d.relative_humidity_2m_mean[0]}%`);
  if (d.precipitation_sum?.[0] != null) parts.push(`precip ${d.precipitation_sum[0]}mm`);
  if (d.wind_speed_10m_max?.[0] != null) parts.push(`wind up to ${d.wind_speed_10m_max[0]} km/h`);
  return parts.join(", ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not configured");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY is not configured");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const {
      activity, splits, lang, translate, activityDbId, rpe, checkCacheOnly, garminLaps,
      raceId, raceName, userComment, forceRefresh,
    } = body;
    const isZh = lang === "zh";

    // --- Translation mode ---
    if (translate && activityDbId) {
      const { data: existing } = await serviceClient
        .from("activity_analyses")
        .select("*")
        .eq("activity_id", activityDbId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) return jsonResponse({ error: "No analysis found to translate" }, 404);

      const targetField = isZh ? "analysis_zh" : "analysis_en";
      const sourceField = isZh ? "analysis_en" : "analysis_zh";
      const nextTargetField = isZh ? "next_workout_zh" : "next_workout_en";
      const nextSourceField = isZh ? "next_workout_en" : "next_workout_zh";

      // If we already have both translations, just return them
      if (existing[targetField] && (existing[nextTargetField] || !existing[nextSourceField])) {
        return jsonResponse({ analysis: existing[targetField], nextWorkout: existing[nextTargetField] || null });
      }

      const sourceText = existing[sourceField];
      if (!sourceText) return jsonResponse({ error: "No source text to translate" }, 400);

      const targetLang = isZh ? "Traditional Chinese (Hong Kong)" : "English";
      const combinedSource = `===ANALYSIS===\n${sourceText}\n\n===NEXT_WORKOUT===\n${existing[nextSourceField] || ""}`;

      const tlResp = await callVertexAI({
        apiKey: VERTEX_API_KEY,
        model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          { role: "user", content: `Translate the following running coach output into ${targetLang}. Preserve the ===ANALYSIS=== and ===NEXT_WORKOUT=== separators exactly. Keep Markdown intact. Only translate, do not change content.\n\n${combinedSource}` },
        ],
      });

      if (!tlResp.ok) {
        console.error("Translation error:", tlResp.status, await tlResp.text());
        return jsonResponse({ error: "Translation failed" }, 500);
      }
      const tlData = await tlResp.json();
      const translated = tlData.choices?.[0]?.message?.content || "";
      const [tAnalysisRaw, tNextRaw] = translated.split("===NEXT_WORKOUT===");
      const tAnalysis = (tAnalysisRaw || "").replace(/^===ANALYSIS===\s*/i, "").trim();
      const tNext = (tNextRaw || "").trim();

      const updatePayload: any = { [targetField]: tAnalysis };
      if (tNext) updatePayload[nextTargetField] = tNext;
      await serviceClient.from("activity_analyses").update(updatePayload).eq("id", existing.id);

      return jsonResponse({ analysis: tAnalysis, nextWorkout: tNext || null });
    }

    // --- Analysis mode ---
    if (!activity || !activityDbId) {
      return jsonResponse({ error: "activity and activityDbId are required" }, 400);
    }

    // --- Check cache only mode ---
    if (checkCacheOnly) {
      const { data: cached } = await serviceClient
        .from("activity_analyses")
        .select("*")
        .eq("activity_id", activityDbId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cached) {
        const field = isZh ? "analysis_zh" : "analysis_en";
        const nField = isZh ? "next_workout_zh" : "next_workout_en";
        const otherField = isZh ? "analysis_en" : "analysis_zh";
        const otherNField = isZh ? "next_workout_en" : "next_workout_zh";

        if (cached[field]) {
          return jsonResponse({
            analysis: cached[field],
            nextWorkout: cached[nField] || null,
            raceId: cached.race_id || null,
            raceName: cached.race_name || null,
            userComment: cached.user_comment || null,
          });
        }

        // Requested language missing but other-lang exists → translate on demand and cache.
        if (cached[otherField]) {
          const targetLang = isZh ? "Traditional Chinese (Hong Kong)" : "English";
          const combined = `===ANALYSIS===\n${cached[otherField]}\n\n===NEXT_WORKOUT===\n${cached[otherNField] || ""}`;
          const tlResp = await callVertexAI({
            apiKey: VERTEX_API_KEY,
            model: "google/gemini-3.1-flash-lite-preview",
            messages: [{ role: "user", content: `Translate the following running coach output into ${targetLang}. Preserve the ===ANALYSIS=== and ===NEXT_WORKOUT=== separators exactly. Keep Markdown intact. Only translate, do not change content.\n\n${combined}` }],
          });
          if (tlResp.ok) {
            const tlData = await tlResp.json();
            const translated = tlData.choices?.[0]?.message?.content || "";
            const [aRaw, nRaw] = translated.split("===NEXT_WORKOUT===");
            const a = (aRaw || "").replace(/^===ANALYSIS===\s*/i, "").trim();
            const n = (nRaw || "").trim();
            const upd: any = { [field]: a };
            if (n) upd[nField] = n;
            await serviceClient.from("activity_analyses").update(upd).eq("id", cached.id);
            return jsonResponse({
              analysis: a,
              nextWorkout: n || null,
              raceId: cached.race_id || null,
              raceName: cached.race_name || null,
              userComment: cached.user_comment || null,
            });
          }
        }
      }
      return jsonResponse({ analysis: null });
    }

    // Existing analysis check (skip if forceRefresh)
    const { data: existingAnalysis } = await serviceClient
      .from("activity_analyses")
      .select("*")
      .eq("activity_id", activityDbId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingAnalysis && !forceRefresh) {
      const field = isZh ? "analysis_zh" : "analysis_en";
      const nField = isZh ? "next_workout_zh" : "next_workout_en";
      if (existingAnalysis[field]) {
        return jsonResponse({
          analysis: existingAnalysis[field],
          nextWorkout: existingAnalysis[nField] || null,
          raceId: existingAnalysis.race_id || null,
          raceName: existingAnalysis.race_name || null,
          userComment: existingAnalysis.user_comment || null,
        });
      }
      // Translate from other language
      const otherField = isZh ? "analysis_en" : "analysis_zh";
      const otherNextField = isZh ? "next_workout_en" : "next_workout_zh";
      if (existingAnalysis[otherField]) {
        const targetLang = isZh ? "Traditional Chinese (Hong Kong)" : "English";
        const combined = `===ANALYSIS===\n${existingAnalysis[otherField]}\n\n===NEXT_WORKOUT===\n${existingAnalysis[otherNextField] || ""}`;
        const tlResp = await callVertexAI({
          apiKey: VERTEX_API_KEY,
          model: "google/gemini-3.1-flash-lite-preview",
          messages: [{ role: "user", content: `Translate the following into ${targetLang}. Preserve the ===ANALYSIS=== and ===NEXT_WORKOUT=== separators. Keep Markdown.\n\n${combined}` }],
        });
        if (tlResp.ok) {
          const tlData = await tlResp.json();
          const translated = tlData.choices?.[0]?.message?.content || "";
          const [aRaw, nRaw] = translated.split("===NEXT_WORKOUT===");
          const a = (aRaw || "").replace(/^===ANALYSIS===\s*/i, "").trim();
          const n = (nRaw || "").trim();
          const upd: any = { [field]: a };
          if (n) upd[nField] = n;
          await serviceClient.from("activity_analyses").update(upd).eq("id", existingAnalysis.id);
          return jsonResponse({
            analysis: a,
            nextWorkout: n || null,
            raceId: existingAnalysis.race_id || null,
            raceName: existingAnalysis.race_name || null,
            userComment: existingAnalysis.user_comment || null,
          });
        }
      }
    }

    // --- Resolve race + weather ---
    let resolvedRaceName: string | null = raceName?.trim() || null;
    let raceCity: string | null = null;
    let raceCountry: string | null = null;
    if (raceId) {
      const { data: raceRow } = await serviceClient
        .from("races")
        .select("name, name_zh, city, country")
        .eq("id", raceId)
        .maybeSingle();
      if (raceRow) {
        resolvedRaceName = isZh && raceRow.name_zh ? raceRow.name_zh : raceRow.name;
        raceCity = raceRow.city;
        raceCountry = raceRow.country;
      }
    }

    let weatherJson: any = null;
    let weatherSummary = "";
    let weatherLocationName: string | null = null;
    const activityDateStr = typeof activity.start_date === "string" && activity.start_date
      ? activity.start_date.split("T")[0]
      : null;

    if (resolvedRaceName && activityDateStr) {
      // 1) Try geocoding by structured city,country from the races table
      let geo: { lat: number; lon: number; name: string } | null = null;
      if (raceCity) {
        geo = await geocodeCity(`${raceCity}${raceCountry ? ", " + raceCountry : ""}`);
      }
      // 2) Fall back: try geocoding the race name directly (works for races named after a city)
      if (!geo) geo = await geocodeCity(resolvedRaceName);
      // 3) Last resort: ask the AI to extract the host city from the race name, then geocode that
      if (!geo) {
        const aiCity = await extractCityFromRaceName(resolvedRaceName, VERTEX_API_KEY);
        if (aiCity) {
          console.log(`Race "${resolvedRaceName}" → AI-extracted city: "${aiCity}"`);
          geo = await geocodeCity(aiCity);
        }
      }
      if (geo) {
        weatherLocationName = geo.name;
        weatherJson = await fetchHistoricalWeather(geo.lat, geo.lon, activityDateStr);
        if (weatherJson) {
          weatherSummary = summarizeWeather(weatherJson);
          weatherJson._location = geo.name;
          weatherJson._summary = weatherSummary;
        }
      } else {
        console.log(`Could not geocode race location for: "${resolvedRaceName}"`);
      }
    }

    // --- Plan context (unchanged logic) ---
    const { data: plans } = await serviceClient
      .from("training_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const plan = plans && plans.length > 0 ? plans[0] : null;
    const activityDate = new Date(activity.start_date);
    const fallbackDateStr = activityDateStr || "Unknown";
    let planContext = "";

    if (plan) {
      const planData = asArray<any>(plan.plan_data);
      const raceDate = new Date(plan.race_date);
      const planStartSeed = asArray<any>(planData[0]?.days)[0]?.date;
      const parsedPlanStartDate = planStartSeed ? new Date(planStartSeed) : null;
      const fallbackPlanStartDate = isValidDate(raceDate) && Number.isFinite(Number(plan.weeks))
        ? new Date(raceDate.getTime() - Number(plan.weeks) * 7 * 24 * 60 * 60 * 1000)
        : null;
      const planStartDate = parsedPlanStartDate && isValidDate(parsedPlanStartDate)
        ? parsedPlanStartDate
        : fallbackPlanStartDate && isValidDate(fallbackPlanStartDate) ? fallbackPlanStartDate : null;

      if (!planStartDate || !isValidDate(activityDate)) {
        planContext = `The user is on a ${plan.distance} training plan (${plan.goal === "custom" ? "Custom" : plan.goal}).
- Target finishing time: ${plan.target_time}
- Race date: ${plan.race_date}`;
      } else if (activityDate < planStartDate) {
        planContext = `The user has an upcoming training plan:
- Race type: ${plan.distance} (${plan.goal === "custom" ? "Custom plan" : plan.goal})
- Target finishing time: ${plan.target_time}
- Plan start date: ${planStartDate.toISOString().split("T")[0]}
- Race date: ${plan.race_date}
- Plan duration: ${plan.weeks} weeks
- The plan has NOT started yet.`;
      } else {
        const diffMs = activityDate.getTime() - planStartDate.getTime();
        const weekNumber = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1);
        let plannedWorkout = "";
        const weekData = planData.find((w: any) => Number(w?.week) === weekNumber) ?? planData[weekNumber - 1];
        const dayMatch = asArray<any>(weekData?.days).find((d: any) => d?.date === fallbackDateStr);
        if (dayMatch) {
          const plannedDistance = dayMatch.distance_km ?? dayMatch.distance;
          plannedWorkout = `Planned workout for this day: ${dayMatch.workout || dayMatch.description || dayMatch.type || "Rest"}` +
            (plannedDistance ? ` (${plannedDistance} km)` : "");
        }
        planContext = `The user is on a ${plan.distance} training plan (${plan.goal === "custom" ? "Custom" : plan.goal}).
- Week ${weekNumber} of ${plan.weeks}-week plan.
- Target finishing time: ${plan.target_time}
- Race date: ${plan.race_date}
${plannedWorkout ? `- ${plannedWorkout}` : ""}`;
      }
    } else {
      planContext = "The user does not have an active training plan.";
    }

    // --- Fetch user's training_score for next-workout pace targeting ---
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("training_score")
      .eq("user_id", user.id)
      .maybeSingle();
    const trainingScore = profile?.training_score ?? null;

    // --- Build stats text ---
    const distKm = (activity.distance / 1000).toFixed(2);
    const paceSeconds = activity.average_speed > 0 ? 1000 / activity.average_speed : 0;
    const paceMin = Math.floor(paceSeconds / 60);
    const paceSec = Math.floor(paceSeconds % 60);
    const avgPace = `${paceMin}:${String(paceSec).padStart(2, "0")} /km`;

    const activitySource = activity.source || "unknown";
    const isAppleHealth = activitySource === "Apple Health";

    let statsText = `Activity: "${activity.name}"
- Source: ${activitySource}
- Date: ${fallbackDateStr}
- Total Distance: ${distKm} km
- Moving Time: ${Math.floor(activity.moving_time / 60)} min ${activity.moving_time % 60} sec
- Average Pace: ${avgPace}`;

    if (typeof rpe === "number" && rpe >= 1 && rpe <= 10) {
      statsText += `\n- RPE: ${rpe}/10`;
    }
    if (resolvedRaceName) {
      statsText += `\n- Activity Type: 🏁 RACE — ${resolvedRaceName}`;
    }

    if (!isAppleHealth) {
      if (activity.total_elevation_gain > 0) {
        statsText += `\n- Total Elevation Gain: ${Math.round(activity.total_elevation_gain)} m`;
      }
      if (activity.average_heartrate) statsText += `\n- Average HR: ${Math.round(activity.average_heartrate)} bpm`;
      if (activity.max_heartrate) statsText += `\n- Max HR: ${Math.round(activity.max_heartrate)} bpm`;
    }

    // --- Garmin laps (interval-aware) ---
    const garminLapsArr = asArray<any>(garminLaps);
    if (garminLapsArr.length > 0) {
      const lapsWithType = garminLapsArr.map((lap: any) => {
        const dist = lap.distance || 0;
        const speed = lap.avg_speed || 0;
        const isRest = dist < 200 && speed < 2;
        return { ...lap, isRest };
      });
      const workLaps = lapsWithType.filter((l: any) => !l.isRest && l.distance > 0);
      const restLaps = lapsWithType.filter((l: any) => l.isRest && l.distance >= 0);
      const hasIntervalPattern = workLaps.length >= 2 && restLaps.length >= 1;

      if (hasIntervalPattern) {
        statsText += `\n\n⚡ INTERVAL WORKOUT DETECTED (Garmin laps):`;
        statsText += `\n  Work: ${workLaps.length} | Rest: ${restLaps.length}`;
        statsText += `\n\n  Work intervals:`;
        for (const lap of workLaps) {
          const distM = Math.round(lap.distance || 0);
          const elapsed = Math.round(lap.elapsed_time || 0);
          const paceStr = lap.avg_speed > 0
            ? `${Math.floor(1000 / lap.avg_speed / 60)}:${String(Math.floor((1000 / lap.avg_speed) % 60)).padStart(2, "0")} /km`
            : "--";
          statsText += `\n    Lap ${lap.split_number}: ${distM}m in ${elapsed}s (pace: ${paceStr})`;
          if (lap.avg_hr) statsText += ` | HR: ${Math.round(lap.avg_hr)} bpm`;
        }
        if (restLaps.length > 0) {
          statsText += `\n\n  Recovery intervals:`;
          for (const lap of restLaps) {
            const distM = Math.round(lap.distance || 0);
            const elapsed = Math.round(lap.elapsed_time || 0);
            statsText += `\n    Lap ${lap.split_number}: ${distM}m in ${elapsed}s`;
          }
        }
      } else {
        statsText += "\n\nGarmin Laps:";
        for (const lap of garminLapsArr) {
          const distM = Math.round(lap.distance || 0);
          const elapsed = Math.round(lap.elapsed_time || 0);
          const paceStr = lap.avg_speed > 0
            ? `${Math.floor(1000 / lap.avg_speed / 60)}:${String(Math.floor((1000 / lap.avg_speed) % 60)).padStart(2, "0")} /km`
            : "--";
          statsText += `\n  Lap ${lap.split_number}: ${distM}m in ${elapsed}s (pace: ${paceStr})`;
          if (lap.avg_hr) statsText += ` | HR: ${Math.round(lap.avg_hr)} bpm`;
        }
      }
    } else if (splits && splits.length > 0) {
      statsText += "\n\nSplits (per km):";
      for (const s of splits) {
        const sp = s.average_speed > 0 ? 1000 / s.average_speed : 0;
        const sm = Math.floor(sp / 60);
        const ss = Math.floor(sp % 60);
        statsText += `\n  km ${s.split}: ${sm}:${String(ss).padStart(2, "0")} /km`;
        if (!isAppleHealth) {
          statsText += ` | Elev: ${s.elevation_difference > 0 ? "+" : ""}${Math.round(s.elevation_difference)}m`;
        }
      }
    }

    // --- Race + weather + comment context ---
    let raceContext = "";
    if (resolvedRaceName) {
      const hasActivePlan = !!plan;
      raceContext += `\n\n🏁🏁🏁 CRITICAL RACE CONTEXT 🏁🏁🏁
THIS ACTIVITY IS A RACE — "${resolvedRaceName}"${raceCity ? ` held in ${raceCity}${raceCountry ? ", " + raceCountry : ""}` : ""}.
This is NOT a training run. This is NOT a long run. This is a competitive race effort on race day.
You MUST:
- Open your "Overall Assessment" by explicitly naming the race ("${resolvedRaceName}") and treating the result as a race performance.
- Evaluate pacing strategy (positive/negative/even split), race-day execution, and how the effort compares to a tempo or training run.
- Use the race name when discussing the workout — never call it a "long run" or "easy run".
- For the next-workout suggestion, assume the runner just RACED — recovery is the default unless the runner's comment says otherwise.${hasActivePlan ? `
- 📋 PROGRAM ALIGNMENT — the runner is currently following an active training program (see plan context above). You MUST explicitly compare today's race performance against their program's target time / goal distance:
  • State whether the result is on-track, ahead of, or behind the program's target pace.
  • If the race distance matches the program's goal distance, treat this as a key benchmark for goal feasibility.
  • If the race is shorter than the program's goal distance, extrapolate what today's effort implies about the goal time.
  • Recommend specific adjustments to the remaining program (e.g., adjust target pace, add more threshold work, ease off long runs) based on the gap between actual and target.` : ""}`;
    }
    if (weatherSummary) {
      raceContext += `\n\n🌤 RACE-DAY WEATHER (${weatherLocationName || "race location"}, ${fallbackDateStr}): ${weatherSummary}. Factor weather conditions into your assessment of the effort and pace.`;
    }
    if (userComment && typeof userComment === "string" && userComment.trim()) {
      raceContext += `\n\n💬 RUNNER'S OWN COMMENT: "${userComment.trim()}". Use this to understand subjective effort, fatigue, mood — and weight your next-workout suggestion accordingly.`;
    }
    if (trainingScore != null) {
      raceContext += `\n\n📊 RUNNER'S TRAINING SCORE: ${trainingScore} (rough fitness indicator — higher = fitter).`;
    }

    const hasRpe = typeof rpe === "number" && rpe >= 1 && rpe <= 10;

    const systemPrompt = isZh
      ? `你是一位專業跑步教練 AI。根據訓練計劃、活動數據、天氣和跑者主觀感受，給出深入分析和明日訓練建議。回覆請用繁體中文。

格式要求：嚴格使用以下兩個區塊，並用 ===NEXT_WORKOUT=== 分隔。

===ANALYSIS===
## 總評
簡短評價（如果是比賽，要評估比賽表現；如果天氣特殊，要提到天氣的影響）

## 優點
2-3 點做得好的地方

## 需改善
2-3 點需改善的地方

## 建議
1-2 點針對這次訓練/比賽的具體建議

===NEXT_WORKOUT===
## 明日建議訓練
根據今天的表現、跑者的主觀感受、訓練分數和（如有）比賽強度，給出非常具體的下一次訓練建議：
- **類型**：（恢復跑 / 輕鬆有氧 / 節奏跑 / 間歇 / 休息）
- **距離**：X 公里
- **配速**：X:XX /km
- **時長**：約 X 分鐘
- **理由**：簡短說明為什麼這樣安排（1-2 句）

如果跑者今天比賽很辛苦或抱怨疲累，建議休息或非常輕鬆的恢復跑。如果是輕鬆訓練，可以建議稍強的訓練。`
      : `You are a professional running coach AI. Based on the training plan, activity data, weather, and the runner's own comment, provide an in-depth analysis AND a concrete next-workout recommendation.

FORMAT — strictly use two sections separated by ===NEXT_WORKOUT===:

===ANALYSIS===
## Overall Assessment
Brief evaluation. If it was a race, assess race performance. If weather was notable, mention its impact.

## Strengths
2-3 things that went well

## Areas to Improve
2-3 things to improve

## Recommendations
1-2 specific recommendations for this workout/race

===NEXT_WORKOUT===
## Suggested Next Workout
Based on today's performance, the runner's subjective feel, training score, and (if applicable) race intensity, give a very concrete next-workout recommendation:
- **Type**: (Recovery run / Easy aerobic / Tempo / Intervals / Rest)
- **Distance**: X km
- **Pace**: X:XX /km
- **Duration**: ~X minutes
- **Why**: brief reasoning (1-2 sentences)

If the runner raced hard today or said they struggled, suggest rest or a very easy recovery run. If today was easy, you can suggest a harder session.${hasRpe ? " Use RPE to gauge today's intensity." : ""}`;

    const userMessage = `${planContext}${raceContext}\n\n--- Activity Data ---\n${statsText}`;

    const response = await callVertexAI({
      apiKey: VERTEX_API_KEY,
      model: "google/gemini-3.1-flash-lite-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResponse({ error: "Rate limited, please try again later." }, 429);
      if (response.status === 402) return jsonResponse({ error: "Payment required." }, 402);
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return jsonResponse({ error: "AI gateway error" }, 500);
    }

    const data = await response.json();
    const fullText = data.choices?.[0]?.message?.content || "";
    const [analysisRaw, nextRaw] = fullText.split("===NEXT_WORKOUT===");
    const analysisText = (analysisRaw || "").replace(/^===ANALYSIS===\s*/i, "").trim();
    const nextWorkoutText = (nextRaw || "").trim();

    // Save to DB
    const upsertData: any = {
      user_id: user.id,
      activity_id: activityDbId,
      race_id: raceId || null,
      race_name: resolvedRaceName,
      user_comment: userComment?.trim() || null,
      weather: weatherJson,
    };
    if (isZh) {
      upsertData.analysis_zh = analysisText;
      if (nextWorkoutText) upsertData.next_workout_zh = nextWorkoutText;
    } else {
      upsertData.analysis_en = analysisText;
      if (nextWorkoutText) upsertData.next_workout_en = nextWorkoutText;
    }

    const { error: upsertError } = await serviceClient
      .from("activity_analyses")
      .upsert(upsertData, { onConflict: "activity_id" });
    if (upsertError) console.error("activity_analyses upsert error:", upsertError);

    return jsonResponse({
      analysis: analysisText,
      nextWorkout: nextWorkoutText || null,
      raceName: resolvedRaceName,
      raceId: raceId || null,
      userComment: userComment?.trim() || null,
      weatherSummary: weatherSummary || null,
    });
  } catch (e) {
    console.error("analyze-activity error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
