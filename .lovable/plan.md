## Achievements page updates

### 1. Rename and simplify
- In `src/components/BadgesPage.tsx`, change hero label `Achievement Badges` / `成就徽章` → `Achievements` / `成就`.
- Remove the description paragraph (`{c.desc}`) from the detail modal so it only shows the badge name + progress.
- Tile grid already only shows names — no change needed there.

### 2. App anniversary → Mar 28, 2026
In `src/lib/badges.ts`:
- `APP_LAUNCH_DATE = "2026-03-28"`.
- `appBirthday = anyOnMonthDay(activities, 2, 28)` (March = month 2).
- `app_birthday` badge copy: `Run on the app's anniversary date (Mar 28)` / `於 App 週年日跑步（3 月 28 日）`.

### 3. New badges (14 total)

**Lifetime distance** (category `distance`, value = `totalKm`):
- `mileage_1500` — 1,500 km
- `mileage_2000` — 2,000 km
- `mileage_2500` — 2,500 km
- `mileage_3000` — 3,000 km
- `mileage_3500` — 3,500 km
- `mileage_4000` — 4,000 km

**Monthly volume** (category `volume`, value = `month.km`):
- `monthly_300` — 300 km in a calendar month
- `monthly_400` — 400 km in a calendar month
- `monthly_500` — 500 km in a calendar month
- (existing `volume_king` = 200 km stays)

**Marathon pace** (category `pace`, value uses `bestPaceSecPerKmOver(activities, 42195)`):
- `marathon_sub5` — sub 5:00/km marathon (300 s)
- `marathon_sub430` — sub 4:30/km marathon (270 s)
- `marathon_sub4` — sub 4:00/km marathon (240 s)
- `marathon_sub330` — sub 3:30/km marathon (210 s)
- `marathon_sub3` — sub 3:00/km marathon (180 s)

Add `bestSecMarathon` computation in `computeBadgeProgress` and 5 new switch cases.

### 4. Collector badge rework
Rename `completionist` meta badge:
- EN: name `50 Badges Collected`, desc `Collect 50 badges`
- ZH: name `收藏 50 個徽章`, desc `收集 50 個徽章`
- `target: 50` (was 45). With 14 new badges added, total non-meta badges ≈ 56, so 50 is achievable.

### 5. Generate badge artwork
Use `imagegen--generate_image` (premium tier for clean illustration consistency) for each of the 14 new badges. Match the existing style — circular medal, gradient backdrop, central icon + number, no text-heavy clutter. Save to `src/assets/badges/<id>.png` and import in `badges.ts`.

Example prompts:
- Distance: "Circular running achievement medal badge, '2000 KM' bold numeral, runner silhouette, gold-bronze gradient ring, on a solid white background, same style as a sports milestone badge"
- Monthly: "Circular monthly volume badge with '500' and 'KM/MO', calendar accent, vibrant blue-purple gradient, on a solid white background"
- Marathon pace: "Circular marathon pace badge with 'SUB 3:00' and '42K', stopwatch + laurel motif, racing red gradient, on a solid white background"

### Files changed
- `src/lib/badges.ts` — anniversary date, 14 new BadgeDef entries, marathon-pace computation, completionist target/copy.
- `src/components/BadgesPage.tsx` — hero label + remove modal desc.
- `src/assets/badges/*.png` — 14 new images.

No DB/migration changes.