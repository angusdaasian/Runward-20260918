// Sends a WhatsApp post-run prompt asking for RPE + how the run felt.
// Mirrors telegramActivityPrompt.ts. Idempotent per (user_id, source, activity_key).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const GRAPH_VERSION = "v21.0";

export type ActivitySource = "strava" | "suunto" | "terra" | "apple_health";

export type ActivitySummary = {
  userId: string;
  source: ActivitySource;
  activityKey: string;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  sportType?: string | null;
};

function detectLang(rawLang: unknown): "zh" | "en" {
  const raw = String(rawLang ?? "").toLowerCase();
  return raw.startsWith("zh") ? "zh" : "en";
}

function fmtSummary(s: ActivitySummary, lang: "zh" | "en"): string {
  const km = s.distanceMeters && s.distanceMeters > 0 ? (s.distanceMeters / 1000) : 0;
  const min = s.durationSeconds && s.durationSeconds > 0 ? (s.durationSeconds / 60) : 0;
  const paceSec = km > 0 && min > 0 ? Math.round((min / km) * 60) : 0;
  const paceStr = paceSec > 0
    ? `${Math.floor(paceSec / 60)}:${String(paceSec % 60).padStart(2, "0")}/km`
    : "—";
  const kmStr = km > 0 ? km.toFixed(2) : "—";
  const minStr = min > 0 ? min.toFixed(0) : "—";
  if (lang === "zh") {
    return `📏 距離：${kmStr} km\n⏱️ 時間：${minStr} 分鐘\n🏃 配速：${paceStr}`;
  }
  return `📏 Distance: ${kmStr} km\n⏱️ Time: ${minStr} min\n🏃 Pace: ${paceStr}`;
}

export async function waSendText(waId: string, text: string): Promise<string | null> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("[wa] send skipped: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing");
    return null;
  }
  try {
    // WhatsApp text limit is 4096 chars
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > 4000) {
      const cut = rest.lastIndexOf("\n", 4000);
      const at = cut > 1000 ? cut : 4000;
      chunks.push(rest.slice(0, at));
      rest = rest.slice(at);
    }
    chunks.push(rest);

    let lastId: string | null = null;
    for (const part of chunks) {
      let attempt = 0;
      let sent = false;
      while (attempt < 4 && !sent) {
        attempt++;
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: waId,
              type: "text",
              text: { preview_url: false, body: part },
            }),
          },
        );
        if (res.ok) {
          const data = await res.json().catch(() => null) as any;
          lastId = data?.messages?.[0]?.id ?? lastId;
          sent = true;
          break;
        }
        const errText = (await res.text()).slice(0, 500);
        const transient = res.status >= 500 || /is_transient|"code":2[,}]/i.test(errText);
        console.warn(`[wa] send non-ok status=${res.status} attempt=${attempt} transient=${transient}`, errText);
        if (res.status === 401 || res.status === 403 || /131005|access token|permissions/i.test(errText)) {
          console.error("[wa] WhatsApp token/permission failure. Refresh WHATSAPP_ACCESS_TOKEN and verify it can send from WHATSAPP_PHONE_NUMBER_ID.");
          return null;
        }
        if (!transient || attempt >= 4) return null;
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt - 1)));
      }
      if (!sent) return null;
    }
    return lastId;
  } catch (e) {
    console.error("[wa] send failed", e);
    return null;
  }
}

/**
 * Send a WhatsApp Utility template message (bypasses 24h customer service window).
 * Template body must contain a single {{1}} variable.
 */
export async function waSendTemplate(
  waId: string,
  templateName: string,
  languageCode: string,
  variable: string,
): Promise<string | null> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn("[wa] template send skipped: missing token/phone id");
    return null;
  }
  // Template parameters are capped (~1024 chars). Truncate safely.
  let v = (variable ?? "").replace(/\s+/g, " ").trim();
  if (v.length > 900) v = v.slice(0, 897) + "...";
  if (!v) v = "—";
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: waId,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: v }],
              },
            ],
          },
        }),
      },
    );
    if (res.ok) {
      const data = await res.json().catch(() => null) as any;
      return data?.messages?.[0]?.id ?? null;
    }
    const errText = (await res.text()).slice(0, 600);
    console.warn(`[wa] template send failed status=${res.status} template=${templateName}`, errText);
    return null;
  } catch (e) {
    console.error("[wa] template send error", e);
    return null;
  }
}

async function lookupActivityDbId(
  supabase: any,
  userId: string,
  summary: ActivitySummary,
): Promise<string | null> {
  try {
    if (summary.source === "strava") {
      const { data } = await supabase
        .from("strava_activities").select("id")
        .eq("user_id", userId).eq("strava_id", Number(summary.activityKey))
        .maybeSingle();
      return data?.id ?? null;
    }
    if (summary.source === "suunto") {
      const { data } = await supabase
        .from("suunto_activities").select("id")
        .eq("user_id", userId).eq("suunto_workout_key", String(summary.activityKey))
        .maybeSingle();
      return data?.id ?? null;
    }
    if (summary.source === "terra") {
      const [provider, ...rest] = String(summary.activityKey).split(":");
      const aid = rest.join(":");
      const { data } = await supabase
        .from("terra_activities").select("id")
        .eq("user_id", userId).eq("provider", provider).eq("terra_activity_id", aid)
        .maybeSingle();
      return data?.id ?? null;
    }
    if (summary.source === "apple_health") {
      const [startDate, distStr] = String(summary.activityKey).split(":");
      const distance = Number(distStr) || 0;
      const { data } = await supabase
        .from("apple_health_activities").select("id, distance")
        .eq("user_id", userId).eq("start_date", startDate).limit(5);
      if (!data?.length) return null;
      const best = data.find((r: any) => Math.abs(Number(r.distance) - distance) < 2) ?? data[0];
      return best?.id ?? null;
    }
  } catch (e) {
    console.warn("[wa-activity-prompt] lookupActivityDbId failed", e);
  }
  return null;
}

