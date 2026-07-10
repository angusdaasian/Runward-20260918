// Shared helpers for handling AI-coach plan-change suggestions in Telegram/WhatsApp bots.
// When the coach surfaces a plan_suggestion, we store it as pending for the user+channel
// and append a confirmation prompt to the outgoing message. On the next inbound message,
// if the user replies yes/no we apply or dismiss the pending suggestion.

export type BotChannel = "telegram" | "whatsapp";
export type Lang = "en" | "zh";

export type PlanSuggestion = {
  plan_id: string;
  summary_en?: string;
  summary_zh?: string;
  changes: Array<{
    date: string;
    type?: string | null;
    distance_km?: number | null;
    pace?: string | null;
    description?: string;
  }>;
};

const YES_RE = /^\s*(yes|y|yeah|yep|sure|ok|okay|confirm|update|apply|do it|go|👍|✅|是|是的|好|好的|可以|更新|確認|确认|更改|改|同意|要|係)\s*[.!。！]*\s*$/i;
const NO_RE = /^\s*(no|n|nope|cancel|don'?t|dont|skip|nah|❌|🚫|不|不要|取消|不用|算了|保留|唔好|否)\s*[.!。！]*\s*$/i;

export function classifyConfirmation(text: string): "yes" | "no" | null {
  const t = (text || "").trim();
  if (!t) return null;
  if (YES_RE.test(t)) return "yes";
  if (NO_RE.test(t)) return "no";
  return null;
}

export function formatSuggestionPrompt(s: PlanSuggestion, lang: Lang): string {
  const summary = (lang === "zh" ? s.summary_zh : s.summary_en) || s.summary_en || s.summary_zh || "";
  const lines = s.changes.slice(0, 6).map((c) => {
    const type = c.type || "?";
    const dist = c.distance_km != null ? ` · ${c.distance_km} km` : "";
    return `• ${c.date} — ${type}${dist}`;
  }).join("\n");
  if (lang === "zh") {
    return `\n\n📋 *更新訓練計劃？*\n${summary ? summary + "\n" : ""}${lines}\n\n回覆 *是* 以更新，或 *否* 以保留原計劃。`;
  }
  return `\n\n📋 *Update your training plan?*\n${summary ? summary + "\n" : ""}${lines}\n\nReply *YES* to update, or *NO* to keep the current plan.`;
}

export async function storePendingSuggestion(
  supabase: any,
  userId: string,
  channel: BotChannel,
  s: PlanSuggestion,
): Promise<void> {
  try {
    await supabase.from("bot_pending_plan_suggestions").upsert({
      user_id: userId,
      channel,
      plan_id: s.plan_id,
      changes: s.changes,
      summary_en: s.summary_en ?? null,
      summary_zh: s.summary_zh ?? null,
      created_at: new Date().toISOString(),
    }, { onConflict: "user_id,channel" });
  } catch (e) {
    console.warn("[bot-plan-suggestion] store failed", e);
  }
}

export async function clearPendingSuggestion(
  supabase: any,
  userId: string,
  channel: BotChannel,
): Promise<void> {
  try {
    await supabase.from("bot_pending_plan_suggestions")
      .delete().eq("user_id", userId).eq("channel", channel);
  } catch (e) {
    console.warn("[bot-plan-suggestion] clear failed", e);
  }
}

export async function getPendingSuggestion(
  supabase: any,
  userId: string,
  channel: BotChannel,
): Promise<PlanSuggestion | null> {
  try {
    const { data } = await supabase.from("bot_pending_plan_suggestions")
      .select("plan_id, changes, summary_en, summary_zh, created_at")
      .eq("user_id", userId).eq("channel", channel).maybeSingle();
    if (!data) return null;
    // Auto-expire after 30 minutes.
    const ageMs = Date.now() - new Date(data.created_at).getTime();
    if (ageMs > 30 * 60 * 1000) {
      await clearPendingSuggestion(supabase, userId, channel);
      return null;
    }
    return {
      plan_id: data.plan_id,
      summary_en: data.summary_en ?? undefined,
      summary_zh: data.summary_zh ?? undefined,
      changes: Array.isArray(data.changes) ? data.changes : [],
    };
  } catch (e) {
    console.warn("[bot-plan-suggestion] read failed", e);
    return null;
  }
}

export async function applyPendingSuggestion(
  userId: string,
  s: PlanSuggestion,
): Promise<{ ok: boolean; days_updated?: number; error?: string }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-running-coach?action=apply_plan_suggestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "x-internal-secret": SERVICE_KEY,
      },
      body: JSON.stringify({
        internalUserId: userId,
        plan_id: s.plan_id,
        changes: s.changes,
      }),
    });
    const data = await resp.json().catch(() => ({} as any));
    if (!resp.ok) return { ok: false, error: data?.error || `HTTP ${resp.status}` };
    return { ok: true, days_updated: data?.days_updated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
