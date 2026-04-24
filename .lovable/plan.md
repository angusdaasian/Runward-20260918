# Plan — Add Sahha.ai test connection in Connect Apps

## Goal
Add a **Sahha.ai** card to the Connect Apps screen (alongside Apple Health / Garmin / Strava) so you can:
1. Register the current user as a Sahha "profile" (using their Supabase `user.id` as the `externalId`)
2. Pull back data (scores + biomarkers) on demand to verify the API works end-to-end
3. Display fetched data inline (raw JSON + a small summary) for testing

This is **test-only scaffolding** — no Garmin tie-in yet. Later we can swap the data source from Sahha sandbox → Sahha Garmin once you've verified the pipeline.

---

## How Sahha works (relevant facts)

- Two credential pairs in the Sahha dashboard:
  - **`clientId` / `clientSecret`** → exchange for an **account token** (server-side, 24h expiry)
  - **`appId` / `appSecret`** → only used by mobile SDK
- We use the **server-side / REST** path because we don't have a mobile SDK in this web app
- Flow:
  1. `POST /api/v1/oauth/account/token` with clientId/secret → `accountToken`
  2. `POST /api/v1/oauth/profile/register` with `{ externalId: user.id }` → `profileToken` + `refreshToken`
  3. `GET /api/v1/profile/score/{externalId}` with account token → scores
  4. `GET /api/v1/profile/biomarker/{externalId}` → biomarkers
- Sandbox base URL: `https://sandbox-api.sahha.ai`
- Test data: you can create a **Sample Profile** in the Sahha dashboard and use that profile's externalId, OR use the Demo App to push real phone data

---

## Architecture

### 1. Secrets (Supabase)
Two new secrets to add to the Supabase project:
- `SAHHA_CLIENT_ID`
- `SAHHA_CLIENT_SECRET`

(I'll prompt you for these via the secrets tool once you approve the plan. You'll get them from https://app.sahha.ai/dashboard/credentials)

### 2. Database (one new table)
`sahha_connections` — tracks which users have "connected" Sahha (i.e. been registered as a profile):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | not null, unique |
| `external_id` | text | what we sent to Sahha (= user.id as string) |
| `profile_token` | text | encrypted at rest? for test phase: plain. Note below. |
| `refresh_token` | text | |
| `connected_at` | timestamptz | default now() |
| `last_synced_at` | timestamptz | nullable |

RLS: only the owning user can `SELECT` their row. Inserts/updates only via edge function with service-role key.

> **Security note:** for a test integration storing the profile token in plaintext is acceptable. If you later promote this to production we'd encrypt it the same way Garmin tokens are (using `GARMIN_ENC_KEY`-style approach). I'll flag this in a code comment.

### 3. Edge function — `sahha-connect`
Single function with action-based dispatch (mirrors how `garmin-sync` works in your codebase):

| `action` | What it does |
|---|---|
| `connect` | 1) Get account token from clientId/secret. 2) Register profile with `externalId = user.id`. 3) Upsert into `sahha_connections`. Returns `{ success: true }`. |
| `fetch_scores` | Get account token, call `/profile/score/{externalId}?types=activity,sleep,wellbeing,readiness,mental_wellbeing` for the connected user. Returns raw scores JSON. |
| `fetch_biomarkers` | Same pattern, calls `/profile/biomarker/{externalId}` (with default `categories` and last-7-days date range). Returns raw JSON. |
| `disconnect` | Delete row from `sahha_connections`. |

The function:
- Reads `SAHHA_CLIENT_ID` / `SAHHA_CLIENT_SECRET` from `Deno.env`
- Caches the account token in-memory per cold start (24h expiry, so usually just one fetch per warm container)
- Uses sandbox URL `https://sandbox-api.sahha.ai` (hardcoded for test phase; can be made configurable later)
- Verifies the caller's JWT via the Supabase service-role client, derives `user_id` server-side (never trusts client-provided IDs)

### 4. Frontend — new hook `src/hooks/use-sahha.ts`
Mirrors the shape of `use-garmin.ts`:
- `connect()` → invokes `sahha-connect` with `action: "connect"`
- `fetchScores()` → returns scores JSON
- `fetchBiomarkers()` → returns biomarkers JSON
- `disconnect()`
- `loading`, `lastResult` state

### 5. Frontend — Connect Apps card
Add a new card to `src/components/ConnectApps.tsx` between Garmin and Strava sections:

- **Heading:** "Sahha.ai (Test)"
- **Subtitle:** "Test passive health data collection — sandbox environment"
- **Connect button** when not connected → calls `sahha.connect()`
- **When connected:** show
  - ✅ Connected status
  - Two test buttons: **"Fetch Scores"** and **"Fetch Biomarkers"**
  - A collapsible `<pre>` block below showing the last raw JSON response (so you can verify what's actually coming back)
  - **Disconnect** link
- A small info banner explaining: *"This is a test integration. To see real data, create a Sample Profile or use the Demo App in the Sahha dashboard with externalId = your user ID: `<user.id>`"* — with a copy-to-clipboard button for the user ID.

The card sits **outside** the "one fitness app at a time" exclusivity rule (it doesn't write to `garmin_activities` etc.), so it can be connected alongside anything.

### 6. i18n
Add translation keys (en/zh):
- `sahhaTitle`: "Sahha.ai (Test)" / "Sahha.ai（測試）"
- `sahhaDesc`: "Test health intelligence integration" / "測試健康數據整合"
- `sahhaFetchScores`, `sahhaFetchBiomarkers`, `sahhaCopyUserId`, etc.

---

## What I'll build (file-by-file)

| File | Change |
|---|---|
| `supabase/migrations/<ts>_sahha_connections.sql` | new table + RLS policies |
| `supabase/functions/sahha-connect/index.ts` | new edge function (4 actions) |
| `supabase/config.toml` | register the new function (verify_jwt = true) |
| `src/hooks/use-sahha.ts` | new hook |
| `src/components/ConnectApps.tsx` | add Sahha card with test UI |
| `src/lib/i18n.ts` | new keys |

Two new secrets to add: `SAHHA_CLIENT_ID`, `SAHHA_CLIENT_SECRET`.

---

## Testing path after implementation
1. You add Sahha credentials when prompted
2. Open Connect Apps → tap "Connect" on Sahha card → row created in `sahha_connections`
3. Go to https://app.sahha.ai/dashboard/profiles → create a Sample Profile with externalId = (the user ID shown in the card)
4. Back in app → tap "Fetch Scores" → JSON appears below the card
5. Tap "Fetch Biomarkers" → JSON appears

Once that pipeline is verified, the next step (separate task) would be: enable Garmin as a data source inside Sahha's dashboard → swap our backend to fetch real Garmin data via Sahha → eventually replace the Railway `garmin-sync` flow.

---

## Open questions before I build

1. **Environment** — start with **sandbox** (`sandbox-api.sahha.ai`)? Production base URL is the same but at `api.sahha.ai`. I'll hardcode sandbox for testing; easy to switch via a constant later.
2. **Token storage** — store profile token plaintext for the test phase (with a code-comment TODO to encrypt before production)?
3. **Score types to fetch** — default to all five (`activity, sleep, wellbeing, readiness, mental_wellbeing`)? You can untick in the UI later if you want.

If those defaults are fine, just say "go" and I'll switch to default mode and ask you to paste the two Sahha credentials.