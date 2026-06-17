// Meta WhatsApp Cloud API webhook.
// GET  : Meta verification handshake.
// POST : inbound messages → handle linking, /stop, /feedback, RPE replies, AI coach chat.
//
// verify_jwt is off (Meta calls unauthenticated). POST is verified via the
// X-Hub-Signature-256 header (HMAC-SHA256 of the raw body using WHATSAPP_APP_SECRET).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { waSendText } from "../_shared/whatsappActivityPrompt.ts";
import {
  classifyConfirmation,
  formatSuggestionPrompt,
  storePendingSuggestion,
  clearPendingSuggestion,
  getPendingSuggestion,
  applyPendingSuggestion,
  type PlanSuggestion,
} from "../_shared/botPlanSuggestion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!APP_SECRET) return true; // not configured → skip (handshake-only test setups)
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  try {
    const expectedHex = signatureHeader.slice("sha256=".length).trim().toLowerCase();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    // constant-time-ish compare
    if (hex.length !== expectedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    console.error("[wa-webhook] signature check failed", e);
    return false;
  }
}

async function loadActivityForAnalyze(
  supabase: any,
  source: string,
  activityDbId: string,
): Promise<{ activity: any; extras: any } | null> {
  try {
    if (source === "strava") {
      const { data } = await supabase.from("strava_activities").select("*").eq("id", activityDbId).maybeSingle();
      if (!data) return null;
      return {
        activity: {
          name: data.name, distance: data.distance, moving_time: data.moving_time, elapsed_time: data.elapsed_time,
          total_elevation_gain: data.total_elevation_gain, start_date: data.start_date,
          average_speed: data.average_speed, max_speed: data.max_speed,
          average_heartrate: data.average_heartrate, max_heartrate: data.max_heartrate,
          source: "strava",
        },
        extras: { summaryPolyline: data.summary_polyline ?? undefined },
      };
    }
    if (source === "suunto") {
      const { data } = await supabase.from("suunto_activities").select("*").eq("id", activityDbId).maybeSingle();
      if (!data) return null;
      return {
        activity: {
          name: data.name || "Suunto Workout", distance: data.distance, moving_time: data.moving_time,
          elapsed_time: data.elapsed_time, total_elevation_gain: data.total_elevation_gain,
          start_date: data.start_date, average_speed: data.average_speed, max_speed: data.max_speed,
          average_heartrate: data.average_heartrate, max_heartrate: data.max_heartrate,
          source: "Suunto", hr_samples: data.hr_samples, distance_samples: data.distance_samples,
          elevation_samples: data.elevation_samples, cadence_samples: data.cadence_samples,
        },
        extras: { summaryPolyline: data.summary_polyline ?? undefined },
      };
    }
    if (source === "terra") {
      const { data } = await supabase.from("terra_activities").select("*").eq("id", activityDbId).maybeSingle();
      if (!data) return null;
      const distance = Number(data.distance_meters) || 0;
      const duration = Number(data.duration_seconds) || 0;
      return {
        activity: {
          name: data.activity_name || "Run", distance, moving_time: duration, elapsed_time: duration,
          total_elevation_gain: data.elevation_gain, start_date: data.start_time,
          average_speed: data.average_speed, max_speed: null,
          average_heartrate: data.average_hr, max_heartrate: data.max_hr,
          source: "Terra", laps: data.laps, hr_samples: data.hr_samples,
          distance_samples: data.distance_samples, elevation_samples: data.elevation_samples,
          cadence_samples: data.cadence_samples, avg_cadence: data.avg_cadence,
        },
        extras: { summaryPolyline: data.summary_polyline ?? undefined },
      };
    }
    if (source === "apple_health") {
      const { data } = await supabase.from("apple_health_activities").select("*").eq("id", activityDbId).maybeSingle();
      if (!data) return null;
      return {
        activity: {
          name: data.name || "Apple Health Run", distance: data.distance, moving_time: data.moving_time,
          elapsed_time: data.elapsed_time, total_elevation_gain: data.total_elevation_gain,
          start_date: data.start_date, average_speed: data.average_speed, max_speed: data.max_speed,
          average_heartrate: data.average_heartrate, max_heartrate: data.max_heartrate,
          source: "Apple Health",
        },
        extras: {},
      };
    }
  } catch (e) {
    console.error("[wa-webhook] loadActivityForAnalyze failed", e);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // --- Meta verification handshake ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // --- Inbound events ---
  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const valid = await verifySignature(rawBody, sig);
  if (!valid) {
    console.warn("[wa-webhook] invalid signature");
    // Still 200 so Meta doesn't retry indefinitely
    return new Response("ok", { status: 200 });
  }

  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { return new Response("ok"); }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value ?? {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          if (message.type !== "text") continue;
          const waId: string = String(message.from ?? "");
          const text: string = String(message.text?.body ?? "").trim();
          if (!waId || !text) continue;
          await handleIncoming(supabase, waId, text);
        }
      }
    }
  } catch (e) {
    console.error("[wa-webhook] handler error", e);
  }

  // Always ack quickly
  return new Response("EVENT_RECEIVED", { status: 200 });
});

