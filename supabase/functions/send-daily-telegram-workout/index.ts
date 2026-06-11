// Cron-triggered: sends daily running workout suggestions to opted-in Telegram users.
// Calls generate-suggested-workout in "internal" mode for each user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function tgSend(chatId: number, text: string) {
  // Telegram limits messages to 4096 chars
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 4000) {
    const split = remaining.lastIndexOf("\n", 4000);
    const cut = split > 1000 ? split : 4000;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  chunks.push(remaining);

  for (const part of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: "Markdown", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[tg-daily] sendMessage non-ok", res.status, body.slice(0, 200));
      // If chat blocked/deleted, unlink the user
      if (res.status === 403 || res.status === 400) {
        try {
          const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
          await supabase.from("profiles")
            .update({ telegram_chat_id: null, telegram_daily_workout: false })
            .eq("telegram_chat_id", chatId);
        } catch {}
      }
      return false;
    }
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: users, error } = await supabase
      .from("profiles")
      .select("user_id, telegram_chat_id, lang, display_name")
      .eq("telegram_daily_workout", true)
      .not("telegram_chat_id", "is", null);

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
            simple: false,
          }),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          console.warn("[tg-daily] gen failed for", u.user_id, resp.status, body.slice(0, 200));
          failed++;
          continue;
        }
        const data = await resp.json();
        const suggestion: string = data?.suggestion ?? "";
        if (!suggestion) { failed++; continue; }

        const header = lang === "zh"
          ? `🏃‍♂️ *今日跑步建議*\n\n`
          : `🏃‍♂️ *Today's Run Suggestion*\n\n`;
        const ok = await tgSend(u.telegram_chat_id as number, header + suggestion);
        if (ok) sent++; else failed++;
      } catch (e) {
        console.error("[tg-daily] error for user", u.user_id, e);
        failed++;
      }
    }

    console.log(`[tg-daily] done. sent=${sent} failed=${failed} total=${users.length}`);
    return new Response(JSON.stringify({ sent, failed, total: users.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tg-daily] fatal", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
