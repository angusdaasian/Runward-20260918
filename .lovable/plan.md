## Goal

Verify that no `terra-webhook` (prod) or `terra-webhook-test` invocation exceeds 8000 ms response time. Anything ≥ 8s trips Terra's circuit breaker and stalls downstream activity delivery.

## Context found

- `handleTerraWebhook` (in `supabase/functions/_shared/terraWebhookHandler.ts`) already returns `{ ok: true }` immediately after:
  1. parsing body, 2. verifying signature, 3. inserting one row into `terra_webhook_events`,
  then hands off `processWebhook(...)` to `EdgeRuntime.waitUntil(...)`.
- So HTTP response time ≈ parse + signature verify + 1 insert. Should be well under 1s in normal conditions.
- Quick sample from `function_edge_logs`: max 1726 ms, min ~900 ms — under threshold. But the analytics window in this sandbox only holds ~3 minutes of edge logs, so this is not conclusive.

## Plan

1. **Query analytics over the widest window available**
   Run `supabase--analytics_query` against `function_edge_logs` filtered to the two terra-webhook function IDs (prod + test):
   - distribution of `execution_time_ms` (count, avg, p50, p95, p99, max)
   - list every invocation with `execution_time_ms >= 5000` (warning) and `>= 8000` (breaching) with timestamp + status_code
   - non-200 responses (Terra also retries / opens breaker on 5xx)

2. **Cross-check with DB-side timing**
   `terra_webhook_events.received_at` is set by the insert that runs inside the synchronous response path, so consecutive events from the same Terra batch let us estimate webhook ack latency indirectly. Inspect the last 24h for:
   - rows where `processing_error` is set (downstream failures, not response time, but worth flagging)
   - bursts where many events from the same `terra_user_id` arrived within milliseconds (healthy — means we ack'd fast)

3. **Identify any synchronous work that could blow past 8s**
   Re-scan `handleTerraWebhook` and `verifySignature` for anything that could block the response (network calls, large JSON parsing, oversized payloads written inline). Current code path looks clean — confirm no recent change moved work back inside the request.

4. **Report**
   - Show max / p95 / p99 response time for last available window
   - List any invocations ≥ 8000 ms (timestamps, status)
   - If none found, state that explicitly and note the analytics retention limit
   - If any found, recommend the targeted fix (e.g. move the offending step into `EdgeRuntime.waitUntil`, defer the `terra_webhook_events` insert, or shrink the payload stored)

No code changes in this pass — diagnostic only. Any remediation will be proposed in a follow-up plan once the data is in.
