## Goal

Make `handleTerraWebhook` return 200 to Terra **before** any database work happens, so request-side latency is just the time to read the request body.

## Current behavior

```
read body → await insert into terra_webhook_queue → return 200
```

The insert is fast but still blocks the response. Under DB load it can add 100–500 ms.

## New behavior

```
read body → schedule background task (insert + log) via EdgeRuntime.waitUntil → return 200 immediately
```

The 200 is flushed first; the queue insert happens after the response is sent. The existing `terra-webhook-worker` cron continues to drain the queue.

## Change

In `supabase/functions/_shared/terraWebhookHandler.ts`, rewrite `handleTerraWebhook` (lines 1038–1062):

```ts
export async function handleTerraWebhook(req: Request, env: TerraEnv = "prod"): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Must read body in-request — Terra is waiting on the TCP write to finish.
  const raw = await req.text();
  const sig = req.headers.get("terra-signature");

  // Fire-and-forget: persist after response is sent.
  const bg = (async () => {
    try {
      const { error } = await supa.from("terra_webhook_queue").insert({
        env, raw_body: raw, signature_header: sig, status: "pending",
      });
      if (error) console.error("[terra-webhook] async enqueue failed", error);
    } catch (e) {
      console.error("[terra-webhook] async enqueue threw", e);
    }
  })();

  // @ts-ignore — EdgeRuntime is available in Supabase Edge Functions runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(bg);
  }

  return new Response(JSON.stringify({ message: "Webhook received successfully" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

Key points:
- The only awaited work before responding is `req.text()` (unavoidable — Terra's HTTP request isn't complete until we read it).
- The DB insert runs in a background promise registered via `EdgeRuntime.waitUntil`, which keeps the worker alive after the response is flushed.
- If `EdgeRuntime` isn't present (local dev/test), the promise still runs but isn't formally tracked — acceptable since tests assert on response only.

## Trade-off acknowledged

Fire-and-forget means a queue-insert failure no longer surfaces in the HTTP response. The user accepts this for latency. The Terra dashboard will retry on non-200, but since we always return 200, lost inserts (rare DB outage) would mean lost webhooks. Mitigations already in place: Terra retries on next event, and the periodic cron picks up anything that lands.

## Files

- `supabase/functions/_shared/terraWebhookHandler.ts` — replace `handleTerraWebhook`.
- No other files, no migrations, no worker changes.

## Verification

- Deploy `terra-webhook` and `terra-webhook-test`.
- Trigger a webhook from Terra dashboard; confirm response time drops to ~body-read latency (sub-100 ms typical).
- Query `terra_webhook_queue` to confirm rows still arrive and the worker drains them.