async function handleIncoming(supabase: any, waId: string, text: string) {
  const lower = text.toLowerCase();

  // LINK <code> — link an account
  const linkMatch = text.match(/^\s*link\s+([a-z0-9]{8,64})\b/i);
  if (linkMatch) {
    const code = linkMatch[1];
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, whatsapp_link_code_expires_at, display_name, lang")
      .eq("whatsapp_link_code", code)
      .maybeSingle();
    if (!profile) {
      await waSendText(waId, "❌ Invalid link code. Generate a new one in RunWard → More → WhatsApp.");
      return;
    }
    const exp = profile.whatsapp_link_code_expires_at ? new Date(profile.whatsapp_link_code_expires_at).getTime() : 0;
    if (!exp || exp < Date.now()) {
      await waSendText(waId, "❌ Link code expired. Generate a new one in RunWard.");
      return;
    }
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        whatsapp_wa_id: waId,
        whatsapp_phone_e164: `+${waId}`,
        whatsapp_link_code: null,
        whatsapp_link_code_expires_at: null,
        whatsapp_daily_workout: true,
      })
      .eq("user_id", profile.user_id);
    if (upErr) {
      await waSendText(waId, "❌ Linking failed. Please try again.");
      return;
    }
    const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);
    await waSendText(
      waId,
      lang === "zh"
        ? `✅ *已連結！*${profile.display_name ? ` 嗨 ${profile.display_name}，` : ""}\n\n你會在每天早上 7:00 (HKT) 收到 *今日跑步建議* 🌅🏃\n\n指令：\nFEEDBACK — 開啟/關閉跑步後 RPE 提示\nSTOP — 取消連結\nHELP — 查看指令`
        : `✅ *Linked!*${profile.display_name ? ` Hi ${profile.display_name},` : ""}\n\nYou'll get your *daily running suggestion* here every morning at 7am HKT 🌅🏃\n\nCommands:\nFEEDBACK — toggle post-run RPE prompts\nSTOP — unlink\nHELP — show commands`,
    );
    return;
  }

  // STOP — unlink
  if (lower === "stop" || lower === "/stop") {
    const { data } = await supabase
      .from("profiles")
      .update({
        whatsapp_daily_workout: false,
        whatsapp_activity_feedback: false,
        whatsapp_wa_id: null,
      })
      .eq("whatsapp_wa_id", waId)
      .select("user_id");
    if (!data?.length) {
      await waSendText(waId, "ℹ️ This number is not linked.");
    } else {
      await waSendText(waId, "👋 Unsubscribed. Re-link from RunWard whenever you want messages back.");
    }
    return;
  }

  // FEEDBACK — toggle post-run prompts
  if (lower === "feedback" || lower === "/feedback") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, whatsapp_activity_feedback, lang")
      .eq("whatsapp_wa_id", waId)
      .maybeSingle();
    if (!profile) {
      await waSendText(waId, "ℹ️ This number is not linked.");
      return;
    }
    const next = !profile.whatsapp_activity_feedback;
    await supabase.from("profiles").update({ whatsapp_activity_feedback: next }).eq("user_id", profile.user_id);
    const lang = await getUserLang(supabase, profile.user_id, (profile as any).lang);
    await waSendText(
      waId,
      next
        ? (lang === "zh" ? "✅ 已開啟跑步後 RPE 提示。完成跑步後我會問你的 RPE 和感受，並生成完整的 AI 分析。" : "✅ Post-run prompts enabled. After each run I'll ask for your RPE + feel and generate the full AI analysis.")
        : (lang === "zh" ? "🔕 已關閉跑步後 RPE 提示。" : "🔕 Post-run prompts disabled."),
    );
    return;
  }

  if (lower === "help" || lower === "/help") {
    await waSendText(waId, "*RunWard Coach*\nLINK <code> — link\nFEEDBACK — toggle post-run prompts\nSTOP — unlink");
    return;
  }

  // Free-form text → check for pending RPE prompt
  const { data: pending } = await supabase
    .from("whatsapp_pending_prompts")
    .select("id, user_id, activity_source, activity_db_id, activity_summary")
    .eq("wa_id", waId)
    .is("responded_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    const { rpe, feel } = parseRpeAndFeel(text);
    const { data: profile } = await supabase
      .from("profiles").select("lang").eq("user_id", pending.user_id).maybeSingle();
    const lang = await getUserLang(supabase, pending.user_id, (profile as any)?.lang);

    await supabase
      .from("whatsapp_pending_prompts")
      .update({ rpe, response_text: text, responded_at: new Date().toISOString() })
      .eq("id", pending.id);

    if (!pending.activity_db_id) {
      await waSendText(waId, lang === "zh" ? "⚠️ 找不到對應的活動記錄，無法生成分析。" : "⚠️ Couldn't find the matching activity to analyze.");
      return;
    }

    await waSendText(waId, lang === "zh" ? "🧠 正在生成 AI 跑步分析…" : "🧠 Generating your AI run analysis…");

    const loaded = await loadActivityForAnalyze(supabase, pending.activity_source, pending.activity_db_id);
    if (!loaded) {
      await waSendText(waId, lang === "zh" ? "⚠️ 找不到活動資料。" : "⚠️ Activity data not found.");
      return;
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
        console.error("[wa-webhook] analyze-activity failed", resp.status, errText.slice(0, 300));
        await waSendText(waId, lang === "zh" ? "⚠️ AI 分析失敗，請稍後在 App 中重試。" : "⚠️ AI analysis failed. Please retry from the app.");
        return;
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
      await waSendText(waId, out);
    } catch (e) {
      console.error("[wa-webhook] analyze-activity error", e);
      await waSendText(waId, lang === "zh" ? "⚠️ AI 分析錯誤。" : "⚠️ AI analysis error.");
    }
    return;
  }

  // Free-form text → AI Running Coach
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, lang, whatsapp_coach_session_id")
    .eq("whatsapp_wa_id", waId)
    .maybeSingle();
  if (!profile) {
    await waSendText(waId, "ℹ️ This number is not linked. Open RunWard → More → WhatsApp to link.");
    return;
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
        session_id: (profile as any).whatsapp_coach_session_id || undefined,
      }),
    });
    const data = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      if (data?.code === "premium_required") {
        await waSendText(waId, lang === "zh" ? "⚠️ AI 教練是進階功能。請在 App 中升級。" : "⚠️ AI Coach is a Premium feature. Upgrade in the app to chat here.");
      } else if (data?.code === "rate_limited") {
        await waSendText(waId, lang === "zh" ? "⏳ 今日 AI 教練訊息已達上限，明天再試。" : "⏳ Daily AI Coach message limit reached. Try again tomorrow.");
      } else {
        await waSendText(waId, lang === "zh" ? "⚠️ AI 教練暫時無法回覆。" : "⚠️ AI Coach is temporarily unavailable.");
      }
      return;
    }
    const reply: string = data?.response || (lang === "zh" ? "（無回覆）" : "(no reply)");
    if (data?.session_id && data.session_id !== (profile as any).whatsapp_coach_session_id) {
      await supabase.from("profiles").update({ whatsapp_coach_session_id: data.session_id }).eq("user_id", profile.user_id);
    }
    await waSendText(waId, reply);
  } catch (e) {
    console.error("[wa-webhook] ai-running-coach error", e);
    await waSendText(waId, lang === "zh" ? "⚠️ AI 教練錯誤。" : "⚠️ AI Coach error.");
  }
}
