# Own-brand watch integration — architecture decision plan

Goal: make a Runward-branded OEM watch connect to Runward the way a Garmin watch connects to Garmin Connect — activities, daily health, workout push, and live data — with Runward as the official companion app.

No code is written yet. This plan is the decision framework and the checklist of what to demand from the OEM before building.

## The one constraint that decides everything

Runward's mobile app is a web app (Vite + React) running inside the Despia WebView wrapper. A WebView cannot use a vendor's native Bluetooth SDK, cannot hold a background BLE connection, and cannot run a background sync service. Consequences:

- A **cloud/Open-API SDK** (watch → phone-agnostic OEM cloud → REST API) fits today's app with zero native work. This is the only path that works with Despia as-is.
- A **native BLE SDK** requires a real native shell (Swift/Kotlin) that exposes the SDK to the WebView through a JS bridge, or a full native rewrite of the sync layer. This is a different product decision, not a feature.

So: ask the OEM for the cloud API first, and treat BLE as the fallback that triggers a native shell project.

## What to require from the OEM before committing

Send them this list; the answers determine the build.

1. Is there a device cloud with a documented REST/OAuth API, or is the SDK BLE-only?
2. If cloud: OAuth per end user, or a single partner API key with user IDs? Webhooks on new activity, or polling only?
3. Activity payload: per-second GPS track, HR stream, laps/splits, cadence, elevation, power? Or summary only? What file formats (FIT/TCX/GPX/JSON)?
4. Daily health: steps, sleep stages, resting HR, HRV, body battery equivalent — which are exposed, at what granularity?
5. Workout push: can we upload a structured workout (steps, target pace/HR zones, repeats) to the watch, and via what channel — cloud queue or BLE only?
6. Live/real-time: is there a broadcast mode (BLE HR broadcast / ANT+) or an SDK-only live channel?
7. Firmware/OTA and watch-face customisation: who owns branding, and does OTA require their app?
8. White-label terms: can the cloud be branded, is there rate limiting, data residency, and is there a per-device fee?

## Recommended architecture (cloud path)

Mirror the existing provider pattern exactly — the codebase already has five parallel implementations (Strava, Terra, Suunto, Polar, Intervals) to copy from.

```text
Watch ──BLE──> OEM cloud ──webhook/poll──> Runward edge functions ──> Postgres ──> app UI
                                    ^
                        workout push  |  (structured workout queued to device)
```

- New tables: `runward_watch_connections`, `runward_watch_activities`, `runward_watch_daily_health` — same shape as the `terra_*` trio, RLS scoped to `auth.uid()`, plus grants.
- New edge functions: `watch-auth` / `watch-callback` (or key-exchange pairing), `watch-sync`, `watch-webhook`, `watch-disconnect`, `watch-push-workout`.
- Reuse existing shared logic unchanged: activity normalisation, cross-platform dedup (`dedup-activities-cross-platform`), training-load and race-prediction pipelines, `pushed_workouts` for the workout-push record.
- Connect UI: one more provider card in `src/components/ConnectApps.tsx` and `src/components/dashboard/DashboardConnect.tsx`, placed first and visually distinct as the first-party device.
- Exclusivity: **exempt**. The own-brand watch is not added to the `user_has_other_fitness_provider` guard, and the existing `enforce_single_fitness_provider_*` triggers are left untouched so users can keep Strava/Garmin alongside it. Dedup then does the heavy lifting to avoid double-counted runs.

## Feature-by-feature feasibility

| Feature | Cloud SDK | BLE-only SDK |
| --- | --- | --- |
| Activities into Runward | Ready to build | Needs native shell |
| Daily health metrics | Ready to build | Needs native shell |
| Push workouts to watch | Likely, if OEM exposes a queue | Needs native shell |
| Live / real-time in-run | Not possible via cloud | Native shell, or a phone-side BLE HR read |

Live data is the weakest link either way — plan it as phase 2 and don't promise it in launch marketing until the SDK is reviewed.

## If it turns out to be BLE-only

Then the decision is: commission a thin native iOS/Android shell that hosts the OEM SDK and exposes `pair / listActivities / fetchActivity / pushWorkout / subscribeLive` to the WebView over a JS bridge, with the same edge functions still doing storage and normalisation. Runward's React code then talks to `window.RunwardWatch` instead of a REST client — the DB schema and UI above stay identical. Budget this as a separate native workstream, not a Lovable change.

## Suggested next steps

1. Get the SDK package and docs, plus answers to the eight questions above.
2. Share the docs here; I'll turn them into a concrete build plan (schema, functions, UI) in one pass.
3. In parallel, ask the OEM for one sample device so the pairing flow can be tested end to end.
