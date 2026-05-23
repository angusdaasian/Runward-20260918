
# Goal

Stop doing data processing inside the **Terra** webhook handler. The handler should only enqueue the raw payload and return 200. A separate worker (cron-driven) does signature verification, S3 ping fetch, parsing, upserts, XP recalculation, and push notifications. Strava webhook is left untouched.

Today the Terra webhook returns 200 fast via `EdgeRuntime.waitUntil`, but the heavy work still runs in the same edge function instance with CPU/wall-time limits. A single slow payload (long activity, big GPS arrays, S3 ping fetch) can still time out, fail silently, or get the function instance killed mid-write.

## Changes

### 1. New queue table: `terra_webhook_queue`
Columns:
- `env` (`prod` | `test`)
- `raw_body` (text — full webhook body, untouched)
- `signature_header` (text, nullable)
- `received_at` (default now)
- `status` (`pending` | `processing` | `done` | `failed`)
- `attempts` (int, default 0)
- `last_error` (text, nullable)
- `processed_at` (timestamptz, nullable)

Indexes: partial index on `(received_at)` where `status = 'pending'` for fast worker polling.

RLS: enabled, no policies (service-role only).

Plus a SQL function `claim_terra_webhook_queue(batch_size int)` using `for update skip locked` so multiple worker invocations don't double-process.

### 2. Slim Terra webhook (`supabase/functions/_shared/terraWebhookHandler.ts`)
The `handleTerraWebhook` exported function becomes:
1. Read `req.text()` + `terra-signature` header.
2. `INSERT INTO terra_webhook_queue` (env, raw_body, signature_header).
3. Return 200.

No signature verify, no S3 ping fetch, no payload parsing, no `terra_webhook_events` insert, no `processWebhook`, no `recalcUserXp`, no push notifications inside the request lifecycle.

All current parsing/upsert logic stays in the same file (or moved into a sibling module) and is exported for the worker to call.

### 3. New worker: `supabase/functions/process-terra-queue/index.ts`
- Calls `claim_terra_webhook_queue(25)` to atomically claim up to 25 pending rows.
- For each row:
  - Verify signature (using `env`-specific secret).
  - If payload is S3 ping mode → fetch the pre-signed URL.
  - Insert into `terra_webhook_events` (existing audit log).
  - Run existing `processWebhook` → `recalcUserXp` → push notifications.
  - On success → `status='done'`, `processed_at=now()`.
  - On failure → increment `attempts`; if `< 5` set back to `pending`, else `failed`. Record `last_error`.
- Bounded to ~25 rows / invocation to stay well under edge function wall limits.

### 4. Cron schedule
Add a `pg_cron` job that calls the worker every 30s via `net.http_post` (uses existing `pg_cron` + `pg_net` pattern — inserted via the insert tool, not migration, because URL + anon key are project-specific).

### 5. Safety
- Existing `terra_webhook_events` table unchanged (worker keeps writing it as the audit log).
- Existing `terra-reconcile` cron continues to catch anything that fails permanently.
- Strava webhook (`supabase/functions/strava-webhook/index.ts`) is **not touched**.

## Files touched

- **New migration**: `terra_webhook_queue` table + index + RLS + `claim_terra_webhook_queue` SQL function.
- **New**: `supabase/functions/process-terra-queue/index.ts`
- **Edit**: `supabase/functions/_shared/terraWebhookHandler.ts` — handler shrinks to an enqueue; existing processing functions exported.
- **New insert** (post-migration): pg_cron schedule that pings the worker every 30s.

No frontend changes.

After your approval I'll create the migration first, then write the code.
