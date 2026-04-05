import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { activity, splits, lang, translate, activityDbId } = body;
    const isZh = lang === "zh";
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Translation mode ---
    if (translate && activityDbId) {
      // Fetch existing analysis
      const { data: existing } = await serviceClient
        .from("activity_analyses")
        .select("*")
        .eq("activity_id", activityDbId)
        .single();

      if (!existing) {
        return new Response(JSON.stringify({ error: "No analysis found to translate" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetField = isZh ? "analysis_zh" : "analysis_en";
      const sourceField = isZh ? "analysis_en" : "analysis_zh";

      // Already have this translation
      if (existing[targetField]) {
        return new Response(JSON.stringify({ analysis: existing[targetField] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sourceText = existing[sourceField];
      if (!sourceText) {
        return new Response(JSON.stringify({ error: "No source text to translate" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        return new Response(JSON.stringify({ error: "Translation failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tlData = await tlResp.json();
      const translated = tlData.choices?.[0]?.message?.content || "";

      // Save translation
      await serviceClient
        .from("activity_analyses")
        .update({ [targetField]: translated })
        .eq("id", existing.id);

      return new Response(JSON.stringify({ analysis: translated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Analysis mode ---
    if (!activity || !activityDbId) {
      return new Response(JSON.stringify({ error: "activity and activityDbId are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if analysis already exists
    const { data: existingAnalysis } = await serviceClient
      .from("activity_analyses")
      .select("*")
      .eq("activity_id", activityDbId)
      .single();

    if (existingAnalysis) {
      const field = isZh ? "analysis_zh" : "analysis_en";
      if (existingAnalysis[field]) {
        return new Response(JSON.stringify({ analysis: existingAnalysis[field] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
          return new Response(JSON.stringify({ analysis: translated }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Fetch user's active training plan
    const { data: plans } = await userClient
      .from("training_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const plan = plans && plans.length > 0 ? plans[0] : null;

    const activityDate = new Date(activity.start_date);
    let planContext = "";

    if (plan) {
      const planData = plan.plan_data as any;
      const raceDate = new Date(plan.race_date);
      const planStartDate = planData?.[0]?.days?.[0]?.date
        ? new Date(planData[0].days[0].date)
        : new Date(raceDate.getTime() - plan.weeks * 7 * 24 * 60 * 60 * 1000);

      if (activityDate < planStartDate) {
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
        const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

        let plannedWorkout = "";
        if (Array.isArray(planData)) {
          const weekData = planData.find((w: any) => w.week === weekNumber);
          if (weekData?.days) {
            const activityDayStr = activityDate.toISOString().split("T")[0];
            const dayMatch = weekData.days.find((d: any) => d.date === activityDayStr);
            if (dayMatch) {
              plannedWorkout = `Planned workout for this day: ${dayMatch.workout || dayMatch.description || "Rest"}` +
                (dayMatch.distance ? ` (${dayMatch.distance} km)` : "");
            }
          }
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

    let statsText = `Activity: "${activity.name}"
- Date: ${activityDate.toISOString().split("T")[0]}
- Total Distance: ${distKm} km
- Moving Time: ${Math.floor(activity.moving_time / 60)} min ${activity.moving_time % 60} sec
- Average Pace: ${avgPace}
- Total Elevation Gain: ${Math.round(activity.total_elevation_gain)} m`;

    if (activity.average_heartrate) statsText += `\n- Average Heart Rate: ${Math.round(activity.average_heartrate)} bpm`;
    if (activity.max_heartrate) statsText += `\n- Max Heart Rate: ${Math.round(activity.max_heartrate)} bpm`;

    if (splits && splits.length > 0) {
      statsText += "\n\nSplits (per km):";
      for (const s of splits) {
        const sp = s.average_speed > 0 ? 1000 / s.average_speed : 0;
        const sm = Math.floor(sp / 60);
        const ss = Math.floor(sp % 60);
        statsText += `\n  km ${s.split}: ${sm}:${String(ss).padStart(2, "0")} /km`;
        if (s.average_heartrate) statsText += ` | HR: ${Math.round(s.average_heartrate)} bpm`;
        statsText += ` | Elev: ${s.elevation_difference > 0 ? "+" : ""}${Math.round(s.elevation_difference)}m`;
      }
    }

    const systemPrompt = isZh
      ? `你是一位專業跑步教練 AI。根據提供的訓練計劃背景和活動數據，給出簡潔但深入的分析。回覆請用繁體中文。
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
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    await serviceClient.from("activity_analyses").upsert(upsertData, { onConflict: "activity_id" });

    return new Response(JSON.stringify({ analysis: analysisText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-activity error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
