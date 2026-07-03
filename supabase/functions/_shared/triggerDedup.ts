// Fire-and-forget cross-platform dedup trigger.
// Call after any new activity is ingested for a user.
// Uses EdgeRuntime.waitUntil so it never blocks the caller response.

const DEDUP_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/dedup-activities-cross-platform`;

export function triggerCrossPlatformDedup(userId: string, sinceHours = 72) {
  if (!userId) return;
  const key = Deno.env.get("WEBHOOK_AUTH_KEY");
  if (!key) {
    console.warn("[triggerDedup] WEBHOOK_AUTH_KEY missing, skipping");
    return;
  }
  const p = fetch(DEDUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-key": key,
    },
    body: JSON.stringify({ userId, sinceHours, dryRun: false }),
  })
    .then(async (r) => {
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.warn(`[triggerDedup] user=${userId} status=${r.status} body=${t.slice(0, 200)}`);
      } else {
        console.log(`[triggerDedup] user=${userId} ok`);
      }
    })
    .catch((e) => console.warn(`[triggerDedup] user=${userId} error`, e));

  try {
    // @ts-ignore EdgeRuntime is available on Supabase Edge
    EdgeRuntime.waitUntil(p);
  } catch {
    // ignore; runs detached anyway
  }
}
