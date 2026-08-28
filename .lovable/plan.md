# Runward — Feature Evaluation & Proposed Additions

## What Runward has today

A mature, full-featured running companion. Current surface area:

- **Multi-platform sync**: Strava, Garmin, Suunto, COROS, Polar, Apple Health, Fitbit, Intervals.icu, Terra (mutually-exclusive fitness provider).
- **Activities**: detail view with map, HR-zone bars, splits, FIT export, bulk export, calendar, year heatmap, monthly stats, AI share posters, RPE slider (0.5 steps), suggested next workout.
- **AI**: running coach chat (24/7), activity analysis, posture analysis (video), personalized training-program generation, weekly plan review, race-time prediction (VDOT + HR-based, with weather WBGT and TSB freshness adjustments).
- **Training**: AI plans, plan editor, weekly review modal, training-load charts (CTL/ATL/TSB), training score.
- **Analytics**: race predictor, HR zones, HRV readiness (Terra), injury-load cards (injury risk + readiness combined), trends, Garmin health card, customizable reorderable widget grid.
- **Races**: scraped race calendar, user races, race fueling calculator.
- **Gamification/Community**: Arena (chat, public/private leaderboards), XP/ranks/tiers/divisions, city badges, territory (CityHunter), monthly road quest, season reset.
- **Messaging**: WhatsApp + Telegram daily workout delivery (compact-to-rich tiered), broadcast notifications.
- **Web**: SSR bilingual blog (SEO, sitemap, RSS), landing + pricing, `/tools` (Pace Lab, race-day checklist, fueling calculator), `/review` Strava-compliant page, developer OAuth/API, admin panel.
- **Localization**: EN + ZH + JA (client-side SPA).

## Confirmed gaps

1. **No taper / race-peak planner.** Plans have rest/recovery days and a generic "post-injury" preset, but there is no explicit final-2-to-3-week taper generator tied to a target race date.
2. **No single "Train Today?" gate.** Injury risk, HRV readiness, and TSB are computed in separate widgets — there is no one-line daily recommendation ("Ready / Easy / Rest") combining them.
3. **No pacing/split analysis.** Splits are stored and shown, but never analyzed for negative-split tendency, fade, or bank-time risk. No race split planner with guardrails.
4. **No plan-adherence tracking.** The app builds a plan and tracks activities, but never compares completed workouts against the scheduled plan (completion %, missed key sessions, streak).
5. **No gear mileage surfacing.** Shoe tables exist (hidden); no wear/mileage alert when shoes are due for replacement.
6. **No weather-adjusted "today's pace."** Weather slowdown exists only inside race prediction, not surfaced as a recommended training pace for today's conditions.

## Proposed features (ranked by value-to-effort)

### A. "Train Today?" readiness gate — recommended, high value, low effort
A single daily card combining existing TSB + HRV readiness + recent RPE + injury-risk band into one verdict: **Ready / Go easy / Rest**. Reuses `computeReadiness`, `computeInjuryRisk`, `buildWeeklyLoadSeries` already in the codebase. Lives at the top of Activities/Training tab. No new data model.
- Why: closes the loop between the metrics users already see and a decision they actually make every morning. Highest "feels smart" payoff per line of code.

### B. Race split planner with bank-time guardrails — high value, medium effort
Enter a target finish time + course; get per-km/mile splits with a max "bank" limit (e.g. don't run any km more than X sec faster than average) and a negative-split option. Reuses `predictTime` / VDOT engine. Could also power a "splits band" view inside an existing activity to flag where the runner faded vs. their plan.
- Why: runners obsess over race splits; no major running app ships an explicit bank-time guard. Strong SEO + shareable.

### C. Taper & peak-week planner — high value, medium effort
Given a target race date + distance, auto-generate the final 14–21 day taper (volume reduction curve, last hard session, carb-load note) and append it to the user's AI plan. Reuses plan-generation Edge Function + VDOT paces. Adds a `taper_phase` concept to `planTypes.ts`.
- Why: genuine hole — every marathoner needs a taper; Runward plans up to race day but not the taper itself.

### D. Plan adherence / schedule streak — medium value, medium effort
Compare completed activities to scheduled plan workouts (date + type match) → completion %, missed key sessions, current streak. New lightweight `plan_completions` table or derive from existing activities vs. plan JSON. Surfaced in Training tab + Rewards XP.
- Why: turns the plan from a PDF into a living checklist; boosts retention/XP loop.

### E. "Today's adjusted pace" weather card — medium value, low effort
Pull today's weather (existing `get-weather` + `weatherSlowdown`) and show recommended easy/interval/tempo paces adjusted for heat & humidity, beside the raw VDOT paces.
- Why: the math already exists; surfacing it is cheap and immediately useful in summer (Hong Kong/Taiwan heat).

### F. Shoe replacement alerts (un-hide + extend) — low value, low effort
Re-surface the hidden shoe system: show mileage per shoe + alert when a shoe crosses ~500–800 km. Minimal new logic.

## Recommendation

Build **A (Train Today?)** and **E (weather-adjusted pace)** first — both reuse existing engines, are low-effort, and deliver high perceived intelligence. Then **C (taper planner)** and **B (split planner)** as the next premium-tier differentiators. **D (adherence)** and **F (shoes)** are good retention features to slot in afterward.

## Next step

Pick which of A–F to build now (or pick a subset), and I'll scope a concrete implementation plan for those.
