# One-time push to remaining Terra users: 00:00 HKT, 9 Oct

## What users will see
Users who still have an active Terra connection get one push in Traditional Chinese at 00:00 Hong Kong time on 9 October (16:00 UTC on 8 October):

- Title: 「請重新連接你的手錶」
- Message: 「為確保你的跑步紀錄繼續自動同步，請前往 RunWard 重新連接你的手錶（Garmin、COROS、Suunto 等）。只需一分鐘即可完成！」

The message only says "watch connection" and never names a provider service. Every recipient gets the Chinese version, as requested.

## Steps
1. Before sending, run a dry run that lists the recipients (users with active Terra connections, one entry per person) and reports the count.
2. Schedule a single OneSignal notification for those user IDs. Use OneSignal's built-in `send_after` set to `2026-10-08T16:00:00Z`, so no recurring database job is needed.
3. Confirm the scheduled notification ID and recipient count, then share them with you.
4. Nothing is added to the changelog, because this is a one-off message and not a feature.

## Technical details
- A small one-off edge function `terra-reconnect-push` (service role) reads distinct `user_id` from `terra_connections` where `active = true`. It supports `dryRun` and sends with `include_external_user_ids` in batches of 2,000 or fewer, plus `send_after`.
- It uses the existing `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` secrets.
- It is invoked once by me and is not put on a schedule. Afterwards it can be deleted.
- It does not touch the Terra deauth or inactivity jobs.
