# Simplify terra-webhook to stop 504s

## Problem

Terra still reports 504s. The current `handleTerraWebhook` wraps the work in `EdgeRuntime.waitUntil`, but the background block also performs a `fetch` to `terra-webhook-worker` with `await` and a DB insert. In practice, Deno.serve has been observed to delay flushing the response under load, and the kick `fetch` itself can hang long enough to extend the perceived response time past Terra's 8 s circuit breaker.

The user wants the handler to mirror the Python reference: verify-or-accept, do almost nothing, return 200 immediately.

## Change

Rewrite `handleTerraWebhook` in `supabase/functions/_shared/terraWebhookHandler.ts` to the absolute minimum:

1. If `OPTIONS`, return CORS preflight.
2. `const raw = await req.text()` — read body once, in-request (this is what Terra is already waiting on at the TCP layer; we cannot avoid it).
3. `const sig = req.headers.get("terra-signature")`.
4. `await supa.from("terra_webhook_queue").insert({ env, raw_body: raw, signature_header: sig, status: "pending" })` — single fast insert, no select.
5. `return new Response('{"ok":true}', { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })`.

Remove from the request path:
- `EdgeRuntime.waitUntil` wrapping
- `req.clone()`
- The `fetch` to `terra-webhook-worker` (this was the main latency risk — a hanging worker call would stall the response even inside `waitUntil` if the runtime delayed flush)
- Any signature verification, JSON parse, or `terra_webhook_events` insert

## Worker drain strategy

With the inline worker-kick removed, processing relies on:
- The existing `pg_cron` job that calls `terra-webhook-worker` every minute (already in place).

If the user wants faster drain than 1 min, we can either:
- Tighten the cron to every 10 s (pg_cron supports sub-minute via repeated jobs), or
- Re-add the worker kick but as `fetch(...).catch(()=>{})` with no `await` and no `waitUntil` — fire-and-forget after the response is returned (not reliable on edge runtime, so cron is the safety net regardless).

Default: keep the 1-minute cron, drop the inline kick. Processing latency goes from "near-realtime via kick" to "≤60 s via cron", but Terra's 200 is bulletproof.

## Files

- `supabase/functions/_shared/terraWebhookHandler.ts` — replace `handleTerraWebhook` (lines 1018–1066) with the ~10-line version above. Leave `processQueuedTerraWebhook` and everything else untouched.
- No DB migration. No changes to `terra-webhook-worker` or `terra-webhook` entrypoint.

## Verification

- Redeploy `terra-webhook` and `terra-webhook-test`.
- `curl` the function with a large dummy body, confirm sub-300 ms response from EU.
- Watch Terra dashboard for next webhook batch — response times should drop below 1 s.
- Check `terra_webhook_queue` count grows and `terra-webhook-worker` cron drains it.
