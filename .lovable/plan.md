## Change
Broaden the Apple Health save guard in `src/hooks/use-apple-health.ts` (`saveWorkoutsToDb`, ~line 671) so it short-circuits when **any** active Terra connection exists — not just Garmin.

Replace the current Terra-Garmin-only check with an active-any-provider check:

```ts
const [stravaConn, garminConn, terraConn] = await Promise.all([
  supabase.from("strava_connections").select("id").eq("user_id", user.id).maybeSingle(),
  supabase.from("garmin_connections").select("id").eq("user_id", user.id).maybeSingle(),
  supabase.from("terra_connections").select("id")
    .eq("user_id", user.id).eq("active", true).limit(1).maybeSingle(),
]);
if (stravaConn.data || garminConn.data || terraConn.data) {
  console.log("[AppleHealth] Fitness app connected (Strava/Garmin/Terra), skipping activity save");
  return 0;
}
```

No other changes. Webhook backfill logic stays Garmin-only (as previously approved).

### Files touched
- `src/hooks/use-apple-health.ts`
