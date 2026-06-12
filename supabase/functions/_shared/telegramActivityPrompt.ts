// Sends a Telegram post-run prompt asking for RPE + how the run felt.
// Idempotent per (user_id, source, activity_key) via unique constraint.
// Looks up the actual activity DB row so the reply handler can call analyze-activity.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

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

async function tgSend(chatId: number, text: string): Promise<number | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn("[tg-activity-prompt] sendMessage non-ok", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json().catch(() => null) as any;
    return data?.result?.message_id ?? null;
  } catch (e) {
    console.error("[tg-activity-prompt] send failed", e);
    return null;
  }
}

// Look up the activity DB row id matching this (source, activity_key).
async function lookupActivityDbId(
  supabase: any,
  userId: string,
  summary: ActivitySummary,
): Promise<string | null> {
  try {
    if (summary.source === "strava") {
      const { data } = await supabase
        .from("strava_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("strava_id", Number(summary.activityKey))
        .maybeSingle();
      return data?.id ?? null;
    }
    if (summary.source === "suunto") {
      const { data } = await supabase
        .from("suunto_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("suunto_workout_key", String(summary.activityKey))
        .maybeSingle();
      return data?.id ?? null;
    }
    if (summary.source === "terra") {
      const [provider, ...rest] = String(summary.activityKey).split(":");
      const aid = rest.join(":");
      const { data } = await supabase
        .from("terra_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", provider)
        .eq("terra_activity_id", aid)
        .maybeSingle();
      return data?.id ?? null;
    }
    if (summary.source === "apple_health") {
      // key was `${start_date}:${distance}`. Look up by start_date prefix + close distance.
      const [startDate, distStr] = String(summary.activityKey).split(":");
      const distance = Number(distStr) || 0;
      const { data } = await supabase
        .from("apple_health_activities")
        .select("id, distance")
        .eq("user_id", userId)
        .eq("start_date", startDate)
        .limit(5);
      if (!data?.length) return null;
      const best = data.find((r: any) => Math.abs(Number(r.distance) - distance) < 2) ?? data[0];
      return best?.id ?? null;
    }
  } catch (e) {
    console.warn("[tg-activity-prompt] lookupActivityDbId failed", e);
  }
  return null;
}

export async function maybeSendTelegramActivityPrompt(summary: ActivitySummary): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Only running activities
    const sport = String(summary.sportType ?? "").toLowerCase();
    if (sport && !/run|jog|trail|treadmill/.test(sport)) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id, telegram_activity_feedback, lang")
      .eq("user_id", summary.userId)
      .maybeSingle();

    if (!profile?.telegram_chat_id || !profile?.telegram_activity_feedback) {
      console.log(`[tg-activity-prompt] skipped user=${summary.userId} has_chat=${!!profile?.telegram_chat_id} enabled=${!!profile?.telegram_activity_feedback}`);
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

    // Idempotent insert
    const { data: inserted, error: insertErr } = await supabase
      .from("telegram_pending_prompts")
      .insert({
        user_id: summary.userId,
        chat_id: profile.telegram_chat_id,
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
      console.warn(`[tg-activity-prompt] insert skipped user=${summary.userId} key=${summary.activityKey}`, insertErr?.message ?? "no row returned");
      return; // already prompted or insert failed
    }

    const summaryBlock = fmtSummary(summary, lang);
    const text = lang === "zh"
      ? `🏃 *剛剛完成跑步！*\n\n${summaryBlock}\n\n回覆訊息告訴我這次跑步的 *RPE*（1–10）以及感覺如何（可選），我會為你生成完整的 AI 跑步分析。\n\n例如：\`7 腿有點累但完成了\``
      : `🏃 *Nice run!*\n\n${summaryBlock}\n\nReply with your *RPE* (1–10) and how it felt (optional) and I'll generate your full AI run analysis.\n\nExample: \`7 legs heavy but pushed through\``;

    const messageId = await tgSend(profile.telegram_chat_id as number, text);
    console.log(`[tg-activity-prompt] sent user=${summary.userId} key=${summary.activityKey} message_id=${messageId ?? "null"}`);
    if (messageId) {
      await supabase
        .from("telegram_pending_prompts")
        .update({ prompt_message_id: messageId })
        .eq("id", (inserted as any).id);
    }
  } catch (e) {
    console.error("[tg-activity-prompt] failed", e);
  }
}
