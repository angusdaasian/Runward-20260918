# Fix: terra-webhook still blocks on DB insert

## What's wrong now

In `supabase/functions/_shared/terraWebhookHandler.ts` (lines 987–1006), `handleTerraWebhook` does:

```ts
const raw = await req.text();                       // buffer body
const { error } = await supa.from("terra_webhook_queue").insert({...}); // ~1s round-trip
return new Response(...);                            // only now ACK
```

The `await` on the Postgres insert is the dominant cost. Even with an 11KB body, Terra sees ~1.6s because the function waits for the DB write to complete before returning 200. The previous version (pre-queue) sometimes finished faster simply because the container was warmer or the work happened to overlap with response streaming.

## Fix

Move the queue insert into a background task using `EdgeRuntime.waitUntil`, so the response is returned the moment the body is buffered.

### Change in `supabase/functions/_shared/terraWebhookHandler.ts`

Replace the body of `handleTerraWebhook` (≈ lines 987–1006) with:

```ts
export async function handleTerraWebhook(req: Request, env: TerraEnv = "prod"): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const raw = await req.text();                       // must read before responding
  const sigHeader = req.headers.get("terra-signature");

  // Fire-and-forget: do NOT await the DB insert.
  const enqueue = supa.from("terra_webhook_queue").insert({
    env,
    raw_body: raw,
    signature_header: sigHeader,
  }).then(({ error }) => {
    if (error) console.error("[terra-webhook] enqueue failed", error);
  }).catch((e) => {
    console.error("[terra-webhook] enqueue threw", e);
  });

  // @ts-ignore - EdgeRuntime is provided by the Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(enqueue);
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```

### Why this works

- `req.text()` still must complete before we respond (we need the bytes in memory to enqueue them after responding).
- The Postgres insert — the slow part — now runs after the response is sent. Terra gets its 200 in well under 200ms in steady state.
- If the insert fails, the reconciler cron (`terra-reconcile`) already re-fetches missing payloads from Terra's Supabase destination, so durability is preserved.
- No change to `process-terra-queue` or `terra-reconcile` needed.

### Deploy

Redeploy `terra-webhook` and `terra-webhook-test` (both import the shared handler).

### Verification

After deploy, check Terra's dashboard: a fresh body-mode webhook should drop from ~1.6s to ~100–200ms response time. Confirm rows still land in `terra_webhook_queue` and get drained by `process-terra-queue`.
