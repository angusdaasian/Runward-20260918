## Goal
Two scoped changes — Garmin only.

### 1) On Terra Garmin `auth` (new connect or re-connect): wipe Railway Garmin's last 90 days, then re-fetch 90 days from Terra

In `supabase/functions/terra-webhook/index.ts`, inside the `type === "auth"` branch, **only when `provider === "GARMIN"`**:

a. After upserting `terra_connections`, delete the last 90 days of Garmin data from the **Railway Garmin tables** for this user (so Terra becomes the source of truth for that window and we avoid duplicates with the existing Railway sync):

```ts
const since = new Date(Date.now() - 90 * 86400_000);
const sinceISO = since.toISOString();
const sinceDate = sinceISO.slice(0, 10);

await supa.from("garmin_activities")
  .delete()
  .eq("user_id", appUserId)
  .gte("start_time", sinceISO);

await supa.from("garmin_daily_health")
  .delete()
  .eq("user_id", appUserId)
  .gte("date", sinceDate);
```

We do NOT touch `terra_activities` / `terra_daily_health` (Terra's own upserts use `onConflict` so re-ingestion is already idempotent). We also do NOT touch Railway data older than 90 days — that history stays.

b. Trigger Terra's historical re-fetch via `to_webhook=true` so the existing `activity` / `daily` / `sleep` webhook handlers ingest fresh 90-day data:

```
GET https://api.tryterra.co/v2/activity?user_id={terra_user_id}&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&to_webhook=true&with_samples=false
GET https://api.tryterra.co/v2/daily?...
GET https://api.tryterra.co/v2/sleep?...
```
Headers: `dev-id`, `x-api-key`. Fire with `Promise.allSettled`, **do not await** before the webhook returns 200 (Terra requires fast ack). Each fetch wrapped in try/catch; log a `terra_webhook_events` row of `type: "garmin_backfill"` with per-endpoint status for diagnostics.

Other providers (Polar/Suunto/Coros) get no auto-backfill in this change — they remain on manual "Sync now" via `terra-sync`.

### 2) Block Apple Health activity ingestion when Terra Garmin is connected

In `src/hooks/use-apple-health.ts` `saveWorkoutsToDb` (~line 671), extend the existing connected-app guard to also short-circuit on an active Terra Garmin connection:

```ts
const [stravaConn, garminConn, terraGarminConn] = await Promise.all([
  supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
  supabase.from("garmin_connections").select("id").eq("user_id", user.id).maybeSingle(),
  supabase.from("terra_connections").select("id")
    .eq("user_id", user.id).eq("provider", "GARMIN").eq("active", true).maybeSingle(),
]);
if (stravaConn.data || garminConn.data || terraGarminConn.data) {
  console.log("[AppleHealth] Fitness app connected (Strava/Garmin/Terra-Garmin), skipping activity save");
  return 0;
}
```

### What stays the same
- Railway Garmin login/sync code: untouched (the daily cron will simply re-pull anything inside its own window from Garmin if it's still connected; if the user only uses Terra now, the Railway connection will eventually be unused).
- Strava, Polar, Suunto, Coros: untouched.
- `terra-sync`, `terra-disconnect`: untouched.
- No DB schema changes, no frontend UI changes.

### Files touched
- `supabase/functions/terra-webhook/index.ts`
- `src/hooks/use-apple-health.ts`
