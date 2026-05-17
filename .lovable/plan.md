## Scope

A project-wide scan for Cantonese particles (`嘅 咗 咋 喺 唔 嚟 拿拿臨 跑左 仲`) only flags one file:

- `supabase/functions/send-daily-morning-push/index.ts` — the `buildMessage()` `lang === "zh"` branch.

The rest of the `zh` strings (i18n.ts UI strings, Terra "新活動已同步 / 你的最新活動已上傳。", RevenueCat admin alerts) are already standard Traditional Chinese.

## Changes

Rewrite the three Cantonese strings in `send-daily-morning-push/index.ts` → Traditional Chinese (Taiwan, 書面語):

| Current (Cantonese, HK) | New (Traditional, TW) |
|---|---|
| `準備好跑步了嗎?` | `準備好今天的跑步了嗎？` |
| `距離你今個月嘅 {goal}km 目標仲差 {rem} km 咋！拿拿臨出去跑返轉，向目標再邁進一步！🏃‍♂️🔥` | `距離你這個月 {goal} km 的目標還差 {rem} km！趕快出門跑一趟，朝目標再邁進一步吧！🏃‍♂️🔥` |
| `你今個月已經跑左 {cur} km，但如果你再跑多 {toNext} km，就可以向下一個里程碑 {nm} km 進發，仲唔突破自己？🏃‍♂️🔥` | `你這個月已經跑了 {cur} km，再跑 {toNext} km 就能挑戰下一個里程碑 {nm} km，何不再突破一下自己？🏃‍♂️🔥` |

Also fix the inline status in `src/pages/Index.tsx` line 222:
- `切換語言中...` is already standard Mandarin — leave it.
- (No other zh changes needed.)

## Future Cantonese variant (not in this change)

To make the Cantonese addition easy later, also restructure `buildMessage()` so `lang` can be `"en" | "zh" | "yue"` instead of just `"en" | "zh"`:

- Change `buildMessage`'s `lang` param type to `"en" | "zh" | "yue"`.
- Add a third branch reusing the existing Cantonese strings (kept as `yue`).
- In the recipient loop, map `profiles.lang` values: `"yue" → yue`, `"zh" → zh`, else `en`. (No DB CHECK constraint change yet — we'll loosen `profiles.lang` to allow `'yue'` only when the Cantonese option ships.)

## Out of scope

- No DB migration in this change. `profiles.lang` stays `'en' | 'zh'`.
- No edits to `i18n.ts`, Terra push, RevenueCat admin push — they're already TW-style Traditional Chinese.
- No new Cantonese option in the language picker yet.

## Deploy

After the edit, redeploy `send-daily-morning-push` so tomorrow's 08:00 HKT run picks it up.
