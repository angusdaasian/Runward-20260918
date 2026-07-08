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
            simple: false, // rich full suggestion (same as in-window message)
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

        // Format for WhatsApp: preserve line breaks so the message reads like
        // the in-window rich message. WhatsApp template body variables allow
        // newlines for utility/marketing templates, but disallow tabs and
        // 4+ consecutive spaces. Convert markdown -> WhatsApp formatting
        // (**bold** -> *bold*, ## Heading -> *Heading*, keep bullets/numbers).
        suggestion = suggestion
          // strip horizontal rules
          .replace(/^\s*---+\s*$/gm, "")
          // bold FIRST (before ## / bullet passes touch asterisks):
          //   **text** -> *text*  (WhatsApp uses single asterisks for bold)
          .replace(/\*\*(.+?)\*\*/g, "§B§$1§B§")
          // headings: "## Title" (optional trailing colon) -> "*Title*"
          .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*:?\s*$/gm, "§B§$1§B§")
          // list bullets: "- item" or "* item" -> "• item"
          .replace(/^\s*[-*]\s+/gm, "• ")
          // numbered list: "1. item" -> "1) item"
          .replace(/^\s*(\d+)\.\s+/gm, "$1) ")
          // strip stray inline markdown noise
          .replace(/`+/g, "")
          .replace(/^>\s?/gm, "")
          // restore bold markers as WhatsApp single-asterisk
          .replace(/§B§/g, "*")
          // tabs -> single space
          .replace(/\t+/g, " ")
          // collapse 3+ blank lines -> single blank line
          .replace(/\n{3,}/g, "\n\n")
          // keep runs of spaces under Meta's 4-space limit
          .replace(/ {4,}/g, "   ")
          // trim trailing whitespace on each line
          .replace(/[ \t]+\n/g, "\n")
          .trim();

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
