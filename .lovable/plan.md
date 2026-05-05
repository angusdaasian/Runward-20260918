# Rate the App reward

Add a one-time "Rate the App" card in the Rewards tab that opens the App Store / Play Store review page and grants XP. Mirrors the existing `InstagramFollow` pattern (trust-based, gated by `social_rewards_claimed` unique key — claimable once per user).

## What gets built

### 1. New component: `src/components/rewards/RateAppReward.tsx`
- Same props as `InstagramFollow`: `lang`, `userId`, `currentXp`, `onXpGain`.
- Constants:
  - `REWARD_KEY = "rate_app"`
  - `REWARD_XP = 5000` (one-time)
  - iOS URL: `https://apps.apple.com/us/app/runward/id6761060757?action=write-review`
  - Android URL: `https://play.google.com/store/apps/details?id=com.runward.app&showAllReviews=true` (placeholder package name — TODO comment, user to confirm)
- Platform detection via `src/lib/nativeDetection.ts` (`Capacitor.getPlatform()`):
  - iOS native → open iOS review URL
  - Android native → open Play Store URL
  - Web → default to iOS App Store link (since that's confirmed)
- On click:
  1. `window.open(url, "_blank", "noopener,noreferrer")` inside the user gesture.
  2. Insert into `social_rewards_claimed` with `reward_key="rate_app"`, `xp_awarded=5000`.
  3. On 23505 unique-violation → mark claimed silently.
  4. On success → bump `profiles.monthly_xp` + `lifetime_xp`, fire gold-themed confetti, toast, call `onXpGain(newMonthly)`.
- Visual: gold/amber gradient (`from-amber-400 via-yellow-500 to-orange-500`) with `Star` icon from lucide. Claimed state = muted card with check, identical to IG card.
- Bilingual strings inline (en/zh).

### 2. Wire into `src/components/RewardsTab.tsx`
- Import `RateAppReward` and render it directly below `<InstagramFollow ... />` in the `rewards` TabsContent, passing the same `lang`/`userId`/`currentXp`/`onXpGain`.

### 3. Update `src/components/rewards/XpExplainer.tsx`
- Add a line: "Rate the app — +5000 XP (one-time)" / 為應用程式評分 — +5000 XP（一次性）.

## Technical notes

- **No DB changes.** `social_rewards_claimed` already enforces `(user_id, reward_key)` uniqueness — same flow as Instagram, just a new key.
- **No review verification.** Apple and Google forbid gating rewards on actually leaving a review, so the reward is granted on tap-through. Standard pattern.
- **Play Store package name** is a placeholder — needs confirmation before Android launch. iOS URL is confirmed.

## Files touched
- `src/components/rewards/RateAppReward.tsx` (new)
- `src/components/RewardsTab.tsx` (add one line)
- `src/components/rewards/XpExplainer.tsx` (add one entry)
