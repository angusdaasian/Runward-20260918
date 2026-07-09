// Cron-triggered: sends daily running workout suggestions to opted-in WhatsApp users.
// Mirrors send-daily-telegram-workout. Calls generate-suggested-workout per user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { waSendText, waSendTemplate, formatWhatsAppMarkdown } from "../_shared/whatsappActivityPrompt.ts";

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
        // Use Hong Kong local date (UTC+8) so early-morning cron runs (which
        // are still "yesterday" in UTC) generate TODAY's suggestion, not
        // yesterday's. Matches ai-running-coach's hkToday().
        const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
            compact: true, // short structured summary — user can request full detail via reply
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

        // Append the "want detail?" call-to-action.
        const ctaZh = "\n\n想要更詳細的建議（包含配速理由、天氣建議、教練提醒）？回覆 *YES* 或 *詳細*。";
        const ctaEn = "\n\nWant a fuller breakdown (pacing rationale, weather timing, coach notes)? Reply *YES* or *DETAIL*.";
        suggestion = suggestion + (lang === "zh" ? ctaZh : ctaEn);

        // Format for WhatsApp.
        suggestion = formatWhatsAppMarkdown(suggestion)
          .replace(/ {4,}/g, "   ");

        // Meta template parameter cap ~1024 chars. Leave margin.
        if (suggestion.length > 900) {
          let cut = suggestion.slice(0, 897);
          const lastBreak = cut.lastIndexOf("\n");
          if (lastBreak > 600) cut = cut.slice(0, lastBreak);
          suggestion = cut.trimEnd() + "…";
        }


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
