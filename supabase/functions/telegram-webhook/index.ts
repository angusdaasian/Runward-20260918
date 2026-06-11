// Telegram webhook handler.
// Handles:
//   /start <code>  — links a Telegram chat to a Lovable user via one-time code
//   /stop          — unlinks the chat and turns off daily messages
// Public endpoint (verify_jwt = false). Validated via X-Telegram-Bot-Api-Secret-Token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

async function sendMessage(chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (e) {
    console.error("[tg-webhook] sendMessage failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Validate Telegram secret token (set when registering the webhook)
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (got !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }

  const msg = update?.message ?? update?.edited_message;
  const chatId: number | undefined = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId || !text) return new Response("ok");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const code = parts[1]?.trim();
      if (!code) {
        await sendMessage(
          chatId,
          "👋 Welcome to *RunWard Coach*!\n\nTo link your account, open the RunWard app → More → Connect Telegram → tap the link button. That will bring you back here with a one-time code."
        );
        return new Response("ok");
      }

      // Look up profile by code (and not expired)
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, telegram_link_code, telegram_link_code_expires_at, display_name")
        .eq("telegram_link_code", code)
        .maybeSingle();

      if (error || !profile) {
        await sendMessage(chatId, "❌ This link code is invalid. Please open RunWard and generate a new code.");
        return new Response("ok");
      }

      const exp = profile.telegram_link_code_expires_at ? new Date(profile.telegram_link_code_expires_at).getTime() : 0;
      if (!exp || exp < Date.now()) {
        await sendMessage(chatId, "❌ This link code has expired. Please open RunWard and generate a new code.");
        return new Response("ok");
      }

      // Link!
      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          telegram_chat_id: chatId,
          telegram_link_code: null,
          telegram_link_code_expires_at: null,
          telegram_daily_workout: true,
        })
        .eq("user_id", profile.user_id);

      if (upErr) {
        console.error("[tg-webhook] link update failed", upErr);
        await sendMessage(chatId, "❌ Something went wrong linking your account. Please try again.");
        return new Response("ok");
      }

      await sendMessage(
        chatId,
        `✅ *Linked!*${profile.display_name ? ` Hi ${profile.display_name},` : ""}\n\nYou'll now receive your *daily running suggestion* here every morning at 7am HKT 🌅🏃\n\nSend /stop anytime to turn this off.`
      );
      return new Response("ok");
    }

    if (text.startsWith("/stop")) {
      const { data, error } = await supabase
        .from("profiles")
        .update({ telegram_daily_workout: false, telegram_chat_id: null })
        .eq("telegram_chat_id", chatId)
        .select("user_id");
      if (error || !data?.length) {
        await sendMessage(chatId, "ℹ️ This chat is not linked to a RunWard account.");
      } else {
        await sendMessage(chatId, "👋 Unsubscribed. You won't receive daily workout suggestions anymore. Re-link from the app whenever you want them back.");
      }
      return new Response("ok");
    }

    if (text.startsWith("/help")) {
      await sendMessage(chatId, "*RunWard Coach commands*\n/start <code> — link your account\n/stop — unsubscribe & unlink");
      return new Response("ok");
    }

    // Anything else
    await sendMessage(chatId, "🤖 I only handle /start, /stop and /help. Open RunWard to manage your settings.");
    return new Response("ok");
  } catch (e) {
    console.error("[tg-webhook] error", e);
    return new Response("ok"); // always 200 so Telegram doesn't retry forever
  }
});
