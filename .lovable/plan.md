## Why Terra reports 2–3s

`terra-webhook` is already enqueue-only at runtime (one INSERT into `terra_webhook_queue`, response returned without awaiting). But its entry file imports `_shared/terraWebhookHandler.ts` — a 1,102-line module containing the full processing pipeline (VDOT/XP recompute, GPS/polyline/elevation/HR/lap/sleep extractors, the `processQueuedTerraWebhook` worker, signature verification, etc.).

Terra calls the webhook in bursts with long idle gaps, so most deliveries hit a **cold isolate**. The isolate must parse + link + evaluate that entire module before the handler runs. That module-eval time is what Terra measures as "response time" — not the INSERT itself.

The fix is to make the webhook entry point depend on *nothing* except the Supabase client and one tiny env helper.

## Changes

### 1. Inline the enqueue handler into `supabase/functions/terra-webhook/index.ts`

Replace the current one-liner that re-exports `handleTerraWebhook` with a self-contained handler:

- Import only `createClient` from `@supabase/supabase-js` and the small `TerraEnv` type.
- Read `req.text()`, grab `terra-signature` header.
- `supa.from("terra_webhook_queue").insert({ env: "prod", raw_body, signature_header })` — not awaited.
- Wrap the insert in `EdgeRuntime.waitUntil(...)` so it completes after the response.
- Return `200 {ok:true}` immediately with CORS headers.

No import of `terraWebhookHandler.ts`. No XP math, no extractors, no worker code loaded.

### 2. Same treatment for `supabase/functions/terra-webhook-test/index.ts`

Mirror the change so test deliveries also get the fast path.

### 3. Keep `_shared/terraWebhookHandler.ts` as-is

`process-terra-queue` and `terra-reconcile` continue to import it — they're the workers and already tolerate 2–3s.

### 4. Verify

- Deploy `terra-webhook` + `terra-webhook-test`.
- Send a test payload via `supabase--curl_edge_functions` and confirm `execution_time_ms` drops well under 300ms even on the first call after deploy (cold).
- Watch Terra dashboard for the next real delivery — expect single-digit-hundreds of ms.

## Expected impact

- Cold-start response: 2–3s → ~150–300ms (TLS + tiny module eval + one INSERT, not awaited).
- Warm response: already fast, will stay <100ms.
- No behavior change: queue rows still drained by `process-terra-queue` every 2 min; reconcile + workers untouched.

## What this does NOT fix

- End-to-end "activity finishes → row in `terra_activities`" latency is still bounded by the 2-minute `process-terra-queue` cron. If you want that lower, that's a separate change (e.g. drop to `*/1`, or have the webhook also `EdgeRuntime.waitUntil` a fire-and-forget call to `process-terra-queue` after enqueue).
