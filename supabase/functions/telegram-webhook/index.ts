// Telegram webhook handler.
// /start <code> | /stop | /feedback | /help
// Free-text reply: if a pending post-run prompt exists for the chat, parse RPE + comment,
// call analyze-activity (internal mode) to generate the SAME AI analysis used in-app,
// store it in activity_analyses, and reply with the result in Telegram.
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
    // Telegram limits to 4096 chars/message
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > 4000) {
      const cut = rest.lastIndexOf("\n", 4000);
      const at = cut > 1000 ? cut : 4000;
      chunks.push(rest.slice(0, at));
      rest = rest.slice(at);
    }
    chunks.push(rest);
    for (const part of chunks) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: "Markdown", disable_web_page_preview: true }),
      });
    }
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

// Map activity source → table, plus build the `activity` object analyze-activity expects.
async function loadActivityForAnalyze(
  supabase: any,
  source: string,
  activityDbId: string,
): Promise<{ activity: any; extras: any } | null> {
  try {
    if (source === "strava") {
      const { data } = await supabase
        .from("strava_activities")
        .select("*")
        .eq("id", activityDbId)
        .maybeSingle();
      if (!data) return null;
      return {
        activity: {
          name: data.name,
          distance: data.distance,
          moving_time: data.moving_time,
          elapsed_time: data.elapsed_time,
          total_elevation_gain: data.total_elevation_gain,
          start_date: data.start_date,
          average_speed: data.average_speed,
          max_speed: data.max_speed,
          average_heartrate: data.average_heartrate,
          max_heartrate: data.max_heartrate,
          source: "strava",
        },
        extras: { summaryPolyline: data.summary_polyline ?? undefined },
      };
    }
    if (source === "suunto") {
      const { data } = await supabase
        .from("suunto_activities")
        .select("*")
        .eq("id", activityDbId)
        .maybeSingle();
      if (!data) return null;
      return {
        activity: {
          name: data.name || "Suunto Workout",
          distance: data.distance,
          moving_time: data.moving_time,
          elapsed_time: data.elapsed_time,
          total_elevation_gain: data.total_elevation_gain,
          start_date: data.start_date,
          average_speed: data.average_speed,
          max_speed: data.max_speed,
          average_heartrate: data.average_heartrate,
          max_heartrate: data.max_heartrate,
          source: "Suunto",
          hr_samples: data.hr_samples,
          distance_samples: data.distance_samples,
          elevation_samples: data.elevation_samples,
          cadence_samples: data.cadence_samples,
        },
        extras: { summaryPolyline: data.summary_polyline ?? undefined },
      };
    }
    if (source === "terra") {
      const { data } = await supabase
        .from("terra_activities")
        .select("*")
        .eq("id", activityDbId)
        .maybeSingle();
      if (!data) return null;
      const distance = Number(data.distance_meters) || 0;
      const duration = Number(data.duration_seconds) || 0;
      return {
        activity: {
          name: data.activity_name || "Run",
          distance,
          moving_time: duration,
          elapsed_time: duration,
          total_elevation_gain: data.elevation_gain,
          start_date: data.start_time,
          average_speed: data.average_speed,
          max_speed: null,
          average_heartrate: data.average_hr,
          max_heartrate: data.max_hr,
          source: "Terra",
          laps: data.laps,
          hr_samples: data.hr_samples,
          distance_samples: data.distance_samples,
          elevation_samples: data.elevation_samples,
          cadence_samples: data.cadence_samples,
          avg_cadence: data.avg_cadence,
        },
        extras: { summaryPolyline: data.summary_polyline ?? undefined },
      };
    }
    if (source === "apple_health") {
      const { data } = await supabase
        .from("apple_health_activities")
        .select("*")
        .eq("id", activityDbId)
        .maybeSingle();
      if (!data) return null;
      return {
        activity: {
          name: data.name || "Apple Health Run",
          distance: data.distance,
          moving_time: data.moving_time,
          elapsed_time: data.elapsed_time,
          total_elevation_gain: data.total_elevation_gain,
          start_date: data.start_date,
          average_speed: data.average_speed,
          max_speed: data.max_speed,
          average_heartrate: data.average_heartrate,
          max_heartrate: data.max_heartrate,
          source: "Apple Health",
        },
        extras: {},
      };
    }
  } catch (e) {
    console.error("[tg-webhook] loadActivityForAnalyze failed", e);
  }
  return null;
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
          "👋 Welcome to *RunWard Coach*!\n\nOpen the RunWard app → More → Connect Telegram to get a one-time code."
        );
        return new Response("ok");
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, telegram_link_code, telegram_link_code_expires_at, display_name, lang")
        .eq("telegram_link_code", code)
        .maybeSingle();
      if (error || !profile) {
        await sendMessage(chatId, "❌ Invalid link code. Generate a new one in RunWard.");
        return new Response("ok");
      }
      const exp = profile.telegram_link_code_expires_at ? new Date(profile.telegram_link_code_expires_at).getTime() : 0;
      if (!exp || exp < Date.now()) {
        await sendMessage(chatId, "❌ Link code expired. Generate a new one in RunWard.");
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
        await sendMessage(chatId, "❌ Linking failed. Please try again.");
        return new Response("ok");
      }

      const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);
      await sendMessage(
        chatId,
        lang === "zh"
          ? `✅ *已連結！*${profile.display_name ? ` 嗨 ${profile.display_name}，` : ""}\n\n你會在每天早上 7:00 (HKT) 收到 *今日跑步建議* 🌅🏃\n\n指令：\n/feedback — 開啟/關閉跑步後 RPE 提示\n/stop — 取消連結`
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
        await sendMessage(chatId, "ℹ️ This chat is not linked.");
      } else {
        await sendMessage(chatId, "👋 Unsubscribed. Re-link from the app whenever you want messages back.");
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
        await sendMessage(chatId, "ℹ️ This chat is not linked.");
        return new Response("ok");
      }
      const next = !profile.telegram_activity_feedback;
      await supabase.from("profiles").update({ telegram_activity_feedback: next }).eq("user_id", profile.user_id);
      const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);
      await sendMessage(
        chatId,
        next
          ? (lang === "zh" ? "✅ 已開啟跑步後 RPE 提示。完成跑步後我會問你的 RPE 和感受，並生成完整的 AI 分析。" : "✅ Post-run prompts enabled. After each run I'll ask for your RPE + feel and generate the full AI analysis.")
          : (lang === "zh" ? "🔕 已關閉跑步後 RPE 提示。" : "🔕 Post-run prompts disabled.")
      );
      return new Response("ok");
    }

    if (text.startsWith("/help")) {
      await sendMessage(chatId, "*RunWard Coach*\n/start <code> — link\n/feedback — toggle post-run prompts\n/stop — unlink");
      return new Response("ok");
    }

    // Free-form text → check for pending post-run prompt
    if (!text.startsWith("/")) {
      const { data: pending } = await supabase
        .from("telegram_pending_prompts")
        .select("id, user_id, activity_source, activity_db_id, activity_summary")
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

        // Mark prompt as responded immediately to avoid double-handling
        await supabase
          .from("telegram_pending_prompts")
          .update({ rpe, response_text: text, responded_at: new Date().toISOString() })
          .eq("id", pending.id);

        if (!pending.activity_db_id) {
          await sendMessage(chatId, lang === "zh" ? "⚠️ 找不到對應的活動記錄，無法生成分析。" : "⚠️ Couldn't find the matching activity to analyze.");
          return new Response("ok");
        }

        // Send "analyzing…" ack
        await sendMessage(chatId, lang === "zh" ? "🧠 正在生成 AI 跑步分析…" : "🧠 Generating your AI run analysis…");

        const loaded = await loadActivityForAnalyze(supabase, pending.activity_source, pending.activity_db_id);
        if (!loaded) {
          await sendMessage(chatId, lang === "zh" ? "⚠️ 找不到活動資料。" : "⚠️ Activity data not found.");
          return new Response("ok");
        }

        const bodyPayload: any = {
          activityDbId: pending.activity_db_id,
          activity: loaded.activity,
          splits: [],
          lang,
          internalUserId: pending.user_id,
          forceRefresh: true,
          ...(rpe !== null ? { rpe } : {}),
          ...(feel ? { userComment: feel } : {}),
          ...(loaded.extras.summaryPolyline ? { summaryPolyline: loaded.extras.summaryPolyline } : {}),
        };
        // Pass per-second sample arrays if the activity carries them
        const a = loaded.activity;
        if (Array.isArray(a.hr_samples) && a.hr_samples.length > 10) bodyPayload.hrSamples = a.hr_samples;
        if (Array.isArray(a.distance_samples) && a.distance_samples.length > 10) bodyPayload.distanceSamples = a.distance_samples;
        if (Array.isArray(a.elevation_samples) && a.elevation_samples.length > 10) bodyPayload.elevationSamples = a.elevation_samples;
        if (Array.isArray(a.cadence_samples) && a.cadence_samples.length > 10) bodyPayload.cadenceSamples = a.cadence_samples;
        if (a.avg_cadence != null) bodyPayload.avgCadence = a.avg_cadence;
        if (Array.isArray(a.laps) && a.laps.length > 0) bodyPayload.garminLaps = a.laps;

        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-activity`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SERVICE_KEY}`,
              "x-internal-secret": SERVICE_KEY,
            },
            body: JSON.stringify(bodyPayload),
          });
          if (!resp.ok) {
            const errText = await resp.text().catch(() => "");
            console.error("[tg-webhook] analyze-activity failed", resp.status, errText.slice(0, 300));
            await sendMessage(chatId, lang === "zh" ? "⚠️ AI 分析失敗，請稍後在 App 中重試。" : "⚠️ AI analysis failed. Please retry from the app.");
            return new Response("ok");
          }
          const data = await resp.json();
          const analysis: string = data?.analysis || "";
          const nextWorkout: string = data?.nextWorkout || "";

          const header = lang === "zh" ? "🧠 *AI 跑步分析*\n\n" : "🧠 *AI Run Analysis*\n\n";
          let out = header + (analysis || (lang === "zh" ? "（無內容）" : "(no content)"));
          if (nextWorkout) {
            out += lang === "zh" ? `\n\n🏃 *建議的下次訓練*\n\n${nextWorkout}` : `\n\n🏃 *Suggested Next Workout*\n\n${nextWorkout}`;
          }
          out += lang === "zh" ? "\n\n_完整分析已儲存到 App。_" : "\n\n_Full analysis saved to the app._";
          await sendMessage(chatId, out);
        } catch (e) {
          console.error("[tg-webhook] analyze-activity error", e);
          await sendMessage(chatId, lang === "zh" ? "⚠️ AI 分析錯誤。" : "⚠️ AI analysis error.");
        }
        return new Response("ok");
      }
    }

    // Free-form text with no pending prompt → AI Running Coach chat
    if (!text.startsWith("/")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, lang, telegram_coach_session_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();
      if (!profile) {
        await sendMessage(chatId, "ℹ️ This chat is not linked. Open RunWard → More → Connect Telegram.");
        return new Response("ok");
      }
      const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-running-coach`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "x-internal-secret": SERVICE_KEY,
          },
          body: JSON.stringify({
            internalUserId: profile.user_id,
            message: text,
            lang,
            session_id: (profile as any).telegram_coach_session_id || undefined,
          }),
        });
        const data = await resp.json().catch(() => ({} as any));
        if (!resp.ok) {
          if (data?.code === "premium_required") {
            await sendMessage(chatId, lang === "zh" ? "⚠️ AI 教練是進階功能。請在 App 中升級。" : "⚠️ AI Coach is a Premium feature. Upgrade in the app to chat here.");
          } else if (data?.code === "rate_limited") {
            await sendMessage(chatId, lang === "zh" ? "⏳ 今日 AI 教練訊息已達上限，明天再試。" : "⏳ Daily AI Coach message limit reached. Try again tomorrow.");
          } else {
            await sendMessage(chatId, lang === "zh" ? "⚠️ AI 教練暫時無法回覆。" : "⚠️ AI Coach is temporarily unavailable.");
          }
          return new Response("ok");
        }
        const reply: string = data?.response || (lang === "zh" ? "（無回覆）" : "(no reply)");
        if (data?.session_id && data.session_id !== (profile as any).telegram_coach_session_id) {
          await supabase.from("profiles").update({ telegram_coach_session_id: data.session_id }).eq("user_id", profile.user_id);
        }
        await sendMessage(chatId, reply);
      } catch (e) {
        console.error("[tg-webhook] ai-running-coach error", e);
        await sendMessage(chatId, lang === "zh" ? "⚠️ AI 教練錯誤。" : "⚠️ AI Coach error.");
      }
      return new Response("ok");
    }

    await sendMessage(chatId, "🤖 Send me a message to chat with your AI Coach, or use /start /stop /feedback /help.");
    return new Response("ok");
  } catch (e) {
    console.error("[tg-webhook] error", e);
    return new Response("ok");
  }
});
