// Fire-and-forget: trigger ai-running-coach `train_user_model` for a user
// the first time they sync activities. Idempotent via the `_trained_2026_at`
// insight marker that train_user_model writes on success.
//
// Uses EdgeRuntime.waitUntil so the background task is allowed to complete
// after the parent function returns its HTTP response.
export async function maybeTrainCoachOnce(
  admin: any,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  try {
    const { data: existing } = await admin
      .from("ai_coach_insights")
      .select("id")
      .eq("user_id", userId)
      .eq("insight_key", "_trained_2026_at")
      .maybeSingle();
    if (existing) return;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url = `${SUPABASE_URL}/functions/v1/ai-running-coach?action=train_user_model`;

    const p = fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ internalUserId: userId }),
    })
      .then((r) => {
        if (!r.ok) console.warn(`[trainCoachOnce] ${userId} HTTP ${r.status}`);
      })
      .catch((e) => console.warn(`[trainCoachOnce] ${userId} threw`, e));

    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(p);
  } catch (e) {
    console.warn("[trainCoachOnce] error", e);
  }
}
