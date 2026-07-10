
## Goal
One-off push notifications today at **11:15 AM HKT (03:15 UTC)**:
- **Free users, iOS only** → EN + ZH (Traditional) upgrade prompt
- **Premium users, iOS + Android** → EN + ZH (Traditional) restart-app notice

Traditional Chinese (standard, not Cantonese), with emojis.

## Copy

### Free users (iOS only)
**EN**
- Title: `🎉 Version Update`
- Message: `📱 WhatsApp & Telegram are now live for Premium users! 🚀 Enter code WHATSAPP for a limited 2-week free trial. Please reopen the app to use the latest features. 🔄`

**ZH (Traditional)**
- Title: `🎉 版本更新`
- Message: `📱 WhatsApp 與 Telegram 功能已為 Premium 用戶推出！🚀 輸入優惠碼 WHATSAPP 即可獲得 2 週免費試用。請重新打開APP使用最新功能 🔄`

### Premium users (iOS + Android)
**EN**
- Title: `🎉 Version Update`
- Message: `📱 WhatsApp & Telegram integration is now live! ✨ Please reopen the app to use the latest features. 🔄`

**ZH (Traditional)**
- Title: `🎉 版本更新`
- Message: `📱 WhatsApp 與 Telegram 功能已推出！✨ 請重新打開APP使用最新功能 🔄`

## Changes

### 1. Extend `supabase/functions/send-broadcast-notification/index.ts`
- Add optional `platform` param (`"ios" | "android" | null`). When set, add OneSignal `filters: [{"field":"device_type","relation":"=","value":"0" or "1"}]` alongside `include_external_user_ids` (iOS = `0`, Android = `1`).
- Add `"premium"` to the `audience` union → keeps only users with an unexpired `premium_subscriptions.expires_at`.
- Everything else (lang filter, chunked sends, `self_unschedule`) unchanged.

### 2. Schedule 4 one-off cron jobs via `supabase--insert` (`pg_cron` + `pg_net`)

All fire at `15 3 * * *` (03:15 UTC = 11:15 HKT) and self-unschedule after firing once:

| Job name | audience | lang | platform |
|---|---|---|---|
| `push-free-ios-en-<date>` | free | en | ios |
| `push-free-ios-zh-<date>` | free | zh | ios |
| `push-premium-all-en-<date>` | premium | en | null (all) |
| `push-premium-all-zh-<date>` | premium | zh | null (all) |

Each POST body carries its matching title/message and its own `self_unschedule` job name.

## Technical notes
- `lang` filter reads `profiles.lang` (`en` / `zh`); users without `lang` set are excluded from both language sends (existing behavior).
- If 03:15 UTC has already passed when approved, jobs fire tomorrow at 11:15 HKT.

## Out of scope
- No UI changes; no changes to admin `send-notification`.
