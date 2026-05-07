# Fix duplicate sync notifications

## What's happening

When a new activity arrives from Garmin (via Terra), you receive **two push notifications** at almost the same moment.

Looking at `supabase/functions/_shared/terraWebhookHandler.ts`:

- The webhook handler treats both `type === "activity"` and `type === "processed_activity"` payloads the same way (line 655). Terra/Garmin commonly delivers **both** events for the same activity, often within seconds of each other.
- For each event, the handler decides "is this new?" by doing a `SELECT` on `terra_activities` for that `terra_activity_id`, then `UPSERT`-ing.
- If the two webhook deliveries arrive close together, both invocations run the `SELECT` before either has finished its `UPSERT`. Both see "no existing row" → both set `isNew = true` → both call `pushActivityUploadedNotification(appUserId)` → **two push notifications**.

A secondary trigger of the same bug: empty-payload pings call `requestActivityHrSamplesWebhook`, which causes Terra to redeliver the activity with samples — another race opportunity for the same activity.

(Note: `apple-health-post-sync` also sends pushes, but it only runs when no Strava/Garmin/Terra connection exists — so it isn't the source here.)

## Fix

Add a server-side de-duplication guard so each activity can only fire one push, regardless of how many webhook events arrive for it.

Approach: introduce a small tracking table and only push when we successfully claim the activity.

### 1. New table `activity_push_log`

Columns:
- `user_id uuid`
- `activity_key text`  (e.g. `terra:<terra_activity_id>`)
- `sent_at timestamptz default now()`
- Unique constraint on `(user_id, activity_key)`
- RLS: service role only

### 2. Update `pushActivityUploadedNotification`

Change the signature to accept the activity key(s) being announced. Before sending:

- Try `INSERT` into `activity_push_log` with `onConflict: do nothing`.
- If the insert returned a new row → send the push.
- If conflict (already logged) → skip silently.

This makes the push idempotent even under concurrent webhook deliveries.

### 3. Call site change in `terraWebhookHandler.ts`

In the `activity` / `processed_activity` branch, collect the `terra_activity_id`s of rows that came in as `isNew`, then call the updated `pushActivityUploadedNotification(appUserId, newKeys)` once. The function itself enforces de-duplication, so even two concurrent webhook executions will only result in one push being sent.

### 4. (Optional cleanup) Same guard in `apple-health-post-sync`

Apply the same `activity_push_log` check inside `sendActivityNotification` keyed by `apple:<start_date>` so the AH path is also safe against re-runs.

## Files touched

- `supabase/migrations/<new>.sql` — create `activity_push_log` table + unique index + RLS
- `supabase/functions/_shared/terraWebhookHandler.ts` — pass activity keys, guard before sending push
- `supabase/functions/apple-health-post-sync/index.ts` — same guard (optional, recommended)

No client-side changes needed.
