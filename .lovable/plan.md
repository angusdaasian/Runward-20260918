## Goal

When a user disconnects Garmin, **keep their past Garmin activities** in the database. Apple Health should only fill in activities **after** the most recent Garmin activity (so no duplicates with historical Garmin runs). When the user reconnects Garmin later, resume the sync from the last stored Garmin activity date.

## Findings

1. **`supabase/functions/garmin-sync/index.ts` (action `disconnect`)** — currently deletes both `garmin_connections` AND `garmin_activities`. This is what we need to change.
2. **`src/hooks/use-apple-health.ts` → `saveWorkoutsToDb`** — currently checks if a `garmin_connections` row exists; if yes, skips saving Apple Health workouts entirely. After disconnect this guard releases, but there's no per-workout date filter to avoid overwriting/duplicating the historical Garmin window.
3. **Garmin sync window logic** — already uses the latest `start_time` in `garmin_activities` to compute the incremental window (`windowStart = max(lastSynced - 7d, FIRST_SYNC_START)`). So if we **keep** historical garmin_activities on disconnect, reconnecting will naturally resume from the last activity. No change needed here beyond removing the bug where reconnect triggers a full-resync wipe.
4. **`full_resync_done` flag** lives on `garmin_connections` — that row gets deleted on disconnect, so on reconnect it starts as `false` and the "month-check" branch runs. Since historical activities still exist (after our fix), the month-check will find activities in every month and skip the wipe — good. But to be safe we'll explicitly set `full_resync_done = true` on the new connection if historical activities exist.
5. **Railway `main.py`** — lives in the external Garmin service (referenced via `GARMIN_RAILWAY_URL` secret), not in this repo. It already accepts `start_date` / `end_date` parameters and is driven entirely by `garmin-sync`. **No `main.py` change required** — all sync-window logic is server-side in our edge function.

## Changes

### 1. `supabase/functions/garmin-sync/index.ts` — disconnect action
Stop deleting `garmin_activities`. Only delete the connection row.

```ts
if (action === "disconnect") {
  await supabase.from("garmin_connections").delete().eq("user_id", user.id);
  // Intentionally keep garmin_activities so history is preserved.
  // Apple Health sync (if any) will only fill in dates AFTER the last
  // Garmin activity to avoid duplicates.
  return new Response(JSON.stringify({ success: true }), { ... });
}
```

### 2. `supabase/functions/garmin-sync/index.ts` — sync action
- Remove the unconditional purge of `apple_health_activities` at the top of `sync` (lines 121-131). It will be replaced by the per-workout filter on the Apple Health side. We still want Garmin to be the source of truth for the period it covers, so instead of full purge, only delete AH rows whose `start_date >= earliest garmin activity start_time` (i.e., the period now covered by Garmin).
- After successfully fetching tokens on a reconnect, if any historical `garmin_activities` exist for the user, set `full_resync_done = true` on the freshly-created connection so the month-check / wipe branch is skipped.

### 3. `src/hooks/use-apple-health.ts` — `saveWorkoutsToDb`
Replace the "skip entirely if Garmin connected" guard with a date-aware filter:

- If a Garmin connection exists → keep current behavior (skip all AH workouts; Garmin owns activities live).
- If no Garmin connection but historical `garmin_activities` exist → fetch the **max `start_time`** from `garmin_activities`, and only insert AH workouts whose `start_date > lastGarminTime`. This stops AH from re-creating duplicates of pre-disconnect Garmin history.
- If no Garmin connection and no historical Garmin activities → save all AH workouts (current default).

```ts
// pseudo-code inside saveWorkoutsToDb
const garminConn = await supabase.from("garmin_connections").select("id")...maybeSingle();
if (garminConn.data) return 0; // live Garmin owns activities

const { data: lastGarmin } = await supabase
  .from("garmin_activities")
  .select("start_time")
  .eq("user_id", user.id)
  .order("start_time", { ascending: false })
  .limit(1)
  .maybeSingle();

const cutoff = lastGarmin?.start_time ? new Date(lastGarmin.start_time).getTime() : 0;
const filtered = normalizedWorkouts.filter(w => new Date(w.start_date).getTime() > cutoff);
// proceed with insert/update on `filtered` instead of `normalizedWorkouts`
```

### 4. `src/components/ConnectApps.tsx` — copy + UX
- Update the disconnect confirmation copy (toast + the Apple Health info text) to reflect that **past Garmin activities are kept**, and Apple Health will only sync new activities going forward.
- Optional: when user reconnects Garmin and historical data exists, show "Resuming from {date}" toast.

### 5. `src/hooks/use-garmin.ts` — disconnect toast
Update the success toast to clarify history is preserved:
- EN: "Garmin disconnected — past activities kept"
- ZH: "已中斷 Garmin 連結，過往活動已保留"

## Out of scope / not changing
- **Railway `main.py`** — not in this repo, no changes needed; existing `start_date`/`end_date` params suffice for incremental resume.
- The full-resync month-check logic (works correctly once historical data is preserved).
- XP / training-score recompute paths (unchanged).

## Edge cases handled
- User disconnects → reconnects same Garmin: resumes from last activity, no wipe (month-check passes).
- User disconnects Garmin → uses Apple Health for a few weeks → reconnects Garmin: AH activities for the gap remain; new Garmin activities upsert by `garmin_activity_id` (no conflict with AH rows since they're in a different table).
- User has only Apple Health (never connected Garmin): unchanged behavior — all AH workouts saved.
- User connects Garmin for the first time after using Apple Health: first-sync still purges overlapping AH activities (kept this behavior, just scoped by date instead of full wipe).
