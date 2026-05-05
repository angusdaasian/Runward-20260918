# Fix Terra Webhook 504s (Garmin Daily/Sleep)

## Diagnosis

Looking at `supabase/functions/terra-webhook/index.ts`, the handler does ALL work synchronously before returning `200`:

- For `daily` and `sleep` events it loops over each item and runs an `upsert` with a prior `select` per item (2 round-trips per item).
- For `activity` events it does select+upsert per activity, deletes Garmin duplicates, then runs `recalcUserXp` (which itself does 3+ queries and another profile update).
- Only after all of that does it `insert` the webhook event log and return `200`.

Terra retries any webhook that doesn't return `2xx` within their timeout (~10s). Garmin's initial backfill fires `daily` + `sleep` payloads with many items packed in one POST — the synchronous loop exceeds 10s and the Supabase edge gateway returns `504`. Terra then retries the exact same payload (you can see the same request id `be2a44f5-…` retrying repeatedly in your screenshot), which compounds the load.

The single `200` row (`55e93a70-…`) is a small payload that finished in time.

This is exactly the queue/async pattern from the Lovable stack-overflow note: long work in an edge function → 504.

## Fix

Restructure `terra-webhook` so it acknowledges Terra immediately and processes in the background.

### Changes to `supabase/functions/terra-webhook/index.ts`

1. **Insert the `terra_webhook_events` row first** (right after parsing `payload`, before any processing). Mark `processing_error = null`. This guarantees we always log the receipt, even if the worker crashes.

2. **Return `200` immediately** after the receipt insert.

3. **Run the existing processing logic inside `EdgeRuntime.waitUntil(...)`** (Deno Deploy / Supabase supports this) so it continues after the response is sent. Wrap in try/catch and on error update the previously inserted event row with `processing_error`.

4. **Inside the async worker, parallelize per-item DB work** with `Promise.all` for `daily`, `sleep`, and `activity` loops. Each item's select+upsert is independent.

5. **For `activity` events**, only call `recalcUserXp` once at the end (already the case) — keep as-is, but it now runs in background.

6. **Signature check**: still do it synchronously before responding so we can return `401` for invalid signatures (Terra treats `401` as "stop retrying for auth reasons" — actually they retry on non-2xx too, but at least we reject bad payloads fast). If `secret` is empty (not configured), keep current behavior of accepting.

### Pseudocode shape

```ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const raw = await req.text();
  // ... parse payload, verify signature ...

  // 1. Log receipt synchronously
  const { data: eventRow } = await supa
    .from("terra_webhook_events")
    .insert({ type, terra_user_id, reference_id, signature_valid,
              payload: { type, user, count }, processing_error: null })
    .select("id").single();

  // 2. Schedule background processing
  const work = (async () => {
    try {
      // ... existing per-type handling, parallelized ...
    } catch (e) {
      await supa.from("terra_webhook_events")
        .update({ processing_error: String(e) })
        .eq("id", eventRow.id);
    }
  })();
  // @ts-ignore EdgeRuntime is provided by Supabase edge runtime
  EdgeRuntime.waitUntil(work);

  // 3. Ack immediately
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

### No DB / schema changes
Reuses existing `terra_webhook_events` table for both receipt log and error backfill.

### No frontend changes

## Validation
- After deploy, watch Terra dashboard webhook table — Garmin `Daily` and `Sleep` rows should turn `200` immediately.
- Check `supabase/functions/terra-webhook` logs for any `processing_error` updates to catch background failures.
- Verify `terra_daily_health` rows are still being upserted for the user.
