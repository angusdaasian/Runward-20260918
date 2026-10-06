# Security warnings review (102 findings)

No changes have been made yet. The findings fall into four risk levels.

## Critical: anyone on the internet can do these (no sign-in needed)
1. **Read the Strava app secrets.** `get_strava_app_secrets` returns the decrypted client secret and verify token for any Strava app ID.
2. **Overwrite the Strava app secrets.** With `set_strava_app_secret`, anyone could replace them and break Strava sync.
3. **Stop scheduled jobs.** `unschedule_cron_job` takes any job name, so anyone could turn off syncs, pushes or sweeps. The three `unschedule_terra_*` functions can each stop one fixed job.
4. **Trigger a leaderboard season reset.** `invoke_reset_season` calls the reset endpoint with the internal webhook key.

## Medium: leaks a little information
- `get_group_push_recipients`: given any user ID, it lists that person's group mates and their app language.
- `get_posture_averages`, `get_leaderboard`, `get_social_feed`, `get_activity_comments` / `likes` / `social_counts`: callable without signing in. Most check permissions inside, but this should be confirmed one by one.
- `consume_rate_limit`: anyone could use up an OAuth partner app's request allowance.

## Low: safe in practice (noise)
- Trigger-only functions: `handle_new_user`, `assign_admin_role`, `prevent_trial_reset`, `guard_oauth_apps_update`, `enforce_single_fitness_provider_*`, `tg_*`. They only run when data changes, and calling them directly does nothing.
- `has_role`, `user_has_other_fitness_provider`, `gen_group_invite_code`, `can_view_social_activity`, `social_activity_owner`: helpers that only return yes/no answers or codes.
- 62 "signed-in users can run" warnings on group, leaderboard, chat and routes functions. These are meant to be called by the app and check the user inside.

## Info: 7 internal tables with no access rules
`territory_sync_state`, `terra_webhook_queue`, `oauth_auth_codes`, `terra_today_oneoff_queue`, `bot_pending_plan_suggestions`, `dedup_debounce`, `stridee_sync_state`. These are blocked to the app by default, and only the server reaches them. This is correct; no fix is needed.

## Proposed fix (after your approval)
1. Lock the critical functions so only the server can call them: Strava secrets, cron unschedulers and season reset.
2. Remove public access from `get_group_push_recipients` and `consume_rate_limit`.
3. Remove direct call access from trigger-only functions. The triggers keep working.
4. Check the remaining public social functions one at a time, and restrict any that the signed-out pages don't need.
5. Run the linter again and confirm the app, leaderboard, groups and Strava sync still work.

## Technical details
- `REVOKE EXECUTE ... FROM anon, authenticated, public; GRANT EXECUTE ... TO service_role` for the critical, medium and trigger groups.
- Before revoking, search `src/` for `.rpc(` calls, so nothing the browser uses gets locked.
