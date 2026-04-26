## Goal

Two combined changes:

1. **Garmin OAuth2 auto-refresh** — stop the ~24h "sign-in expired" toasts by transparently refreshing OAuth2 tokens using the long-lived OAuth1 ticket (`garth` / `garminconnect` does this internally on `Garmin().login(tokenstore)`).
2. **Daily Garmin health stats card** — fetch `vo2max`, `resting heart rate`, `sleep duration`, and `sleep score` once per day at **10:00 HKT (02:00 UTC)** and display them at the **top of the Analytics tab** — only if the user has a connected Garmin account. The single daily sync naturally exercises the OAuth2 refresh path so tokens stay fresh without extra calls.

---

## Part 1 — OAuth2 Auto-Refresh

### 1a. Railway backend (`main.py`) — *prepared as a copy-paste patch; not in this repo*
Add two endpoints (or modify existing ones to return refreshed tokens):

```python
import json, tempfile
from pathlib import Path
from garminconnect import Garmin

def _login_with_autorefresh(oauth1: str, oauth2: str):
    """Restore session from stored tokens; garth auto-refreshes OAuth2 if expired."""
    tdir = tempfile.mkdtemp()
    Path(tdir, "oauth1_token.json").write_text(oauth1)
    Path(tdir, "oauth2_token.json").write_text(oauth2)
    g = Garmin()
    g.login(tdir)               # <-- triggers internal refresh if needed
    new_oauth1 = Path(tdir, "oauth1_token.json").read_text()
    new_oauth2 = Path(tdir, "oauth2_token.json").read_text()
    return g, new_oauth1, new_oauth2

@app.post("/garmin-refresh")
def garmin_refresh(body: RefreshBody):
    _, o1, o2 = _login_with_autorefresh(body.oauth1_token, body.oauth2_token)
    return {"oauth1_token": o1, "oauth2_token": o2}

@app.post("/garmin-health-stats")
def garmin_health_stats(body: HealthBody):
    """Return today's vo2max, RHR, sleep duration, sleep score."""
    g, o1, o2 = _login_with_autorefresh(body.oauth1_token, body.oauth2_token)
    today = body.date  # YYYY-MM-DD
    summary  = g.get_user_summary(today) or {}
    sleep    = g.get_sleep_data(today) or {}
    max_metrics = g.get_max_metrics(today) or {}
    return {
        "date": today,
        "vo2max": (max_metrics.get("generic", {}) or {}).get("vo2MaxValue"),
        "resting_hr": summary.get("restingHeartRate"),
        "sleep_seconds": (sleep.get("dailySleepDTO", {}) or {}).get("sleepTimeSeconds"),
        "sleep_score": ((sleep.get("dailySleepDTO", {}) or {}).get("sleepScores", {}) or {}).get("overall", {}).get("value"),
        "oauth1_token": o1,   # always echo back so Supabase can persist any refresh
        "oauth2_token": o2,
    }
```

If the existing activities/details endpoints also return updated tokens (they do internally via `garth`), update them to echo `oauth1_token`/`oauth2_token` in the response so Supabase can re-encrypt and persist them. Existing endpoints continue to work; only the response payload grows.

### 1b. Supabase edge function `garmin-sync`
Add a shared helper `callRailwayWithTokenSync()` that:
- POSTs to Railway, including current decrypted `oauth1_token` / `oauth2_token`.
- If response contains updated `oauth1_token` / `oauth2_token`, re-encrypts via `_shared/garminCrypto.ts` and updates `garmin_connections` (`oauth1_token_encrypted`, `oauth2_token_encrypted`, `last_refreshed_at = now()`).
- On `401`: sets `needs_reauth = true` so the existing UI flow prompts the user to re-link.

Wrap all existing Railway fetches (`/garmin-activities`, `/garmin-activity-details`) with this helper. No business logic changes elsewhere in `garmin-sync`.

### 1c. Database migration
```sql
ALTER TABLE public.garmin_connections
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;
```

---

## Part 2 — Daily Garmin Health Stats

