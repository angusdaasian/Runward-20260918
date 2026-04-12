import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not configured");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(accessToken);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { activity, splits, lang, translate, activityDbId } = body;
    const isZh = lang === "zh";

    // --- Translation mode ---
    if (translate && activityDbId) {
      // Fetch existing analysis
      const { data: existing, error: existingError } = await serviceClient
        .from("activity_analyses")
        .select("*")
        .eq("activity_id", activityDbId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) {
        console.error("activity_analyses translate fetch error:", existingError);
      }

      if (!existing) {
        return jsonResponse({ error: "No analysis found to translate" }, 404);
      }

      const targetField = isZh ? "analysis_zh" : "analysis_en";
      const sourceField = isZh ? "analysis_en" : "analysis_zh";

      // Already have this translation
      if (existing[targetField]) {
        return jsonResponse({ analysis: existing[targetField] });
      }

      const sourceText = existing[sourceField];
      if (!sourceText) {
        return jsonResponse({ error: "No source text to translate" }, 400);
      }

      const targetLang = isZh ? "Traditional Chinese (Hong Kong)" : "English";
      const tlResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "user", content: `Translate the following running workout analysis into ${targetLang}. Keep the Markdown formatting intact. Only translate, do not change the content.\n\n${sourceText}` },
          ],
        }),
      });

      if (!tlResp.ok) {
        console.error("Translation error:", tlResp.status, await tlResp.text());
        return jsonResponse({ error: "Translation failed" }, 500);
      }

      const tlData = await tlResp.json();
      const translated = tlData.choices?.[0]?.message?.content || "";

      // Save translation
      await serviceClient
        .from("activity_analyses")
        .update({ [targetField]: translated })
        .eq("id", existing.id);

      return jsonResponse({ analysis: translated });
    }

    // --- Analysis mode ---
    if (!activity || !activityDbId) {
      return jsonResponse({ error: "activity and activityDbId are required" }, 400);
    }

    // Check if analysis already exists
    const { data: existingAnalysis, error: existingAnalysisError } = await serviceClient
      .from("activity_analyses")
      .select("*")
      .eq("activity_id", activityDbId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingAnalysisError) {
      console.error("activity_analyses fetch error:", existingAnalysisError);
    }

    if (existingAnalysis) {
      const field = isZh ? "analysis_zh" : "analysis_en";
      if (existingAnalysis[field]) {
        return jsonResponse({ analysis: existingAnalysis[field] });
      }
      // Has analysis in other language, trigger translation
      const otherField = isZh ? "analysis_en" : "analysis_zh";
      if (existingAnalysis[otherField]) {
        // Translate inline
        const targetLang = isZh ? "Traditional Chinese (Hong Kong)" : "English";
        const tlResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "user", content: `Translate the following running workout analysis into ${targetLang}. Keep the Markdown formatting intact.\n\n${existingAnalysis[otherField]}` },
            ],
          }),
        });
        if (tlResp.ok) {
          const tlData = await tlResp.json();
          const translated = tlData.choices?.[0]?.message?.content || "";
          await serviceClient.from("activity_analyses").update({ [field]: translated }).eq("id", existingAnalysis.id);
          return jsonResponse({ analysis: translated });
        }
      }
    }

    // Fetch user's active training plan
    const { data: plans, error: plansError } = await serviceClient
      .from("training_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (plansError) {
      console.error("training_plans fetch error:", plansError);
    }

    const plan = plans && plans.length > 0 ? plans[0] : null;

    const activityDate = new Date(activity.start_date);
    const activityDateStr = typeof activity.start_date === "string" && activity.start_date
      ? activity.start_date.split("T")[0]
      : "Unknown";
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
        : fallbackPlanStartDate && isValidDate(fallbackPlanStartDate)
          ? fallbackPlanStartDate
          : null;

      if (!planStartDate || !isValidDate(activityDate)) {
        planContext = `The user is on a ${plan.distance} training plan (${plan.goal === "custom" ? "Custom" : plan.goal}).
- Target finishing time: ${plan.target_time}
- Race date: ${plan.race_date}
Please analyze how this activity fits the user's training plan, pacing, effort, and progression.`;
      } else if (activityDate < planStartDate) {
        planContext = `The user has an upcoming training plan:
- Race type: ${plan.distance} (${plan.goal === "custom" ? "Custom plan" : plan.goal})
- Target finishing time: ${plan.target_time}
- Plan start date: ${planStartDate.toISOString().split("T")[0]}
- Race date: ${plan.race_date}
- Plan duration: ${plan.weeks} weeks
- The plan has NOT started yet. This activity was done BEFORE the plan begins.
Please analyze how this activity benefits the user's preparation for their upcoming plan.`;
      } else {
        const diffMs = activityDate.getTime() - planStartDate.getTime();
        const weekNumber = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1);

        let plannedWorkout = "";
        const weekData = planData.find((w: any) => Number(w?.week) === weekNumber) ?? planData[weekNumber - 1];
        const dayMatch = asArray<any>(weekData?.days).find((d: any) => d?.date === activityDateStr);
        if (dayMatch) {
          const plannedDistance = dayMatch.distance_km ?? dayMatch.distance;
          plannedWorkout = `Planned workout for this day: ${dayMatch.workout || dayMatch.description || dayMatch.type || "Rest"}` +
            (plannedDistance ? ` (${plannedDistance} km)` : "");
        }

        planContext = `The user is on a ${plan.distance} training plan (${plan.goal === "custom" ? "Custom" : plan.goal}).
- This is Week ${weekNumber} of a ${plan.weeks}-week plan.
- Target finishing time: ${plan.target_time}
- Race date: ${plan.race_date}
${plannedWorkout ? `- ${plannedWorkout}` : ""}
Please analyze whether the user executed the planned workout correctly and provide feedback on pacing, effort, and adherence to the plan.`;
      }
    } else {
      planContext = "The user does not have an active training plan. Please analyze the workout quality based on the stats alone.";
    }

    const distKm = (activity.distance / 1000).toFixed(2);
    const paceSeconds = activity.average_speed > 0 ? 1000 / activity.average_speed : 0;
    const paceMin = Math.floor(paceSeconds / 60);
    const paceSec = Math.floor(paceSeconds % 60);
    const avgPace = `${paceMin}:${String(paceSec).padStart(2, "0")} /km`;

    const activitySource = activity.source || "unknown";

    let statsText = `Activity: "${activity.name}"
- Source: ${activitySource}
- Date: ${activityDateStr}
- Total Distance: ${distKm} km
- Moving Time: ${Math.floor(activity.moving_time / 60)} min ${activity.moving_time % 60} sec
- Average Pace: ${avgPace}
- Total Elevation Gain: ${Math.round(activity.total_elevation_gain)} m`;

    // HR is optional bonus data — include if available but analysis should not depend on it
    if (activity.average_heartrate) statsText += `\n- Average Heart Rate: ${Math.round(activity.average_heartrate)} bpm (optional data)`;
    if (activity.max_heartrate) statsText += `\n- Max Heart Rate: ${Math.round(activity.max_heartrate)} bpm (optional data)`;

    if (splits && splits.length > 0) {
      statsText += "\n\nSplits (per km):";
      for (const s of splits) {
        const sp = s.average_speed > 0 ? 1000 / s.average_speed : 0;
        const sm = Math.floor(sp / 60);
        const ss = Math.floor(sp % 60);
        statsText += `\n  km ${s.split}: ${sm}:${String(ss).padStart(2, "0")} /km`;
        statsText += ` | Elev: ${s.elevation_difference > 0 ? "+" : ""}${Math.round(s.elevation_difference)}m`;
      }
    }

    const systemPrompt = isZh
      ? `你是一位專業跑步教練 AI。根據提供的訓練計劃背景和活動數據，給出簡潔但深入的分析。回覆請用繁體中文。

你的分析應主要基於以下核心指標：
- 配速（平均配速、分段配速一致性）
- 距離（是否完成計劃距離）
- 時間（訓練時長是否合理）
- 爬升（地形對配速的影響）

如果有心率數據，可以作為額外參考，但不要因為缺少心率數據而影響分析質量。

如果用戶有訓練計劃，重點比較：
- 實際距離 vs 計劃距離
- 實際配速 vs 計劃目標配速
- 訓練類型是否符合計劃安排

格式要求：用 Markdown 格式回覆，包含以下部分：
## 總評
簡短評價這次訓練

## 優點
列出做得好的地方

## 需改善
列出需要改善的地方

## 建議
給出具體的訓練建議

保持簡潔實用，每個部分 2-3 點即可。`
      : `You are a professional running coach AI. Based on the training plan context and activity data provided, give a concise but insightful analysis.

Your analysis should focus on these core metrics:
- Pace (average pace, split consistency, appropriate effort level)
- Distance (did the runner complete the intended distance?)
- Duration (was the workout duration reasonable?)
- Elevation (how did terrain affect pace?)

If heart rate data is available, use it as supplementary context, but do NOT let missing HR data reduce your analysis quality. Many data sources (e.g. Apple Health) may not provide HR.

If the user has a training plan, focus on plan adherence:
- Actual distance vs planned distance
- Actual pace vs target pace implied by race goal
- Whether the workout type matches the plan's intent (easy run, tempo, intervals, long run, etc.)

Format your reply in Markdown with these sections:
## Overall Assessment
Brief evaluation of the workout

## Strengths
What went well

## Areas to Improve
What could be better

## Recommendations
Specific training advice

Keep it concise and actionable, 2-3 points per section.`;

    const userMessage = `${planContext}\n\n--- Activity Data ---\n${statsText}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse({ error: "Rate limited, please try again later." }, 429);
      }
      if (response.status === 402) {
        return jsonResponse({ error: "Payment required." }, 402);
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return jsonResponse({ error: "AI gateway error" }, 500);
    }

    const data = await response.json();
    const analysisText = data.choices?.[0]?.message?.content || "";

    // Save to DB in the appropriate language column
    const upsertData: any = {
      user_id: user.id,
      activity_id: activityDbId,
    };
    if (isZh) {
      upsertData.analysis_zh = analysisText;
    } else {
      upsertData.analysis_en = analysisText;
    }

    const { error: upsertError } = await serviceClient.from("activity_analyses").upsert(upsertData, { onConflict: "activity_id" });
    if (upsertError) {
      console.error("activity_analyses upsert error:", upsertError);
    }

    return jsonResponse({ analysis: analysisText });
  } catch (e) {
    console.error("analyze-activity error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
