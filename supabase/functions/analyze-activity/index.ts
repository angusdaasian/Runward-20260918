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
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "google/gemini-2.5-pro": "gemini-2.5-pro",
};

async function callVertexAI(opts: {
  apiKey: string;
  model?: string;
  messages: Array<{ role: string; content: any }>;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  timeoutMs?: number;
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
  // Default to "low" thinking for Gemini 3 (was "medium" — too slow on large prompts, hits Supabase 150s wall-clock).
  if (model.startsWith("gemini-3")) {
    body.generationConfig = {
      ...(body.generationConfig || {}),
      thinkingConfig: { thinkingLevel: opts.thinkingLevel || "low" },
    };
  }

  // Hard timeout (Supabase wall-clock is 150s; abort well before that so we can return a clean error).
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let vRes: Response;
  try {
    vRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as any)?.name === "AbortError";
    console.error("Vertex fetch failed:", aborted ? `timeout after ${timeoutMs}ms` : (e as Error).message);
    return new Response(JSON.stringify({ error: aborted ? "Vertex AI timed out" : "Vertex AI request failed" }), { status: 504 });
  }
  clearTimeout(timer);

  if (!vRes.ok) {
    const errText = await vRes.text();
    return new Response(errText, { status: vRes.status });
  }
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
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

// Decode an encoded Google polyline (precision 5) and return the first [lat, lon].
// Returns null if the string is empty or malformed.
function firstPointFromPolyline(encoded: string | null | undefined): { lat: number; lon: number } | null {
  if (!encoded || typeof encoded !== "string") return null;
  try {
    let index = 0;
    const decodeOne = (): number => {
      let result = 0, shift = 0, b = 0;
      do {
        if (index >= encoded.length) throw new Error("polyline truncated");
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      return dlat;
    };
    const lat = decodeOne() * 1e-5;
    const lon = decodeOne() * 1e-5;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  } catch (e) {
    console.warn("firstPointFromPolyline failed:", (e as Error).message);
    return null;
  }
}

// Reverse-geocode a lat/lon to a human-readable city name via Open-Meteo.
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const r = data?.results?.[0];
    if (!r) return null;
    return `${r.name}${r.country ? ", " + r.country : ""}`;
  } catch {
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
      hrSamples, distanceSamples, elevationSamples, hrZones,
      cadenceSamples, avgCadence,
      summaryPolyline, startLat, startLon,
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

    // --- Activity-location historical weather (any activity with GPS) ---
    // If we don't already have race-day weather, try to fetch the historical
    // temperature/conditions for the spot the activity actually started at.
    if (!weatherSummary && activityDateStr) {
      let coord: { lat: number; lon: number } | null = null;
      if (typeof startLat === "number" && typeof startLon === "number" &&
          Math.abs(startLat) <= 90 && Math.abs(startLon) <= 180) {
        coord = { lat: startLat, lon: startLon };
      } else {
        coord = firstPointFromPolyline(summaryPolyline);
      }
      if (coord) {
        try {
          const w = await fetchHistoricalWeather(coord.lat, coord.lon, activityDateStr);
          if (w) {
            const summary = summarizeWeather(w);
            if (summary) {
              weatherJson = w;
              weatherSummary = summary;
              weatherLocationName = await reverseGeocode(coord.lat, coord.lon);
              weatherJson._location = weatherLocationName || `${coord.lat.toFixed(2)},${coord.lon.toFixed(2)}`;
              weatherJson._summary = summary;
            }
          }
        } catch (e) {
          console.warn("activity-location weather fetch failed:", (e as Error).message);
        }
      }
    }
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

    if (activity.total_elevation_gain != null && activity.total_elevation_gain >= 0) {
      statsText += `\n- Total Elevation Gain: ${Math.round(activity.total_elevation_gain)} m  ⚠️ AUTHORITATIVE — this is the device-reported total. Do NOT recompute elevation gain from per-second samples; sample-derived sums include GPS noise and will be inflated. Use this value when discussing elevation.`;
    }
    if (!isAppleHealth) {
      if (activity.average_heartrate) statsText += `\n- Average HR: ${Math.round(activity.average_heartrate)} bpm`;
      if (activity.max_heartrate) statsText += `\n- Max HR: ${Math.round(activity.max_heartrate)} bpm`;
    }

    // --- HR zones (%HRR / Karvonen) — distribution across the run ---
    if (hrZones && typeof hrZones === "object") {
      const z: any = hrZones;
      const fmt = (v: any) => (typeof v === "number" ? `${Math.round(v)}%` : "0%");
      statsText += `\n\n❤️ HR Zone Distribution (% of time, Karvonen %HRR):`;
      statsText += `\n  Z1 (Recovery): ${fmt(z.z1)} | Z2 (Easy/Aerobic): ${fmt(z.z2)} | Z3 (Tempo): ${fmt(z.z3)} | Z4 (Threshold): ${fmt(z.z4)} | Z5 (VO2max): ${fmt(z.z5)}`;
      statsText += `\n  → Use this distribution to characterise the workout's intensity profile (e.g., mostly Z2 = aerobic base run; heavy Z4-Z5 = quality session).`;
    }

    // --- Cadence (steps per minute) — running form indicator ---
    {
      const cadArr: Array<{ t: number; rpm: number }> = Array.isArray(cadenceSamples) ? cadenceSamples : [];
      const cadVals = cadArr.map((s) => Number(s?.rpm)).filter((v) => Number.isFinite(v) && v > 0);
      // "Running" cadence = exclude rest/walk samples (<120 spm). For intervals this is the meaningful number.
      const runVals = cadVals.filter((v) => v >= 120);
      let avgCad: number | null = typeof avgCadence === "number" && avgCadence > 0 ? avgCadence : null;
      if (avgCad == null && cadVals.length) {
        avgCad = cadVals.reduce((a, b) => a + b, 0) / cadVals.length;
      }
      const avgRunCad = runVals.length ? runVals.reduce((a, b) => a + b, 0) / runVals.length : null;
      if (avgCad != null) {
        statsText += `\n\n👣 Cadence (steps per minute):`;
        statsText += `\n  Overall average (includes any standing/rest): ${Math.round(avgCad)} spm`;
        if (avgRunCad != null && runVals.length > 30) {
          statsText += `\n  Running-only average (samples ≥120 spm, excludes rest/walk): ${Math.round(avgRunCad)} spm (${runVals.length} samples)`;
        }
        if (cadVals.length > 30) {
          const sorted = [...cadVals].sort((a, b) => a - b);
          const min = sorted[Math.floor(sorted.length * 0.05)];
          const max = sorted[Math.floor(sorted.length * 0.95)];
          statsText += `\n  5–95% range: ${Math.round(min)}–${Math.round(max)} spm (${cadVals.length} samples)`;
        }
        statsText += `\n  → IMPORTANT: For interval / fartlek / workouts with rest periods, ALWAYS judge cadence using the "Running-only average" (or the upper end of the range), NOT the overall average. The overall average is dragged down by rest/standing/walking and does NOT reflect running form. Typical recreational running cadence 160–175 spm; efficient 175–185+. Only flag low cadence / over-striding if the running-only number is genuinely low.`;
      }
    }

    const garminLapsArr = asArray<any>(garminLaps);
    if (garminLapsArr.length > 0) {
      const normAll = garminLapsArr.map((lap: any, idx: number) => {
        const distance = Number(lap.distance ?? lap.distance_meters ?? lap.total_distance_meters ?? 0) || 0;
        const elapsed = Number(
          lap.elapsed_time ?? lap.duration_seconds ?? lap.moving_time ?? lap.total_timer_time_seconds ?? 0,
        ) || 0;
        let speed = Number(lap.avg_speed ?? lap.average_speed ?? lap.avg_speed_meters_per_second ?? 0) || 0;
        if (!speed && distance > 0 && elapsed > 0) speed = distance / elapsed;
        const paceSecPerKm = speed > 0 ? 1000 / speed : Infinity;
        const number = lap.split_number ?? lap.lap_index ?? idx + 1;
        const avgHr = Number(lap.avg_hr ?? lap.average_hr ?? lap.avg_hr_bpm ?? 0) || null;
        const maxHr = Number(lap.max_hr ?? lap.max_heartrate ?? 0) || null;
        return { number, distance, elapsed, speed, paceSecPerKm, avgHr, maxHr };
      });

      // Filter GPS-noise laps (tiny dist & duration cause unrealistic paces e.g. 6m @ 2:44)
      const norm = normAll.filter((l) => !(l.distance < 50 && l.elapsed < 10));

      // Detect rest vs work using RELATIVE pace among laps (not absolute thresholds).
      const validForPace = norm.filter((l) => Number.isFinite(l.paceSecPerKm));
      const fastestPace = validForPace.length
        ? Math.min(...validForPace.map((l) => l.paceSecPerKm))
        : Infinity;
      const lapsWithType = norm.map((l) => {
        let isRest = false;
        if (Number.isFinite(l.paceSecPerKm) && Number.isFinite(fastestPace)) {
          if (l.paceSecPerKm > fastestPace * 1.4) isRest = true;
        } else if (l.speed === 0 || l.distance === 0) {
          isRest = true;
        }
        return { ...l, isRest };
      });
      const workLaps = lapsWithType.filter((l) => !l.isRest);
      const restLaps = lapsWithType.filter((l) => l.isRest);
      const hasIntervalPattern = workLaps.length >= 2 && restLaps.length >= 1
        && Number.isFinite(fastestPace)
        && Math.max(...validForPace.map((l) => l.paceSecPerKm)) > fastestPace * 1.4;

      const fmtLapPace = (paceSecPerKm: number) =>
        Number.isFinite(paceSecPerKm)
          ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.floor(paceSecPerKm % 60)).padStart(2, "0")} /km`
          : "--";

      if (hasIntervalPattern) {
        // Aggregate work-lap stats
        const workDistances = workLaps.map((l) => Math.round(l.distance));
        const workDurations = workLaps.map((l) => Math.round(l.elapsed));
        const workPaces = workLaps.filter((l) => Number.isFinite(l.paceSecPerKm)).map((l) => l.paceSecPerKm);
        const restDurations = restLaps.map((l) => Math.round(l.elapsed));
        const restDistances = restLaps.map((l) => Math.round(l.distance));
        const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
        const workHrs = workLaps.map((l) => l.avgHr).filter((x): x is number => !!x);
        const restHrs = restLaps.map((l) => l.avgHr).filter((x): x is number => !!x);

        statsText += `\n\n⚡ INTERVAL WORKOUT DETECTED — clean lap data (GPS-noise laps removed):`;
        statsText += `\n  Work reps: ${workLaps.length}  |  Recovery reps: ${restLaps.length}`;
        statsText += `\n  Work rep distance: avg ${Math.round(avg(workDistances))}m (range ${Math.min(...workDistances)}–${Math.max(...workDistances)}m)`;
        statsText += `\n  Work rep duration: avg ${Math.round(avg(workDurations))}s`;
        if (workPaces.length) statsText += `\n  Work pace: avg ${fmtLapPace(avg(workPaces))} (fastest ${fmtLapPace(Math.min(...workPaces))})`;
        if (workHrs.length) statsText += `\n  Work avg HR: ${Math.round(avg(workHrs))} bpm`;
        if (restDurations.length) statsText += `\n  Recovery duration: avg ${Math.round(avg(restDurations))}s, distance avg ${Math.round(avg(restDistances))}m`;
        if (restHrs.length) statsText += `\n  Recovery avg HR: ${Math.round(avg(restHrs))} bpm`;

        // Group consecutive WORK laps into "sets" separated by REST laps.
        // This reveals non-uniform structures like a ladder (e.g. 2000→1600→1200→800→400)
        // or mixed sets where reps inside a set may not be uniform.
        type SetGroup = { setNumber: number; workLaps: typeof lapsWithType; totalDistance: number; totalDuration: number; restAfter?: { distance: number; duration: number } };
        const sets: SetGroup[] = [];
        let currentWork: typeof lapsWithType = [];
        let setIdx = 0;
        const flushSet = (restAfter?: { distance: number; duration: number }) => {
          if (currentWork.length === 0) return;
          setIdx++;
          sets.push({
            setNumber: setIdx,
            workLaps: currentWork,
            totalDistance: currentWork.reduce((s, l) => s + l.distance, 0),
            totalDuration: currentWork.reduce((s, l) => s + l.elapsed, 0),
            restAfter,
          });
          currentWork = [];
        };
        for (const lap of lapsWithType) {
          if (lap.isRest) {
            flushSet({ distance: lap.distance, duration: lap.elapsed });
          } else {
            currentWork.push(lap);
          }
        }
        flushSet();

        statsText += `\n\n  Set structure (consecutive WORK laps grouped, separated by REST):`;
        for (const set of sets) {
          const repBreakdown = set.workLaps.map((l) => `${Math.round(l.distance)}m`).join(" + ");
          const avgPaceSet = set.workLaps.filter((l) => Number.isFinite(l.paceSecPerKm))
            .reduce((s, l, _, arr) => s + l.paceSecPerKm / arr.length, 0);
          statsText += `\n    SET ${set.setNumber}: ${set.workLaps.length} work lap(s) = ${Math.round(set.totalDistance)}m total in ${Math.round(set.totalDuration)}s (${repBreakdown}) @ ~${fmtLapPace(avgPaceSet)}`;
          if (set.restAfter) {
            statsText += `  → then REST ${Math.round(set.restAfter.distance)}m / ${Math.round(set.restAfter.duration)}s`;
          }
        }
        const totalWorkDistAllSets = sets.reduce((s, x) => s + x.totalDistance, 0);
        statsText += `\n  Total work distance across all sets: ${Math.round(totalWorkDistAllSets)}m in ${sets.length} set(s).`;

        statsText += `\n\n  Lap-by-lap (in order):`;
        for (const lap of lapsWithType) {
          const tag = lap.isRest ? "🟦 REST " : "🟥 WORK ";
          statsText += `\n    ${tag}Lap ${lap.number}: ${Math.round(lap.distance)}m / ${Math.round(lap.elapsed)}s @ ${fmtLapPace(lap.paceSecPerKm)}`;
          if (lap.avgHr) statsText += ` | HR ${Math.round(lap.avgHr)}${lap.maxHr ? `/${Math.round(lap.maxHr)}` : ""} bpm`;
        }
        statsText += `\n\n  → DEEP ANALYSIS REQUIRED:`;
        statsText += `\n    1. Use the SET STRUCTURE above (total work distance per set, separated by rest) to identify the workout — it may be a uniform set (e.g. "10×400m"), a ladder/pyramid (e.g. "2000m→1600m→1200m→800m→400m"), mixed sets, or fartlek. Do NOT assume every rep is the same distance — read the per-set totals.`;
        statsText += `\n    2. Comment on PACING CONSISTENCY across reps — are they even, fading, or progressive? Quote specific lap paces.`;
        statsText += `\n    3. Comment on HR DRIFT across reps — does HR climb on later reps at same pace (sign of fatigue/cardiac drift)?`;
        statsText += `\n    4. Assess work:rest RATIO and what energy system this targets (VO2max ~3-5min hard / equal rest, threshold ~1km cruise w/ short rest, anaerobic 200-400m w/ full recovery, etc.).`;
        statsText += `\n    5. Do NOT call this an easy/long/tempo run.`;
      } else {
        statsText += "\n\nLaps:";
        for (const lap of lapsWithType) {
          statsText += `\n  Lap ${lap.number}: ${Math.round(lap.distance)}m in ${Math.round(lap.elapsed)}s (pace: ${fmtLapPace(lap.paceSecPerKm)})`;
          if (lap.avgHr) statsText += ` | HR: ${Math.round(lap.avgHr)} bpm`;
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

    // --- Per-second sample analysis (Terra/Strava): detect interval pattern + HR vs elevation/grade ---
    try {
      const hrArr: Array<{ t: number; bpm: number }> = Array.isArray(hrSamples) ? hrSamples : [];
      const dArr: Array<{ t: number; d: number }> = Array.isArray(distanceSamples) ? distanceSamples : [];
      const eArr: Array<{ t: number; e: number }> = Array.isArray(elevationSamples) ? elevationSamples : [];
      if (hrArr.length > 30 || dArr.length > 30 || eArr.length > 30) {
        const tMap = new Map<number, { bpm?: number; d?: number; e?: number }>();
        for (const s of hrArr) tMap.set(s.t, { ...(tMap.get(s.t) || {}), bpm: s.bpm });
        for (const s of dArr) tMap.set(s.t, { ...(tMap.get(s.t) || {}), d: s.d });
        for (const s of eArr) tMap.set(s.t, { ...(tMap.get(s.t) || {}), e: s.e });
        const ordered = Array.from(tMap.entries()).sort((a, b) => a[0] - b[0]);
        const WINDOW = 30;
        const series: Array<{ t: number; bpm?: number; paceSecPerKm?: number; e?: number; gradePct?: number }> = [];
        for (let i = 0; i < ordered.length; i++) {
          const [t, v] = ordered[i];
          const item: any = { t, bpm: v.bpm, e: v.e };
          if (v.d != null) {
            let j = i;
            while (j > 0 && t - ordered[j][0] < WINDOW) j--;
            const prev = ordered[j][1].d;
            const dt = t - ordered[j][0];
            if (prev != null && dt >= 5) {
              const dd = v.d - prev;
              if (dd > 0) item.paceSecPerKm = (dt / dd) * 1000;
              // grade from elevation delta over same window
              const prevE = ordered[j][1].e;
              if (v.e != null && prevE != null && dd > 0) {
                item.gradePct = ((v.e - prevE) / dd) * 100;
              }
            }
          }
          series.push(item);
        }
        const hrVals = series.map((s) => s.bpm).filter((x): x is number => typeof x === "number");
        const paceVals = series.map((s) => s.paceSecPerKm).filter((x): x is number => typeof x === "number" && x > 120 && x < 900);
        const stddev = (arr: number[]) => {
          if (arr.length < 2) return 0;
          const m = arr.reduce((a, b) => a + b, 0) / arr.length;
          return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
        };
        const hrStd = stddev(hrVals);
        const hrMean = hrVals.length ? hrVals.reduce((a, b) => a + b, 0) / hrVals.length : 0;
        const paceStd = stddev(paceVals);
        const paceMean = paceVals.length ? paceVals.reduce((a, b) => a + b, 0) / paceVals.length : 0;
        let fastCount = 0, slowCount = 0, transitions = 0;
        if (paceVals.length > 10) {
          const sorted = [...paceVals].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          let prevState: "fast" | "slow" | null = null;
          for (const s of series) {
            if (s.paceSecPerKm == null) continue;
            const state: "fast" | "slow" = s.paceSecPerKm < median * 0.92 ? "fast" : s.paceSecPerKm > median * 1.08 ? "slow" : (prevState ?? "slow");
            if (state === "fast") fastCount++; else if (state === "slow") slowCount++;
            if (prevState && state !== prevState) transitions++;
            prevState = state;
          }
        }
        const looksIntervals = transitions >= 4 && (paceStd / Math.max(paceMean, 1)) > 0.12 && (hrStd / Math.max(hrMean, 1)) > 0.06;
        const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} /km`;
        statsText += `\n\n📈 Per-second sample analysis (${series.length}s):`;
        statsText += `\n  HR mean=${Math.round(hrMean)} bpm, stdev=${hrStd.toFixed(1)}`;
        if (paceVals.length) statsText += `\n  Pace mean=${fmtPace(paceMean)}, stdev=${paceStd.toFixed(1)}s`;
        statsText += `\n  Pace state transitions (fast↔slow): ${transitions}`;
        statsText += `\n  Time fast: ${fastCount}s | slow: ${slowCount}s`;
        if (looksIntervals) {
          statsText += `\n  ⚡ HR + pace charts oscillate sharply — this STRONGLY suggests an INTERVAL workout. Look at the splits/laps above to identify the specific interval structure (e.g., 8×400m, 5×1km, 4×800m, fartlek), recovery type (jog/walk/standing), and report this in your analysis.`;
        } else {
          statsText += `\n  Pace + HR are relatively steady — likely a continuous-effort run (easy / tempo / long), NOT intervals.`;
        }

        // --- Elevation / grade analysis (HR vs hills) ---
        const eVals = series.map((s) => s.e).filter((x): x is number => typeof x === "number");
        if (eVals.length > 20) {
          const minE = Math.min(...eVals);
          const maxE = Math.max(...eVals);
          let totalGain = 0, totalLoss = 0;
          for (let i = 1; i < eVals.length; i++) {
            const d = eVals[i] - eVals[i - 1];
            if (d > 0) totalGain += d; else totalLoss += -d;
          }
          // Bucket samples (with both HR + grade) into climb / flat / descent
          const buckets = { climb: [] as number[], flat: [] as number[], descent: [] as number[] };
          const paceBuckets = { climb: [] as number[], flat: [] as number[], descent: [] as number[] };
          for (const s of series) {
            if (s.bpm == null || s.gradePct == null) continue;
            const g = s.gradePct;
            const key = g > 2 ? "climb" : g < -2 ? "descent" : "flat";
            buckets[key].push(s.bpm);
            if (s.paceSecPerKm != null && s.paceSecPerKm > 120 && s.paceSecPerKm < 900) {
              paceBuckets[key].push(s.paceSecPerKm);
            }
          }
          const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
          statsText += `\n\n⛰️ Elevation profile (per-second):`;
          statsText += `\n  Range: ${Math.round(minE)}–${Math.round(maxE)} m (relief ${Math.round(maxE - minE)} m)`;
          statsText += `\n  Cumulative gain (sample-derived, NOISY — do NOT quote this; use the AUTHORITATIVE Total Elevation Gain above) ≈ ${Math.round(totalGain)} m / loss ≈ ${Math.round(totalLoss)} m`;
          statsText += `\n  Sample buckets — CLIMB (>+2%): ${buckets.climb.length}s | FLAT (±2%): ${buckets.flat.length}s | DESCENT (<−2%): ${buckets.descent.length}s`;
          if (buckets.climb.length > 5 || buckets.descent.length > 5) {
            statsText += `\n  Avg HR — climb: ${Math.round(mean(buckets.climb))} bpm | flat: ${Math.round(mean(buckets.flat))} bpm | descent: ${Math.round(mean(buckets.descent))} bpm`;
            if (paceBuckets.climb.length > 5 || paceBuckets.descent.length > 5) {
              statsText += `\n  Avg pace — climb: ${fmtPace(mean(paceBuckets.climb))} | flat: ${fmtPace(mean(paceBuckets.flat))} | descent: ${fmtPace(mean(paceBuckets.descent))}`;
            }
            const climbDelta = Math.round(mean(buckets.climb) - mean(buckets.flat));
            statsText += `\n  → HR was ~${climbDelta >= 0 ? "+" : ""}${climbDelta} bpm higher on climbs vs flat. Use this to explain HR spikes that line up with hills (cardiac drift on uphills is normal and not a fitness regression).`;
          } else {
            statsText += `\n  → Mostly flat course; elevation unlikely to be a major HR driver.`;
          }
        }
      }
    } catch (e) {
      console.error("sample analysis failed", e);
    }

    // --- Adjacent activities (±1h) for warmup/cooldown context ---
    let adjacentContext = "";
    try {
      const mainStart = new Date(activity.start_date);
      const mainDurSec = Number(activity.elapsed_time || activity.moving_time || 0) || 0;
      const mainEnd = new Date(mainStart.getTime() + mainDurSec * 1000);
      if (isValidDate(mainStart)) {
        const winStart = new Date(mainStart.getTime() - 60 * 60 * 1000).toISOString();
        const winEnd = new Date(mainEnd.getTime() + 60 * 60 * 1000).toISOString();

        const [stravaR, garminR, terraR, appleR] = await Promise.all([
          serviceClient.from("strava_activities")
            .select("id, name, sport_type, start_date, distance, moving_time, average_speed, average_heartrate")
            .eq("user_id", user.id).gte("start_date", winStart).lte("start_date", winEnd),
          serviceClient.from("garmin_activities")
            .select("id, activity_name, activity_type, start_time, distance_meters, duration_seconds, average_speed, average_hr")
            .eq("user_id", user.id).gte("start_time", winStart).lte("start_time", winEnd),
          serviceClient.from("terra_activities")
            .select("id, activity_name, activity_type, provider, start_time, distance_meters, duration_seconds, average_speed, average_hr")
            .eq("user_id", user.id).gte("start_time", winStart).lte("start_time", winEnd),
          serviceClient.from("apple_health_activities")
            .select("id, name, sport_type, start_date, distance, moving_time, average_speed, average_heartrate")
            .eq("user_id", user.id).gte("start_date", winStart).lte("start_date", winEnd),
        ]);

        type Adj = { start: Date; end: Date; distanceKm: number; durationSec: number; paceStr: string; hr: number | null; name: string; type: string };
        const adj: Adj[] = [];
        const push = (row: any, opts: { start: string; distM: number; durSec: number; speed: number; hr: number | null; name: string; type: string }) => {
          if (String(row.id) === String(activityDbId)) return;
          const s = new Date(opts.start);
          if (!isValidDate(s)) return;
          const e = new Date(s.getTime() + (opts.durSec || 0) * 1000);
          let sp = opts.speed;
          if ((!sp || sp <= 0) && opts.distM > 0 && opts.durSec > 0) sp = opts.distM / opts.durSec;
          const paceSec = sp > 0 ? 1000 / sp : 0;
          const paceStr = paceSec > 0
            ? `${Math.floor(paceSec / 60)}:${String(Math.floor(paceSec % 60)).padStart(2, "0")}/km`
            : "--";
          adj.push({
            start: s, end: e,
            distanceKm: (opts.distM || 0) / 1000,
            durationSec: opts.durSec || 0,
            paceStr,
            hr: opts.hr && opts.hr > 0 ? Math.round(opts.hr) : null,
            name: opts.name || "Activity",
            type: opts.type || "Run",
          });
        };
        for (const r of (stravaR.data || [])) push(r, { start: r.start_date, distM: Number(r.distance) || 0, durSec: Number(r.moving_time) || 0, speed: Number(r.average_speed) || 0, hr: r.average_heartrate ? Number(r.average_heartrate) : null, name: r.name, type: r.sport_type });
        for (const r of (garminR.data || [])) push(r, { start: r.start_time, distM: Number(r.distance_meters) || 0, durSec: Number(r.duration_seconds) || 0, speed: Number(r.average_speed) || 0, hr: r.average_hr ? Number(r.average_hr) : null, name: r.activity_name, type: r.activity_type });
        for (const r of (terraR.data || [])) push(r, { start: r.start_time, distM: Number(r.distance_meters) || 0, durSec: Number(r.duration_seconds) || 0, speed: Number(r.average_speed) || 0, hr: r.average_hr ? Number(r.average_hr) : null, name: r.activity_name, type: `${r.activity_type || "Run"}${r.provider ? ` (${r.provider})` : ""}` });
        for (const r of (appleR.data || [])) push(r, { start: r.start_date, distM: Number(r.distance) || 0, durSec: Number(r.moving_time) || 0, speed: Number(r.average_speed) || 0, hr: r.average_heartrate ? Number(r.average_heartrate) : null, name: r.name, type: r.sport_type });

        // Dedup near-duplicates across sources (within 60s start-time)
        adj.sort((a, b) => a.start.getTime() - b.start.getTime());
        const deduped: Adj[] = [];
        for (const a of adj) {
          if (deduped.some((d) => Math.abs(d.start.getTime() - a.start.getTime()) < 60_000 && Math.abs(d.distanceKm - a.distanceKm) < 0.2)) continue;
          deduped.push(a);
        }

        if (deduped.length > 0) {
          adjacentContext = `\n\n🔁 ADJACENT ACTIVITIES (logged separately within ±1h of this activity — treat them as part of the same training session, e.g. warmup or cooldown):`;
          for (const a of deduped) {
            let position: "BEFORE" | "AFTER" | "OVERLAP";
            let offsetStr: string;
            if (a.start.getTime() < mainStart.getTime()) {
              position = "BEFORE";
              const minBefore = Math.round((mainStart.getTime() - a.end.getTime()) / 60000);
              offsetStr = `${Math.max(0, minBefore)} min before main start`;
            } else if (a.start.getTime() >= mainEnd.getTime()) {
              position = "AFTER";
              const minAfter = Math.round((a.start.getTime() - mainEnd.getTime()) / 60000);
              offsetStr = `${Math.max(0, minAfter)} min after main end`;
            } else {
              position = "OVERLAP";
              offsetStr = `overlaps main activity`;
            }
            const hint = position === "BEFORE" ? " — likely warmup" : position === "AFTER" ? " — likely cooldown" : "";
            const durMin = Math.round(a.durationSec / 60);
            adjacentContext += `\n  • [${position}, ${offsetStr}] "${a.name}" ${a.type} — ${a.distanceKm.toFixed(2)} km, ${durMin} min @ ${a.paceStr}${a.hr ? `, HR ${a.hr}` : ""}${hint}`;
          }
          adjacentContext += `\n  → When evaluating warmup/cooldown adequacy and total session volume, INCLUDE these. Do NOT say the runner skipped warmup or cooldown if a BEFORE/AFTER entry plausibly served that role. You may sum distance/time across them when describing the full session.`;
        }
      }
    } catch (e) {
      console.error("adjacent activity fetch failed", e);
    }

    // --- Race + weather + comment context ---
    let raceContext = adjacentContext;
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
      const weatherLabel = resolvedRaceName ? "RACE-DAY WEATHER" : "ACTIVITY-DAY WEATHER";
      raceContext += `\n\n🌤 ${weatherLabel} (${weatherLocationName || "activity location"}, ${fallbackDateStr}): ${weatherSummary}. Factor environmental conditions (heat, humidity, wind, precipitation) into your assessment of effort, pace, and HR — e.g. hot/humid days inflate HR and slow pace at the same effort; cool dry days favor faster paces.`;
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
- **目標心率**：XXX–XXX bpm（根據今天活動的平均/最大心率與建議強度推算；若無法推算就略過此項）
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
- **Target HR**: XXX–XXX bpm (derive from today's average/max HR and the prescribed intensity; omit this line only if HR data is unavailable)
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
      if (response.status === 504) return jsonResponse({ error: "Analysis is taking too long. Please try again." }, 504);
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
