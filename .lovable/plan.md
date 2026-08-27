# Own-brand watch (LC323) — Capacitor native shell + SDK bridge

The OEM provides a **native iOS SDK** (Swift). Runward's app is a Vite/React web app inside the Despia WebView, which cannot load vendor native SDKs. The chosen path: wrap the existing Runward web app in a **Capacitor iOS shell** that hosts the OEM SDK and bridges it to the web layer. All Runward UI stays exactly as-is; only the watch transport is native.

## Architecture

```text
LC323 ──BLE──> Capacitor iOS shell (OEM SDK plugin)
                    │  JS bridge: pair / listActivities / fetchActivity / fetchDailyHealth
                    ▼
        Runward web app (existing UI, unchanged)
                    │  POST normalised payloads
                    ▼
        Edge functions: watch-sync, watch-disconnect, watch-push-workout*
                    ▼
        Postgres: runward_watch_connections / _activities / _daily_health
                    ▼
        Existing pipelines: dedup, training load, race prediction, XP/territory
```

(*workout push is unconfirmed — most JieLi-platform firmware has no structured-workout support; kept behind a capability flag until the SDK is reviewed.)

## Phase 1 — Capacitor shell (can start now, no SDK needed)

1. Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`; run `npx cap init` (appId `app.lovable.p3a023ac5b83840b88629845cf040337f`, appName `welcome-ward-start`) with a `server.url` pointing at the sandbox preview URL for hot reload during development.
2. Add iOS platform: user exports the project to GitHub, `git pull`, `npm install`, `npx cap add ios`, `npx cap update ios`, `npm run build`, `npx cap sync`, `npx cap run ios` on a Mac with Xcode.
3. Add a thin platform-detection layer: `isCapacitorNative()` alongside the existing `isNativeApp()`/`detectPlatform()`, so watch features only render in the Capacitor shell and the current Despia build keeps working untouched.
4. Native entitlements/config to prepare: Bluetooth usage descriptions (`NSBluetoothAlwaysUsageDescription`), background modes (`bluetooth-central`, `background-processing`) — required regardless of which OEM SDK ships.

## Phase 2 — Server + UI layer (can start now, SDK-agnostic)

Mirror the existing provider pattern (Strava/Terra/Polar/etc.):

- Migration: `runward_watch_connections`, `runward_watch_activities`, `runward_watch_daily_health` — shaped like the `terra_*` trio, GRANTs, RLS scoped to `auth.uid()`. The watch is **exempt** from `user_has_other_fitness_provider` and the `enforce_single_fitness_provider_*` triggers stay untouched, so it can coexist with Strava/Garmin; `dedup-activities-cross-platform` handles double-counted runs.
- Edge functions: `watch-sync` (accepts normalised activity + daily-health payloads from the native layer), `watch-disconnect`, and a stub `watch-push-workout` behind a capability flag.
- A shared `watchBridge` TS module defining the bridge contract the Swift plugin must implement: `isAvailable()`, `pair()`, `unpair()`, `listActivities(since)`, `fetchActivity(id)` (track + HR series + laps), `fetchDailyHealth(date)`. The web layer only ever talks to this module, never to native code directly.
- Connect UI: a first-party "Runward Watch" card added to `src/components/ConnectApps.tsx` and `src/components/dashboard/DashboardConnect.tsx` — placed first, distinct styling, visible only when `isCapacitorNative()` is true (or hidden with an explanatory note on web/desktop).

## Phase 3 — Native SDK bridge (starts when the SDK arrives; needs Xcode)

1. Drop the OEM iOS SDK into the Capacitor app, write a small Swift Capacitor plugin implementing the `watchBridge` contract over the SDK's pairing/sync APIs.
2. Auth model decision once the SDK is reviewed: bind the watch to the Runward account by pairing inside a signed-in app (pair token = user id), no separate OEM account — Garmin-Connect-style.
3. Sync UX: manual "Sync now" + foreground auto-sync on app open. True background BLE sync is possible but deferred (iOS background BLE is flaky and App-Store-scrutinised).

## Open items the OEM must confirm (send before Phase 3)

1. Per-workout export detail: full GPS track (per-second lat/lon), HR series, laps/splits, cadence, elevation — or summary only? Format (FIT/GPX/proprietary/JSON)?
2. Daily health via SDK: steps, sleep stages, resting HR, HRV, SpO2, stress — which are readable, at what granularity?
3. Structured workout push to the watch — supported at all?
4. Standard BLE HR broadcast for live data, or SDK-only?
5. Android SDK availability and parity (the plan is iOS-first as specified; Android is its own plugin later).
6. SDK licence/white-label terms, and who maintains it against iOS updates.
7. Watch-face + boot-logo branding: can we ship a Runward face by default?

## Risks

- If workout export is summary-only, the watch can't feed maps/splits/HR-zones/training-load — it becomes a steps-and-distance tracker only. Check first.
- Live in-run data on watch screens depends on firmware; not promised for launch.
- Android: OEM said "iOS SDK" — if no Android SDK exists, Android users stay on Strava/Terra connections.

## Suggested next steps

1. Approve, and I'll build Phase 1 + Phase 2 (Capacitor scaffold, tables, edge functions, bridge contract, connect card).
2. Send the OEM the seven questions; get a sample unit and one exported workout file.
3. When the SDK lands, Phase 3 is a focused Swift plugin task.
