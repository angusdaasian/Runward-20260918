# Inactivity reminders and auto-disconnect for watch connections (Stridee)

## What users will see
- A free user who hasn't opened the app for 25 days gets a daily push: "Your watch connection will disconnect in N day(s). Open the app to keep it — or upgrade to Premium to keep it forever."
- One push per day on days 25, 26, 27, 28, 29 (5, 4, 3, 2, 1 days left), in the user's in-app language (Traditional Chinese or English).
- On day 30 of inactivity, the watch connection is disconnected automatically.
- Opening the app at any point resets the countdown (based on last login).
- Premium users are always exempt, same as Terra.

## Steps
1. New daily job `stridee-inactivity-sweep`, run once a day at 00:00 HK time (same time as the Terra sweep).
2. For each active watch connection of a non-premium user:
   - inactive 25–29 days → send the reminder push (language from profiles.lang)
   - inactive 30+ days → disconnect (revoke with the provider, mark the connection inactive / remove it, stop auto-sync) and send a short "disconnected" push
3. Supports a dry-run mode so I can check who would be affected before it goes live; I'll run a dry run first and report the list.
4. Changelog entry (minor version), worded generically: "Inactive free accounts now get daily reminders before watch connections are disconnected after 30 days."

## Technical details
- New edge function `supabase/functions/stridee-inactivity-sweep/index.ts`, modeled on `terra-inactivity-sweep`: reads `stridee_connections` + `profiles (is_premium, last_login, lang)`, OneSignal send via existing `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY`, language via `_shared/appLanguage.ts`.
- Disconnect reuses the existing Stridee disconnect logic (from `stridee-connect`) so behavior matches a manual disconnect.
- Daily pg_cron at 16:00 UTC calling the function (1 run/day).
- Terra sweep left unchanged (still monthly cycle).
- Processing is sequential, one connection at a time, to keep database load low.
