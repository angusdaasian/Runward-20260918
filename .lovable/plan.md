## Goal

One-off push notification today at **12:00 PM HKT (04:00 UTC)** to **free users who have NOT used a trial this month**, on **iOS + Android**, in each user's opted-in language (EN or ZH-Traditional).

## Copy

### English (audience: `lang = en`)
- Title: `🎁 Free 2-Week Premium Trial`
- Message: `Help us test our new WhatsApp & Telegram features! 🚀 Use code WHATSAPP to unlock 2 weeks of Premium for free. Redeem via "Enter Coupon Code" in the Settings tab. ⏰ Limited time.`

### 繁體中文 (audience: `lang = zh`)
- Title: `🎁 免費 2 週 Premium 試用`
- Message: `幫我們測試全新 WhatsApp 與 Telegram 功能！🚀 輸入優惠碼 WHATSAPP 即可免費解鎖 2 週 Premium。請於「設定」分頁的「輸入優惠碼」中兌換。⏰ 限時優惠。`

## Changes

Schedule **2 one-off cron jobs** via `supabase--insert` (`pg_cron` + `pg_net`), both hitting the existing `send-broadcast-notification` edge function (no code changes — it already supports `audience: "free_no_trial_this_month"` and `lang` filtering, and iOS+Android is its default when `platform` is omitted).

Both fire at `0 4 * * *` (04:00 UTC = 12:00 HKT) and self-unschedule after firing once:

| Job name | audience | lang | platform |
|---|---|---|---|
| `push-free-notrial-en-2026-07-14` | free_no_trial_this_month | en | (all) |
| `push-free-notrial-zh-2026-07-14` | free_no_trial_this_month | zh | (all) |

Each POST body carries its matching title/message and its own `self_unschedule` job name.

## Technical notes

- Uses existing `send-broadcast-notification` function — no edge-function edits, no migrations.
- `lang` filter reads `profiles.lang`; users without `lang` set are excluded from both sends (existing behavior).
- Free = no active `premium_subscriptions.expires_at`; "no trial this month" = no `is_trial` sub activated since the 1st of this UTC month.
- If 04:00 UTC has already passed when approved, I'll shift the cron expression to a few minutes from now so it still fires today.

## Out of scope

- No UI changes, no admin panel changes, no edge-function code changes.