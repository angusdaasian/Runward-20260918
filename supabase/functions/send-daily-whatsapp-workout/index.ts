// Cron-triggered: sends daily running workout suggestions to opted-in WhatsApp users.
// Mirrors send-daily-telegram-workout. Calls generate-suggested-workout per user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { waSendText, waSendTemplate } from "../_shared/whatsappActivityPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: users, error } = await supabase
      .from("profiles")
      .select("user_id, whatsapp_wa_id, lang, display_name")
      .eq("whatsapp_daily_workout", true)
      .not("whatsapp_wa_id", "is", null);

    if (error) throw error;
    if (!users?.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No opted-in users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;

    for (const u of users) {
      try {
        const lang = String(u.lang ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
        const today = new Date().toISOString().slice(0, 10);

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-suggested-workout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "x-internal-secret": SERVICE_KEY,
          },
          body: JSON.stringify({
            internalUserId: u.user_id,
            lang,
            todayDate: today,
            workoutType: "auto",
            simple: true, // short 2-3 sentence line to fit WhatsApp template variable {{1}}
          }),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          console.warn("[wa-daily] gen failed for", u.user_id, resp.status, body.slice(0, 200));
          failed++;
          continue;
        }
        const data = await resp.json();
        let suggestion: string = data?.suggestion ?? "";
        if (!suggestion) { failed++; continue; }

        // Sanitize for WhatsApp template variable rules:
        // no newlines, no tabs, no 4+ consecutive spaces, strip markdown emphasis.
        suggestion = suggestion
          .replace(/[*_`#>]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (suggestion.length > 700) suggestion = suggestion.slice(0, 697) + "...";

        const templateName = lang === "zh" ? "daily_suggestion_cn" : "daily_suggestion_en";
        const langCode = lang === "zh" ? "zh_HK" : "en";
        console.log(`[wa-daily] sending user=${u.user_id} lang=${lang} template=${templateName} varLen=${suggestion.length} preview="${suggestion.slice(0, 80)}"`);
        const msgId = await waSendTemplate(u.whatsapp_wa_id as string, templateName, langCode, suggestion);
        if (msgId) {
          sent++;
        } else {
          console.warn(`[wa-daily] template send returned null for user=${u.user_id}`);
          failed++;
        }
      } catch (e) {
        console.error("[wa-daily] error for user", u.user_id, e);
        failed++;
      }
    }

    console.log(`[wa-daily] done. sent=${sent} failed=${failed} total=${users.length}`);
    return new Response(JSON.stringify({ sent, failed, total: users.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[wa-daily] fatal", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