### 2a. New table `garmin_daily_health`
```sql
CREATE TABLE public.garmin_daily_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  vo2max numeric,
  resting_hr integer,
  sleep_seconds integer,
  sleep_score integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
ALTER TABLE public.garmin_daily_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily health"
  ON public.garmin_daily_health FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.garmin_daily_health FOR ALL
  TO service_role USING (true) WITH CHECK (true);
```
(Inserts/updates are done by the edge function using the service role.)

### 2b. New edge function `garmin-daily-health-sync`
- Accepts no user JWT (cron-invoked); validates a header secret (`WEBHOOK_AUTH_KEY`, already in secrets).
- Selects every row from `garmin_connections` where `needs_reauth = false`.
- For each user:
  - Decrypts tokens.
  - POSTs to Railway `/garmin-health-stats` (using the helper from Part 1b — so OAuth2 tokens auto-refresh on this single daily call).
  - Upserts result into `garmin_daily_health` for `date = today HKT`.
  - On 401 → sets `needs_reauth = true`, skips user.
- Logs per-user success/error counts.

Also add a small per-user variant invocation (so the user can manually pull-to-refresh from Analytics): the same function accepts an authenticated user JWT and, when present, syncs only that user.

### 2c. Cron schedule (10:00 HKT daily = 02:00 UTC)
Use `pg_cron` + `pg_net` (insert via insert-tool, not migration, since URL/key are project-specific):
```sql
SELECT cron.schedule(
  'garmin-daily-health-10am-hkt',
  '0 2 * * *',  -- 02:00 UTC daily
  $$ SELECT net.http_post(
       url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/garmin-daily-health-sync',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'x-webhook-key', '<WEBHOOK_AUTH_KEY value>'
       ),
       body := jsonb_build_object('source','cron')
     ); $$
);
```

### 2d. Frontend — new hook & card
- **Hook** `src/hooks/use-garmin-daily-health.ts` — TanStack Query reading `garmin_daily_health` for the current user (latest 7 rows for sparkline-ready data; latest row used for headline values).
- **Component** `src/components/analytics/GarminHealthCard.tsx` — 4-stat grid:
  - VO₂max (ml/kg/min)
  - Resting HR (bpm)
  - Sleep (formatted `Hh Mm`)
  - Sleep score (with colored badge: red <60, yellow 60-79, green ≥80)
  - "Last updated {date}" footer + manual refresh button (calls `garmin-daily-health-sync` with the user's JWT).
- **Visibility**: render only if a `garmin_connections` row exists for the user (use existing `use-garmin` / a lightweight existence query). Card hidden entirely otherwise.

### 2e. Mount in Analytics
Edit `src/components/AnalyticsTab.tsx` so that when `sub === "performance"` the new `GarminHealthCard` renders **above** `PerformanceTab` (inside the same scroll container, so the sub-tab switcher stays sticky-feeling at top). For `posture` sub-tab the card does NOT show.

`PerformanceTab.tsx` is left untouched — the card lives in `AnalyticsTab` to avoid duplicating the "is Garmin connected" check.

---

## Part 3 — Toasts / UX polish
- `src/hooks/use-garmin.ts`: keep existing 401 toast wording but no longer surfaces it for routine 24h expiry (auto-refresh handles it).
- Optional: small "Synced {time}" subtitle on `GarminHealthCard`.

---

## Out of scope
- Strava / Apple Health stats (Garmin only).
- Backfilling historical daily health (only forward-going from first cron tick; user can also tap manual refresh for today).
- Railway deployment is external — I'll provide the ready-to-paste `main.py` patch in chat after approval; everything else lands in this repo.

## Edge cases handled
- User with no Garmin → card hidden, cron skips them.
- User with `needs_reauth = true` → cron skips, card shows last-known values + a "Reconnect Garmin" CTA.
- OAuth2 refresh failure (OAuth1 ticket truly dead) → `needs_reauth = true`, existing reconnect flow takes over.
- Sleep / VO2max may legitimately be null for a given day → render "—" rather than 0.
- Cron runs at 10:00 HKT each day; if a user already pulled manually that day, upsert overwrites with the latest figures (idempotent).