export async function maybeSendWhatsappActivityPrompt(summary: ActivitySummary): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const sport = String(summary.sportType ?? "").toLowerCase();
    if (sport && !/run|jog|trail|treadmill/.test(sport)) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_wa_id, whatsapp_activity_feedback, lang")
      .eq("user_id", summary.userId)
      .maybeSingle();

    if (!profile?.whatsapp_wa_id || !profile?.whatsapp_activity_feedback) {
      console.log(`[wa-activity-prompt] skipped user=${summary.userId} has_wa=${!!profile?.whatsapp_wa_id} enabled=${!!profile?.whatsapp_activity_feedback}`);
      return;
    }

    let lang = detectLang((profile as any).lang);
    if (!(profile as any).lang) {
      try {
        const { data } = await supabase.auth.admin.getUserById(summary.userId);
        const meta: any = (data?.user as any)?.user_metadata ?? {};
        lang = detectLang(meta.lang ?? meta.language ?? meta.locale);
      } catch (_) { /* default */ }
    }

    const activityDbId = await lookupActivityDbId(supabase, summary.userId, summary);

    const { data: inserted, error: insertErr } = await supabase
      .from("whatsapp_pending_prompts")
      .insert({
        user_id: summary.userId,
        wa_id: profile.whatsapp_wa_id,
        activity_source: summary.source,
        activity_key: summary.activityKey,
        activity_db_id: activityDbId,
        activity_summary: {
          distance_m: summary.distanceMeters ?? null,
          duration_s: summary.durationSeconds ?? null,
          sport_type: summary.sportType ?? null,
        },
      })
      .select("id")
      .maybeSingle();

    if (insertErr || !inserted) {
      console.warn(`[wa-activity-prompt] insert skipped user=${summary.userId} key=${summary.activityKey}`, insertErr?.message ?? "no row returned");
      return; // already prompted or insert failed
    }

    // Build one-line summary for template variable {{1}}
    const km = summary.distanceMeters && summary.distanceMeters > 0 ? summary.distanceMeters / 1000 : 0;
    const min = summary.durationSeconds && summary.durationSeconds > 0 ? summary.durationSeconds / 60 : 0;
    const paceSec = km > 0 && min > 0 ? Math.round((min / km) * 60) : 0;
    const paceStr = paceSec > 0 ? `${Math.floor(paceSec / 60)}:${String(paceSec % 60).padStart(2, "0")}/km` : "—";
    const oneLine = lang === "zh"
      ? `${km > 0 ? km.toFixed(2) : "—"} 公里，${min > 0 ? min.toFixed(0) : "—"} 分鐘，配速 ${paceStr}`
      : `${km > 0 ? km.toFixed(2) : "—"} km in ${min > 0 ? min.toFixed(0) : "—"} min, pace ${paceStr}`;

    // Send approved Utility template first (bypasses 24h window).
    const templateName = lang === "zh" ? "activity_prompt_cn" : "activity_prompt_en";
    const langCode = lang === "zh" ? "zh_HK" : "en";
    let messageId = await waSendTemplate(profile.whatsapp_wa_id as string, templateName, langCode, oneLine);
    if (!messageId) {
      // Fallback to free-form (works only within 24h window)
      const summaryBlock = fmtSummary(summary, lang);
      const text = lang === "zh"
        ? `🏃 *剛剛完成跑步！*\n\n${summaryBlock}\n\n回覆訊息告訴我這次跑步的 *RPE*（1–10）以及感覺如何（可選），我會為你生成完整的 AI 跑步分析。\n\n例如：7 腿有點累但完成了`
        : `🏃 *Nice run!*\n\n${summaryBlock}\n\nReply with your *RPE* (1–10) and how it felt (optional) and I'll generate your full AI run analysis.\n\nExample: 7 legs heavy but pushed through`;
      messageId = await waSendText(profile.whatsapp_wa_id as string, text);
    }
    if (!messageId) {
      console.warn(`[wa-activity-prompt] send failed user=${summary.userId} key=${summary.activityKey}; removing undelivered pending prompt`);
      await supabase
        .from("whatsapp_pending_prompts")
        .delete()
        .eq("id", (inserted as any).id);
      return;
    }
    console.log(`[wa-activity-prompt] sent user=${summary.userId} key=${summary.activityKey} message_id=${messageId}`);
    await supabase
      .from("whatsapp_pending_prompts")
      .update({ prompt_message_id: messageId })
      .eq("id", (inserted as any).id);
  } catch (e) {
    console.error("[wa-activity-prompt] failed", e);
  }
}
