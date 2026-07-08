// One-off tester: sends all 4 approved WhatsApp templates to the current
// linked user, in order. activity_prompt_hk is sent LAST and wired to the
// user's most recent run (via whatsapp_pending_prompts) so replying with an
// RPE flows through the normal analysis pipeline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { waSendTemplate, formatWhatsAppMarkdown } from "../_shared/whatsappActivityPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Hard-coded test target (user request): angchenghk@gmail.com WA
const TEST_USER_ID = "c7a7d1ca-c7bf-4288-bb9d-794006a04087";
const TEST_WA_ID = "85291588020";

async function generateSuggestion(lang: "zh" | "en"): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-suggested-workout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "x-internal-secret": SERVICE_KEY,
    },
    body: JSON.stringify({
      internalUserId: TEST_USER_ID,
      lang,
      todayDate: new Date().toISOString().slice(0, 10),
      workoutType: "auto",
      simple: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return String((data as any)?.suggestion ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const results: any[] = [];
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) daily_suggestion_en (English rich)
    {
      const raw = await generateSuggestion("en");
      const body = formatWhatsAppMarkdown(raw).replace(/ {4,}/g, "   ");
      const id = await waSendTemplate(TEST_WA_ID, "daily_suggestion_en", "en", body);
      results.push({ step: 1, template: "daily_suggestion_en", messageId: id, len: body.length, preview: body.slice(0, 120) });
    }

    // 2) daily_suggestion_cn (Chinese rich)
    {
      const raw = await generateSuggestion("zh");
      const body = formatWhatsAppMarkdown(raw).replace(/ {4,}/g, "   ");
      const id = await waSendTemplate(TEST_WA_ID, "daily_suggestion_cn", "zh_HK", body);
      results.push({ step: 2, template: "daily_suggestion_cn", messageId: id, len: body.length, preview: body.slice(0, 120) });
    }

    // 3) activity_prompt_en (single-line summary, NOT wired to real activity)
    {
      const line = "11.24 km in 60 min, pace 5:20/km";
      const id = await waSendTemplate(TEST_WA_ID, "activity_prompt_en", "en", line);
      results.push({ step: 3, template: "activity_prompt_en", messageId: id, line });
    }

    // 4) activity_prompt_hk — LAST, wired to the real 11.24 km 7/7 run so the
    //    user can reply with an RPE and trigger AI analysis.
    {
      const activityKey = "GARMIN:1:23512033333";
      const activitySource = "terra";
      const distanceM = 11238.4;
      const durationS = 3600;

      // Look up terra_activities row id
      const [provider, ...rest] = activityKey.split(":");
      const aid = rest.join(":");
      const { data: act } = await supabase
        .from("terra_activities")
        .select("id")
        .eq("user_id", TEST_USER_ID)
        .eq("provider", provider)
        .eq("terra_activity_id", aid)
        .maybeSingle();

      // Clear any existing pending prompt for the same key so the RPE reply
      // path handles this fresh test cleanly.
      await supabase
        .from("whatsapp_pending_prompts")
        .delete()
        .eq("user_id", TEST_USER_ID)
        .eq("activity_source", activitySource)
        .eq("activity_key", activityKey);

      const { data: inserted, error: insErr } = await supabase
        .from("whatsapp_pending_prompts")
        .insert({
          user_id: TEST_USER_ID,
          wa_id: TEST_WA_ID,
          activity_source: activitySource,
          activity_key: activityKey,
          activity_db_id: (act as any)?.id ?? null,
          activity_summary: {
            distance_m: distanceM,
            duration_s: durationS,
            sport_type: "run",
          },
        })
        .select("id")
        .maybeSingle();

      if (insErr) {
        results.push({ step: 4, template: "activity_prompt_hk", error: insErr.message });
      } else {
        const km = distanceM / 1000;
        const min = durationS / 60;
        const paceSec = Math.round((min / km) * 60);
        const paceStr = `${Math.floor(paceSec / 60)}:${String(paceSec % 60).padStart(2, "0")}/km`;
        const oneLine = `${km.toFixed(2)} 公里，${min.toFixed(0)} 分鐘，配速 ${paceStr}`;
        const msgId = await waSendTemplate(TEST_WA_ID, "activity_prompt_hk", "zh_HK", oneLine);
        if (msgId && inserted) {
          await supabase
            .from("whatsapp_pending_prompts")
            .update({ prompt_message_id: msgId })
            .eq("id", (inserted as any).id);
        }
        results.push({ step: 4, template: "activity_prompt_hk", messageId: msgId, oneLine, pendingId: (inserted as any)?.id });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), results }, null, 2), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
