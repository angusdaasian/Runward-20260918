Send a one-off OneSignal push **today at 12:00 HKT (04:00 UTC, ~15 min away)** to free users only, using copy variant B.

Current UTC: `2026-05-29 03:45`. Target cron: `0 4 29 5 *` (fires once today; will fire again same day next year — we'll unschedule right after it runs).

## What gets built

### 1. New edge function: `send-broadcast-notification`
Why a new one (not reusing `send-notification`): the existing function requires an admin JWT, which a cron job doesn't have. This new one is gated by the existing `WEBHOOK_AUTH_KEY` secret (already used elsewhere) and runs with service role.

Behavior:
- Verifies `x-webhook-key` header against `WEBHOOK_AUTH_KEY`.
- Body: `{ title, message, audience: "all" | "free" }`.
- Loads all `profiles.user_id`.
- If `audience === "free"`, loads `premium_subscriptions` where `expires_at > now()` and filters those user_ids out.
- POSTs to OneSignal `include_external_user_ids` in chunks of 2000 (OneSignal limit).
- Returns count of recipients.

### 2. One-off pg_cron job
Schedule via `cron.schedule('one-off-earlybird-push-20260529', '0 4 29 5 *', $$ net.http_post(...) $$)`:
- URL: `https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/send-broadcast-notification`
- Headers: `Content-Type: application/json`, `apikey: <anon>`, `x-webhook-key: <WEBHOOK_AUTH_KEY value>`
- Body:
  ```json
  {
    "title": "早鳥優惠剩 2 日",
    "message": "把握最後 2 日，以早鳥價升級 Premium，價格永久鎖定，日後加價都不受影響。",
    "audience": "free"
  }
  ```

The `WEBHOOK_AUTH_KEY` value will need to be inlined into the cron SQL (it's not accessible from `net.http_post` headers via env). This is fine — the cron SQL only lives in Supabase, not in repo. I'll fetch it via vault or ask you to paste it during the migration step if needed. (Preferred: store under vault `webhook_auth_key` is already there per `invoke_reset_season` — I'll read it the same way.)

Actually cleanest: write the cron SQL as a DO block that pulls `webhook_auth_key` from `vault.decrypted_secrets` (already used by `invoke_reset_season`) and builds the headers jsonb at schedule time. No secret leaks into cron.job table in plaintext beyond what's already there.

### 3. Self-cleanup
Right after the cron fires, the edge function will call `cron.unschedule('one-off-earlybird-push-20260529')` via a small SQL RPC so it never runs again. (Falls back gracefully if already unscheduled.)

## Files

- `supabase/functions/send-broadcast-notification/index.ts` — new
- Migration: create `unschedule_one_off_push(job_name text)` SECURITY DEFINER function (so edge function can clean itself up), and `cron.schedule(...)` the one-off job

## Sequence after you approve

1. Migration runs (creates unschedule helper + schedules the cron).
2. Edge function deploys automatically.
3. At 04:00 UTC, cron hits the function → free users get the push → function unschedules itself.

## Confirm before I build

- Copy variant B with slight tightening — final text I'll send:
  - **Title:** 早鳥優惠剩 2 日
  - **Body:** 把握最後 2 日，以早鳥價升級 Premium，價格永久鎖定，日後加價都不受影響。
- "Free users" = users with **no active premium subscription** (expired or never subscribed). OK?
- Time budget: it's 03:45 UTC now. If approval + migration + deploy takes >15 min we'll miss 04:00. Want me to push the cron to **04:15 UTC (12:15 HKT)** to give a safety margin, or keep 04:00 and risk missing?