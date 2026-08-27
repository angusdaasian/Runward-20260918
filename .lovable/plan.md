# Own-brand watch (LC323) integration — architecture decision plan

Goal: make the Runward-branded LC323 connect to Runward the way a Garmin watch connects to Garmin Connect — activities, daily health, workout push, and (later) live data.

No code is written yet. This plan is the decision framework plus the exact list of things to demand from the OEM before building.

## What the spec sheet tells us

The LC323 is a JieLi JL7074A7S based round watch: 1.39" 360x360, 400mAh, 1ATM, BT calling, real GPS (CC1165W, 5 constellations), HR (VC30F-S), compass, optional barometric altitude, 100+ sport modes with GPS running/cycling, workout records stored on-watch, plus sleep / SpO2 / stress / optional BP.

Sensor-wise this is genuinely good enough to be a running watch: GPS track, HR, distance, calories, cadence-capable accelerometer, and elevation if you pay for the SPL07-003.

Two things the spec does **not** contain, and they decide the whole project:

1. No mention of a device cloud or Open API — JieLi-platform watches in this class are almost always paired with a BLE-only mobile SDK from the software house (the same code behind apps like FitCloudPro / WearFit / Da Fit). Assume **BLE-only** until proven otherwise.
2. No data-export detail: whether a workout can be pulled as a track (per-second lat/lon + HR) or only as a summary row (distance, duration, avg HR, calories).

If it is BLE-only with summary-only export, the watch cannot power Runward's analytics — no map, no splits, no HR zones, no training load. That is the single biggest risk to check first.

## The constraint that shapes everything

Runward's mobile app is a web app (Vite + React) inside the Despia WebView. A WebView cannot link a vendor BLE SDK, cannot hold a background Bluetooth connection, and cannot run a background sync service.

- **Cloud/Open API path** → drops straight into the current app, zero native work.
- **BLE SDK path (expected here)** → needs a real native shell (Swift/Kotlin) hosting the SDK, exposing it to the WebView via a JS bridge. That is a separate native workstream, not a Lovable change.

## Questions to send the OEM now

1. Is there a device cloud with a documented REST/OAuth API, or is the SDK BLE-only?
2. Per-workout export: full GPS track (per-second lat/lon), HR series, laps/splits, cadence, elevation — or summary only? What format (FIT / GPX / proprietary binary / JSON)?
3. Which platforms does the SDK cover, and can it be used inside a third-party app we build ourselves (not their white-label app)?
4. Daily health exposure: steps, sleep stages, resting HR, HRV, SpO2, stress — which are readable via SDK, at what granularity?
5. Can we push a structured workout to the watch (steps, repeats, target pace/HR zones)? If not, can we at least push a text/plan reminder or a custom watch face?
6. Live data: is there a standard BLE HR broadcast profile (so any app can read live HR), or SDK-only?
7. Watch-face + boot-logo branding, and can we ship a Runward face by default? Firmware/OTA — does OTA require their app?
8. Commercials: SDK licence terms, per-device fee, source or binary, and who maintains it against iOS/Android updates.
9. Is the GPS chip's raw NMEA/track accessible, and is barometric altitude (SPL07-003) worth adding for elevation gain?

## Recommended architecture

Whatever the transport, the server and UI layers are the same, and mirror the five provider implementations the codebase already has (Strava, Terra, Suunto, Polar, Intervals).

```text
LC323 ──BLE──> native shell (SDK) ──> Runward edge functions ──> Postgres ──> app UI
   or
LC323 ──BLE──> OEM cloud ──webhook/poll──> same edge functions
                                              ^
                            workout push ─────┘
```

- New tables: `runward_watch_connections`, `runward_watch_activities`, `runward_watch_daily_health` — same shape as the `terra_*` trio, RLS scoped to `auth.uid()`, with grants.
- New edge functions: `watch-pair`, `watch-sync` (accepts normalised activity payloads), `watch-webhook` (cloud path only), `watch-disconnect`, `watch-push-workout`.
- Reuse unchanged: activity normalisation, `dedup-activities-cross-platform`, training-load, race prediction, `pushed_workouts`.
- Connect UI: one more provider card in `src/components/ConnectApps.tsx` and `src/components/dashboard/DashboardConnect.tsx`, placed first and styled as the first-party device.
- Exclusivity: **exempt**. The own-brand watch is not added to the `user_has_other_fitness_provider` guard and the `enforce_single_fitness_provider_*` triggers stay untouched, so users can keep Strava/Garmin alongside it; dedup prevents double-counted runs.

## Feature feasibility against this hardware

| Feature | If cloud API exists | BLE-only (expected) |
| --- | --- | --- |
| Activities with GPS track + HR | Ready to build | Native shell required; also depends on Q2 |
| Daily health (steps/sleep/HR/SpO2) | Ready to build | Native shell required |
| Push workouts to watch | Only if OEM exposes a queue | Native shell, and firmware must support structured workouts — most JieLi watches do not |
| Live / real-time in-run | Not possible via cloud | Native shell, or standard BLE HR broadcast if firmware offers it |

Structured workout push is the least likely feature on this platform. Treat it as phase 2 and do not put it in launch marketing until the SDK is reviewed.

## Suggested next steps

1. Get the SDK package + docs and answers to the nine questions, especially Q1 and Q2.
2. Ask for one sample unit and one sample exported workout file so the data quality can be judged before tooling is built.
3. Share the SDK docs here; I'll convert them into a concrete build plan (schema, edge functions, UI, and the native-bridge contract if BLE).
