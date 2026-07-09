## Goal

Reformat the WhatsApp daily suggestion template body so each field is on its own indented line, in both English and Traditional Chinese, then trigger a test send.

## Target format

```
Today Training, Type: Easy Run
   Distance: 5.0 km
   Pace Suggestion: 6:00 min/km
   Heart Rate Suggestion: 130 bpm - 145 bpm
Enter YES or DETAIL to know more.
```

Chinese equivalent:
```
今日訓練，類型：輕鬆跑
   距離：5.0 公里
   建議配速：6:00 min/km
   建議心率：130 bpm - 145 bpm
回覆 YES 或 詳細 以了解更多。
```

## Changes

1. **`supabase/functions/generate-suggested-workout/index.ts`** — rewrite the `compact` branch prompts (en + zh) so the model returns exactly the plain-text 5-line shape above (no Markdown, no bullets, three-space indent on the middle 3 lines). Include Heart Rate range derived from recent runs / plan.

2. **`supabase/functions/send-daily-whatsapp-workout/index.ts`** — since output is already plain text, drop `formatWhatsAppMarkdown` (which would strip our leading spaces via the `{4,}` collapse) and also stop appending the "Want a fuller breakdown…" CTA (the new template body already contains the YES/DETAIL line). Keep the 900-char safety cap.

3. **Test send** — after deploying, call the `wa-test-templates` edge function (or a targeted invocation of `send-daily-whatsapp-workout` for the single test user `angchenghk@gmail.com` / wa_id `85291588020`) via `supabase--curl_edge_functions` and report the Meta message IDs + preview of the rendered body for both `daily_suggestion_en` and `daily_suggestion_cn`.

## Notes / risks

- WhatsApp collapses runs of regular spaces in rendered messages on some clients. If indentation doesn't visibly stick, fallback is to use a no-break space (`\u00A0`) for the indent. I'll verify from the test-send screenshot/response and switch to NBSP if needed.
- Meta template body variable accepts newlines; no template re-approval needed since only the `{{1}}` variable content changes.
- No frontend changes.

## Out of scope

- Template category/structure changes in Meta Business Manager.
- Changes to activity_prompt templates.
