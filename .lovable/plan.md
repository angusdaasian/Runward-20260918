## Goal

1. Add a test environment for Terra so we can validate the HR-samples retry on `angustest.site` without touching the production Garmin webhook flow on `pacecalculator.fun`.
2. Implement the empty-payload retry fix from the previous plan inside the test path first.

## New secrets to add

- `TERRA_DEV_ID_TEST`
- `TERRA_API_KEY_TEST`
- `TERRA_SIGNING_SECRET_TEST`

(Existing `TERRA_DEV_ID`, `TERRA_API_KEY`, `TERRA_SIGNING_SECRET` stay as production.)

## Environment selection

A single edge function deployment serves both sites, so we route by environment per call:

- **terra-auth-init / terra-sync / terra-disconnect**: read the caller origin from `req.headers.get("origin")` (and `success_url` host as fallback). If host is `angustest.site` / `www.angustest.site` / `id-preview--*.lovable.app`, use the `_TEST` credentials; otherwise production. Default success/failure URLs in `terra-auth-init` switch to `https://angustest.site/terra-return?...` for test.
- **terra-webhook**: deploy a second function `terra-webhook-test` (thin wrapper that imports the same logic but forces `env = "test"`). Register *that* URL in the Terra **test** dashboard; production webhook stays untouched. The shared handler picks signing secret + API key based on the `env` flag.

```text
angustest.site ─┐                          ┌─ terra-webhook-test  → TEST creds
                ├─ terra-auth-init ────────┤
pacecalculator ─┘   (chooses creds by host)└─ terra-webhook       → PROD creds
```

## Code changes

### `supabase/functions/_shared/terraEnv.ts` (new)
- Export `getTerraCreds(env: "prod" | "test")` returning `{ devId, apiKey, signingSecret }`.
- Export `pickEnvFromRequest(req, extraHostHints?)` that returns `"test"` when host matches the test allowlist.

### `supabase/functions/terra-auth-init/index.ts`
- Replace direct `Deno.env.get("TERRA_*")` with `getTerraCreds(pickEnvFromRequest(req, [success_url]))`.
- Default success/failure URLs become test-aware.

### `supabase/functions/terra-sync/index.ts`
- Same credential lookup. The env is determined per request; existing logic (including the historical-activity webhook calls already added) is unchanged otherwise.

### `supabase/functions/terra-disconnect/index.ts`
- Same credential lookup.

### `supabase/functions/terra-webhook/index.ts` (refactor)
- Extract the existing handler body into an exported `handleTerraWebhook(req, env)` function.
- Default export keeps wiring for production (`env = "prod"`).
- Inside the handler, replace the three hard-coded `Deno.env.get("TERRA_*")` reads (lines 510/511, 580/581, 746/747) with `getTerraCreds(env)`.
- **Apply the empty-payload retry fix here**:
  - In the `activity` branch, before `for (const a of acts)`: if `acts.length === 0` and `terraUserId` is present, call a new `requestActivityHrSamplesWebhookForDay(terraUserId, todayUtc, env)` that hits `/v2/activity?to_webhook=true&with_samples=true&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` for `today-1` → `today+1`.
  - Add a `startDate`-fallback path inside `requestActivityHrSamplesWebhook` for cases where `startTime` is null.
  - Dedupe key for the empty case: `empty:{terraUserId}:{todayUtc}` (2-min window, same as existing).

### `supabase/functions/terra-webhook-test/index.ts` (new)
- Three-line file:
  ```ts
  import { handleTerraWebhook } from "../terra-webhook/index.ts";
  Deno.serve((req) => handleTerraWebhook(req, "test"));
  ```
- Deployed alongside `terra-webhook`; gets its own public URL.

### Frontend (`src/components/ConnectApps.tsx`)
- No code change required for env selection — the request `Origin` is set automatically by the browser, so the auth-init function infers test vs prod from the host the user is on.

## Setup steps for the user (in Terra dashboard)

1. In the **test** Terra project: set the webhook URL to the new `terra-webhook-test` function URL (Lovable will print it after deploy).
2. Keep the production Terra project pointed at the existing `terra-webhook` URL.
3. Connect Garmin from `angustest.site` so a `terra_connections` row is created using test credentials.

## Validation after deploy

1. From `angustest.site`, connect Garmin → confirm OAuth completes.
2. Trigger a Garmin push (or click Resync).
3. Query `terra_webhook_events where type='terra_hr_samples_retry' order by received_at desc limit 5` — expect rows with HTTP 200.
4. Within ~30 s, the follow-up activity webhook arrives with `payload.data` populated.
5. Confirm `terra_activities.hr_samples` for May 5/6 becomes non-empty.
6. Once verified on test, no production code change is needed — the same handler is already running on prod with prod creds; we only enabled the empty-payload retry path, which is benign for prod.

## Files touched

- new: `supabase/functions/_shared/terraEnv.ts`
- new: `supabase/functions/terra-webhook-test/index.ts`
- edited: `supabase/functions/terra-auth-init/index.ts`
- edited: `supabase/functions/terra-sync/index.ts`
- edited: `supabase/functions/terra-disconnect/index.ts`
- edited: `supabase/functions/terra-webhook/index.ts`

## Secrets I will request after you approve

`TERRA_DEV_ID_TEST`, `TERRA_API_KEY_TEST`, `TERRA_SIGNING_SECRET_TEST`.
