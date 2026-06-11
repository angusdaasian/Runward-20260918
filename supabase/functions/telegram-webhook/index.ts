// Telegram webhook handler.
// Handles:
//   /start <code>  — links a Telegram chat to a Lovable user via one-time code
//   /stop          — unlinks the chat and turns off daily messages
//   /feedback      — toggles post-run RPE feedback prompts on/off
//   <text reply>   — if a pending post-run prompt exists, parse RPE + feel and reply with AI feedback
// Public endpoint (verify_jwt = false). Validated via X-Telegram-Bot-Api-Secret-Token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

async function sendMessage(chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error("[tg-webhook] sendMessage failed", e);
  }
}

function detectLangFromMeta(meta: any): "zh" | "en" {
  const raw = String(meta?.lang ?? meta?.language ?? meta?.locale ?? "").toLowerCase();
  return raw.startsWith("zh") ? "zh" : "en";
}

async function getUserLang(supabase: any, userId: string, profileLang?: string | null): Promise<"zh" | "en"> {
  if (profileLang) return String(profileLang).toLowerCase().startsWith("zh") ? "zh" : "en";
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return detectLangFromMeta((data?.user as any)?.user_metadata ?? {});
  } catch {
    return "en";
  }
}

function parseRpeAndFeel(text: string): { rpe: number | null; feel: string } {
  const m = text.match(/(?:^|\s)(?:rpe\s*[:=]?\s*)?(\b(?:10|[1-9])\b)/i);
  const rpe = m ? Number(m[1]) : null;
  const feel = m ? (text.slice(0, m.index!) + text.slice((m.index! + m[0].length))).trim() : text.trim();
  return { rpe, feel };
}

async function generateFeedback(opts: {
  lang: "zh" | "en";
  summary: any;
  rpe: number | null;
  feel: string;
}): Promise<string> {
  if (!LOVABLE_API_KEY) {
    return opts.lang === "zh"
      ? "✅ 已記錄你的回饋！"
      : "✅ Your feedback has been recorded!";
  }
  const km = opts.summary?.distance_m ? (opts.summary.distance_m / 1000).toFixed(2) : "?";
  const min = opts.summary?.duration_s ? (opts.summary.duration_s / 60).toFixed(0) : "?";
  const sys = opts.lang === "zh"
    ? "你是一位專業的跑步教練。針對使用者剛完成的跑步活動、自覺強度（RPE）和感受，給出簡短、鼓勵性、實用的回饋（4-6 句話）。使用繁體中文，避免醫療建議，可以提及恢復、訓練調整或下一步建議。"
    : "You are an expert running coach. Based on the user's recent run, their RPE, and how they felt, give a brief, encouraging, practical feedback (4-6 sentences). Avoid medical advice; mention recovery, training adjustments, or next steps where useful.";
  const user = opts.lang === "zh"
    ? `跑步：${km} km, ${min} 分鐘\nRPE: ${opts.rpe ?? "未提供"}\n感受：${opts.feel || "（無）"}`
    : `Run: ${km} km, ${min} min\nRPE: ${opts.rpe ?? "not provided"}\nFelt: ${opts.feel || "(none)"}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[tg-webhook] AI feedback failed", res.status, (await res.text()).slice(0, 200));
      return opts.lang === "zh" ? "✅ 已記錄你的回饋！" : "✅ Got it, feedback recorded!";
    }
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content?.trim();
    return txt || (opts.lang === "zh" ? "✅ 已記錄你的回饋！" : "✅ Got it, feedback recorded!");
  } catch (e) {
    console.error("[tg-webhook] AI error", e);
    return opts.lang === "zh" ? "✅ 已記錄你的回饋！" : "✅ Got it, feedback recorded!";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (got !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
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

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, telegram_link_code, telegram_link_code_expires_at, display_name, lang")
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

      const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);
      await sendMessage(
        chatId,
        lang === "zh"
          ? `✅ *已連結！*${profile.display_name ? ` 嗨 ${profile.display_name}，` : ""}\n\n你會在每天早上 7:00 (HKT) 收到 *今日跑步建議* 🌅🏃\n\n指令：\n/feedback — 開啟/關閉跑步後回饋\n/stop — 取消連結`
          : `✅ *Linked!*${profile.display_name ? ` Hi ${profile.display_name},` : ""}\n\nYou'll get your *daily running suggestion* here every morning at 7am HKT 🌅🏃\n\nCommands:\n/feedback — toggle post-run RPE prompts\n/stop — unlink`
      );
      return new Response("ok");
    }

    if (text.startsWith("/stop")) {
      const { data, error } = await supabase
        .from("profiles")
        .update({ telegram_daily_workout: false, telegram_activity_feedback: false, telegram_chat_id: null })
        .eq("telegram_chat_id", chatId)
        .select("user_id");
      if (error || !data?.length) {
        await sendMessage(chatId, "ℹ️ This chat is not linked to a RunWard account.");
      } else {
        await sendMessage(chatId, "👋 Unsubscribed. You won't receive any messages anymore. Re-link from the app whenever you want them back.");
      }
      return new Response("ok");
    }

    if (text.startsWith("/feedback")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, telegram_activity_feedback, lang")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();
      if (!profile) {
        await sendMessage(chatId, "ℹ️ This chat is not linked. Open RunWard to link first.");
        return new Response("ok");
      }
      const next = !profile.telegram_activity_feedback;
      await supabase.from("profiles").update({ telegram_activity_feedback: next }).eq("user_id", profile.user_id);
      const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);
      await sendMessage(
        chatId,
        next
          ? (lang === "zh" ? "✅ 已開啟跑步後回饋。完成跑步後我會問你的 RPE 和感受。" : "✅ Post-run feedback prompts enabled. After each run I'll ask for your RPE and how it felt.")
          : (lang === "zh" ? "🔕 已關閉跑步後回饋。" : "🔕 Post-run feedback prompts disabled.")
      );
      return new Response("ok");
    }

    if (text.startsWith("/help")) {
      await sendMessage(chatId, "*RunWard Coach commands*\n/start <code> — link your account\n/feedback — toggle post-run RPE prompts\n/stop — unsubscribe & unlink");
      return new Response("ok");
    }

    // Free-form text: see if there's a pending post-run prompt for this chat
    if (!text.startsWith("/")) {
      const { data: pending } = await supabase
        .from("telegram_pending_prompts")
        .select("id, user_id, activity_summary")
        .eq("chat_id", chatId)
        .is("responded_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending) {
        const { rpe, feel } = parseRpeAndFeel(text);
        const { data: profile } = await supabase
          .from("profiles")
          .select("lang")
          .eq("user_id", pending.user_id)
          .maybeSingle();
        const lang = await getUserLang(supabase, pending.user_id, (profile as any)?.lang);

        await supabase
          .from("telegram_pending_prompts")
          .update({ rpe, response_text: text, responded_at: new Date().toISOString() })
          .eq("id", pending.id);

        const feedback = await generateFeedback({
          lang,
          summary: pending.activity_summary ?? {},
          rpe,
          feel,
        });
        const header = lang === "zh" ? "🧠 *教練回饋*\n\n" : "🧠 *Coach feedback*\n\n";
        await sendMessage(chatId, header + feedback);
        return new Response("ok");
      }
    }

    await sendMessage(chatId, "🤖 I only handle /start, /stop, /feedback and /help. Open RunWard to manage your settings.");
    return new Response("ok");
  } catch (e) {
    console.error("[tg-webhook] error", e);
    return new Response("ok");
  }
});
