

## Goal

Enable offline functionality for pages that don't require live network data, leveraging the **Despia Local Server** to serve the entire web build from on-device localhost, plus app-level caching for dynamic-but-cacheable data (free plans, races, generated AI plan).

## How Despia Local Server fits in

Despia Local Server is a native iOS/Android capability. Once enabled in your Despia dashboard:
- The full web build (HTML/CSS/JS/fonts/images) is downloaded to the device on first launch and served from `http://localhost`.
- Every subsequent launch boots instantly with **zero network**.
- OTA updates pull new builds in the background when online.
- No code changes to `vite.config.ts` are required, no service worker needed (and we shouldn't add one — it conflicts with Lovable preview).

This alone makes every **static / client-only** page work offline. The remaining work is making the **data-driven** pages tolerate "no network" by caching their data locally.

## Per-page offline classification

| Page / Tab | Network needed? | Offline strategy |
|---|---|---|
| **Pacing Calculator** (`CalculatorTab`) | No — pure VDOT math | Already offline. Despia local server is enough. |
| **Equivalent Times** (`EquivalentTab`) | No — pure math | Already offline. |
| **Free Training Plans** (`TrainingTab` → free plan picker, reads `free_training_plans` table) | Yes (Supabase read) | **Cache** the full free plans list in `localStorage` after first successful fetch; on offline, render from cache. |
| **Already-generated AI training plan** (`TrainingTab` calendar view, reads `training_plans` table) | Yes (Supabase read) | **Cache** the user's current plan in `localStorage` keyed by `user_id`. On offline, hydrate from cache. Edits/deletes are blocked offline with a toast. |
| **Races** (`RaceTab`, reads `races` table) | Yes (Supabase read) | **Cache** the races list in `localStorage` after fetch (with a 24h TTL). On offline, render from cache + show "showing cached races" badge. |
| **Settings (`MoreTab`)** — language, dark mode, definitions, privacy, support, manual upload guide links | Mostly no | Theme/lang already use `localStorage`. Premium status: keep last known value cached, don't block UI. Notification toggle, sign out, redeem code, paywall: require network — disable with a clear "offline" message. |
| **Privacy / Support / Manual Upload Guide pages** | No (static content) | Already offline. |
| Activities tab (sync, upload) | Yes — must stay online-only | No change. Show offline state. |
| Posture tab (TF.js model, camera) | Model already bundled | Works offline once model is cached by Despia. |
| Community / Rewards / Leaderboards | Yes (live data) | No change. Show offline state. |
| AI Plan **generation** (calls edge function) | Yes | Disable "Generate" button when offline. Existing plan still viewable. |

## What ships in this change

### 1. New offline utilities
- **`src/hooks/use-online-status.ts`** — small hook returning `{ online }` based on `navigator.onLine` + `online`/`offline` window events.
- **`src/lib/offlineCache.ts`** — generic typed `localStorage` wrapper: `getCached<T>(key)`, `setCached<T>(key, value, ttlMs?)`, `isStale(key, ttlMs)`. Safely JSON-encoded, namespaced with `cache:` prefix.

### 2. Wire caching into data fetches (pattern: cache-then-network)
- **`TrainingTab.tsx`**:
  - On free plans load: read cache first → render → fetch → update cache. On offline, skip fetch.
  - On user plan load: same pattern, key = `cache:training_plan:{userId}`.
  - "Generate plan" button: disable + tooltip when offline.
  - Edit/add/delete day handlers: if offline, toast "Connect to internet to edit your plan" and bail.
- **`RaceTab.tsx`**:
  - Read cached races (TTL 24h) and render immediately. Fetch in background. On offline, skip fetch and show small "Cached • last updated X ago" badge.
- **`MoreTab.tsx`**:
  - Notification toggle, redeem code, paywall, sign out: detect offline and show toast. Don't crash.
  - Premium expiry countdown: keep working from cached `usePremium` state.

### 3. Global offline indicator
- Tiny banner (top of `Index.tsx`, below `AppHeader`) that appears only when `online === false`: "You're offline — showing saved data."

### 4. Despia setup (no code change, just configuration)
- You enable the **Local Server** add-on in your Despia dashboard for this app.
- On next native build, the binary will download the latest web build, cache it, and serve from `http://localhost`. No `vite.config.ts` change needed; React Router `BrowserRouter` already works.
- We will **not** add `vite-plugin-pwa` or a service worker (it breaks the Lovable preview iframe and conflicts with Despia's localhost server).

## Technical details

- **Why no service worker**: Despia Local Server already serves all static assets from on-device storage; a service worker would be redundant and would break preview. Per Lovable PWA guidance, we avoid SW registration entirely.
- **Cache invalidation**:
  - Free plans: refresh on every successful online load (small dataset, rarely changes).
  - User training plan: refresh on every online load; writes update both DB and cache atomically.
  - Races: 24h TTL; manual pull-to-refresh path can force a refetch later (not in this change).
- **Storage size**: All three caches combined are tiny (<200 KB typical) — well under `localStorage` limits.
- **Auth offline**: Supabase session is already persisted by `supabase-js`; user stays "logged in" while offline. We don't attempt token refresh while offline.
- **Guest mode**: works fully offline since it only reads `localStorage`.

## What's NOT included (deliberately)

- No service worker / PWA manifest changes.
- No offline write queue (e.g., queueing activity uploads while offline). Activities tab remains online-only.
- No offline AI plan generation (requires edge function + AI gateway).
- No offline leaderboards / community feed.

## Files touched

- `src/hooks/use-online-status.ts` (new)
- `src/lib/offlineCache.ts` (new)
- `src/components/TrainingTab.tsx` (cache reads, gate writes)
- `src/components/RaceTab.tsx` (cache reads + stale badge)
- `src/components/MoreTab.tsx` (gate online-only actions)
- `src/pages/Index.tsx` (offline banner)

