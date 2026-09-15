# Runner Classes — RPG layer integrated with CityHunter

## Goal
Turn Runward's existing data (activities + CityHunter territory) into an RPG-style **Runner Class** progression system. Runners pick one of four classes, earn class XP from real running + territory capture, level up, and see a "character sheet" with a radar chart of their four affinities. CityHunter becomes the **exploration pillar** of the RPG — the Pathfinder class levels almost entirely from territory capture, and every class earns bonus XP for capturing new hexes.

## The four classes (bilingual)

| Class | Emoji | EN | ZH | XP source (real data) |
|---|---|---|---|---|
| Sprintblade | ⚡ | Sprintblade | 速刃 | Speed — pace PRs, interval runs, sub-6/sub-5/speedster badges, negative splits |
| Wayfarer | 🛡️ | Wayfarer | 遠行者 | Distance — lifetime km, long-run distance, weekly/monthly volume |
| Highlander | ⛰️ | Highlander | 高地戰士 | Elevation — total ascent, steepest run, Everest challenge |
| Pathfinder | 🧭 | Pathfinder | 探路者 | **Territory** — unique hexes captured, landmarks, city badges, capture contributions |

- User picks **one active class** at a time (stored in `profiles.runner_class`). Switching is free and never loses XP — each class keeps its own cumulative XP.
- A **suggested class** is computed from the radar chart (highest affinity); the user can accept it or pick any class.

## How CityHunter integrates (the RPG "world")
- **Pathfinder XP is the CityHunter engine**: every unique hex captured = 10 XP, every landmark captured = 100 XP, every city badge earned (Bronze 500 / Silver 1,000 / Gold 2,000 / Platinum 4,000 / Diamond 8,000 / Conqueror 16,000) = XP.
- **All classes** earn a small territory bonus: each *new-to-you* hex captured = +5 class XP, so exploring the map rewards every class, not just Pathfinder.
- **Highlander** additionally weights runs that captured hexes with high total elevation; **Sprintblade** weights fast runs that captured hexes; **Wayfarer** weights long runs (more hexes traversed). These are derived from run stats already linked to territory captures, not new per-hex data.
- CityHunter tab gains a **Pathfinder level badge** beside the city progress, so the territory tab visibly reflects RPG progression.

## Level system
- 50 levels per class. Threshold curve: `level = min(50, floor(√(xp / 50)) + 1)` (tunable). Each level shows an emblem tier tint and an XP bar to the next level.
- Class level is **cosmetic/progression only** in this phase — no gameplay gating. (Phase 2 can add class-exclusive milestone badges.)

## Data & computation (no XP stored in DB)
- Class XP is **computed client-side**, mirroring `computeBadgeProgress` in `src/lib/badges.ts`:
  - Sprintblade / Wayfarer / Highlander XP derived from the `activities` array already loaded by `useActivities` (same inputs badges use: distance, pace, elevation, splits).
  - Pathfinder XP derived from territory aggregates fetched with existing queries: `territory_captures` count (unique hexes), `territory_landmark_captures` count, and per-city % (already computed in `CityProgressList`) mapped to city badges.
- Module-level cache (like `cachedBadgeUserId` / `cachedBadgeProgress` in BadgesPage) keeps the highest-ever XP to avoid flicker on refetch.

## Storage change (small migration)
- Add one column to `profiles`:
  ```sql
  alter table public.profiles add column runner_class text;
  ```
  Default null. Existing RLS on profiles (user owns their row) already covers read/update, so no new policy needed. No XP columns — XP is computed.

## Files to add / change

**New**
- `src/lib/runnerClasses.ts` — class definitions, `computeClassXp({ activities, territoryStats })` returning per-class XP + level + affinity radar data, level curve, suggested-class helper. Mirrors `badges.ts` patterns.
- `src/components/rewards/RunnerClassCard.tsx` — the character sheet card: active class emblem + level + XP bar to next level, a radar chart of the four affinities (reuse the radar-chart pattern from `PostureRadarChart`), and a class-switch UI (4 selectable class chips + "Suggested: X").
- `src/assets/classes/{sprintblade,wayfarer,highlander,pathfinder}.png` — four class emblems, generated with imagegen (transparent PNG, consistent style with `src/assets/ranks/*.png`).

**Changed**
- `src/components/RewardsTab.tsx` — render `RunnerClassCard` at the top of the Rewards tab (above Leaderboards/Social/CityHunter), so the RPG sheet is the entry point.
- `src/components/rewards/TerritoryTab.tsx` — show the user's Pathfinder level badge + active-class emblem beside city progress; surface the territory→XP connection ("+10 XP per new hex").
- `src/components/community/FeedRunCard.tsx` — show a small class emblem next to the runner's name on each feed card (territory-as-world social signal). Emblem only; no extra data fetched (class comes from the profile already loaded with the feed row, or a tiny per-user cache).
- `supabase/migrations/NNNN_runner_class.sql` — the `alter table` above + the standard `GRANT`/comment. (profiles already has grants; this is additive.)

## Technical details
- **Radar chart**: reuse the SVG radar approach from `src/components/posture/PostureRadarChart.tsx` — four axes (Speed / Distance / Elevation / Exploration), each normalised 0–100 from that class's XP percentile.
- **Affinity normalisation**: each class's XP mapped to 0–100 via a soft curve so the radar shows shape even at low levels; tuned so a specialist (one axis dominant) is visually distinct from an all-rounder.
- **Pathfinder territory fetch**: a single `territory_captures` count + `territory_landmark_captures` count + the city-badge percentages already computed in `CityProgressList`; batched in `RunnerClassCard`'s effect. Cache result for the session.
- **Privacy**: class emblem on feed cards is derived from the runner's own `profiles.runner_class` (already visible to feed viewers via the existing profile join in `get_social_feed`/`get_group_feed` — if not currently returned, add `runner_class` to the SELECT). No new opt-in; class choice is public like display_name.
- **i18n**: all labels bilingual via `Lang` (en/zh), matching `badges.ts` `en`/`zh` pattern.
- **No edge-function change** in this phase — XP is computed from existing data, so `process-territory` is untouched.

## Out of scope (phase 2, not built now)
- Class-exclusive milestone badges / perks.
- "Every run earns XP" push notification on level-up.
- Per-hex elevation/pace metadata for richer class bonuses.
- Group raid boss battles (separate feature).

## Verification
- Build passes (`tsgo` + Vite).
- `RunnerClassCard` renders on Rewards tab with radar + level + switch.
- Switching class persists to `profiles.runner_class` and reloads correctly.
- Pathfinder level on CityHunter tab matches captured-hex count.
- Feed cards show the runner's class emblem.
- Linter no new errors.
