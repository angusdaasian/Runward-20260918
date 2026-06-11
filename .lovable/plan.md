
## Goal
Add a comparison subpage to the marketing site showing **Runward vs Garmin Connect** and **Runward vs Strava**, covering pricing and feature coverage. Bilingual (zh/en) matching the existing Landing page.

## Route & navigation
- New route `/compare` in `src/App.tsx` (lazy-loaded).
- Add a "Compare" / "比較" link in the Landing nav (next to Pricing) and a CTA button at the bottom of the Pricing section.
- Page reuses the same nav + footer styling as `Landing.tsx`, reads `localStorage.app_lang` for language.

## Page structure (`src/pages/Compare.tsx`)
1. **Hero** — "How Runward compares" with subhead, language toggle, back-to-home link.
2. **Tabs / anchor switcher** — `vs Garmin Connect` | `vs Strava` (two side-by-side sections; on mobile they stack).
3. **Price comparison block** per competitor — 3 cards: Runward / Competitor Free / Competitor Premium with monthly price, billing cadence, and a one-line summary.
4. **Feature comparison table** per competitor — categories on the left, three columns (Runward, Competitor Free, Competitor Premium) with ✓ / ✗ / short note. Built from a typed data file so it's easy to maintain.
5. **Bottom CTA** — "Try Runward free" → App Store + Dashboard buttons (same components used on Landing).

## Feature rows to compare
Activity sync (Garmin/Suunto/Coros/Polar/Strava/Apple Health) · GPS recording · Training load/HRV · Race predictor · **AI running coach (24/7)** · **AI activity analysis** · **AI personalized plans** · **Posture analysis (video)** · Social feed/leaderboards · Live segments · Heatmaps · Route planner · Web dashboard · Price.

The data emphasizes Runward's AI + posture + multi-watch sync at a lower price than Strava Premium and the AI features Garmin Connect lacks.

### Pricing facts to display (verifiable, dated "as of 2026-06")
- Runward Premium: HK$48/mo, HK$488/yr.
- Garmin Connect: Free (with Garmin device); Garmin Connect+ ≈ US$6.99/mo or US$69.99/yr.
- Strava: Free; Strava Premium ≈ US$11.99/mo or US$79.99/yr (varies by region).
A small footnote notes prices may vary by region and links to each provider's pricing page.

## Files
- **Create** `src/pages/Compare.tsx` — page component (~300 lines, same patterns as `Landing.tsx`).
- **Create** `src/data/comparison.ts` — typed arrays of `{ label_en, label_zh, runward, competitor_free, competitor_premium }` for Garmin and Strava.
- **Edit** `src/App.tsx` — add `<Route path="/compare" element={<Compare />} />` lazy import.
- **Edit** `src/pages/Landing.tsx` — add nav link + Pricing-section CTA pointing to `/compare`.

## SEO
- `<title>` "Runward vs Garmin Connect vs Strava — Compare Features & Pricing"
- Meta description ≈150 chars
- Single H1, semantic sections, canonical `/compare`.

## Out of scope (ask if you want)
- Per-competitor dedicated URLs (`/compare/garmin`, `/compare/strava`).
- Coros / Suunto / Polar comparisons.
- Auto-fetching competitor pricing — kept as a static data file you can edit.

Confirm and I'll build it.
