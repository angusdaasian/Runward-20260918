## Rename "VDOT" → "Fitness Score" + smarter recent-fitness estimation

### 1. Rename in the Race Predictor UI

In `src/components/analytics/RacePredictorCard.tsx`:
- Replace the "VDOT" badge label (top-right) with **"Fitness Score"** (zh: **體能分數**).
- To keep it visually clean, render it as a small uppercase caption (`FITNESS SCORE` / `體能分數`) above the numeric value, identical layout to today — no extra row, no extra chip.
- Update the caption under the title from "From training score + PB, weather-adjusted" to "70% PB · 30% recent training" (zh: "70% 個人最佳 · 30% 近期訓練").
- Internal variable names (`vdot`, etc.) stay — only user-facing copy changes.

### 2. New Fitness Score formula

```text
fitnessScore = 0.7 × pbVdot + 0.3 × recentTrainingVdot
```

- If `pbVdot` is missing → use `recentTrainingVdot` only.
- If `recentTrainingVdot` is missing → use `pbVdot` only.
- If both missing → empty state (unchanged).

The stored `profile.training_score` is no longer used by the predictor (it represents long-term fitness and overlaps with PB). All "recent" signal comes from activities in the last 30 days.

### 3. How `recentTrainingVdot` is computed (the hard part)

Problem: a single easy run gives a very low VDOT and would crater the score, while a hard tempo gives a realistic one. We need to weight runs by how close they were to a maximal effort.

Approach — **effort-weighted recent VDOT**, inspired by how Daniels' VDOT is normally derived only from race-pace efforts:

1. Look at run activities from the last **30 days** with distance ≥ 1.5 km and moving_time ≥ 5 min.
2. For each run, compute its raw VDOT via `calculateRunningScore(distance, moving_time)`.
3. Compute an **effort weight** ∈ [0, 1]:
   - Primary signal — **intensity ratio** vs. the runner's own ceiling:
     `intensity = rawVdot / maxRawVdotInWindow`  (so the hardest run in the window = 1.0).
   - Apply a curve so easy runs are heavily discounted and only quality efforts contribute meaningfully:
     `weight = max(0, (intensity − 0.85) / 0.15)²`
     - intensity ≤ 0.85 → weight 0 (pure easy run, ignored)
     - intensity 0.90 → weight ≈ 0.11
     - intensity 0.95 → weight ≈ 0.44
     - intensity 1.00 → weight 1.0
   - Bonus multiplier for longer efforts (long runs and races are more telling than short intervals):
     `weight *= min(1, distance_km / 5)` capped at 1 for runs ≥ 5 km.
4. `recentTrainingVdot = Σ(weight × rawVdot) / Σ(weight)` — a weighted average.
5. If `Σ(weight) < 0.3` (no quality efforts in the window), return `null` and fall back to PB only.

Why this works:
- An all-easy month yields no recent signal → predictor uses PB only (sensible: no evidence fitness changed).
- One hard tempo or long run anchors the recent estimate near that effort's VDOT.
- Multiple quality sessions average out noise.
- This mirrors the standard advice "use a recent hard effort to estimate VDOT" but does it automatically across the window.

### 4. Files to edit

- `src/lib/racePrediction.ts`
  - Replace `recentVdot()` with the effort-weighted version above.
  - Simplify `effectiveVdot(recentTraining, pbScore)` to the 70/30 PB-weighted blend (drops the `trainingScore` parameter).
- `src/components/analytics/RacePredictorCard.tsx`
  - Update label/caption strings.
  - Update `effectiveVdot(...)` call site (no `trainingScore` arg).

### Out of scope

- No DB changes.
- No changes to how `profile.training_score` is computed elsewhere in the app.
- No weather-model changes.
