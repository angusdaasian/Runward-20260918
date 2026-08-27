# Runward Watch (MoYoung/CRP SDK) — path to a single app

## What Despia told us changes the recommendation

Despia's position: the wrapper (v3 web view) is deliberately a thin native shell, and BLE/OEM SDK work does not belong in it. They are splitting into two products — the wrapper business, and a **native development platform** with native UI, native SDKs, SwiftUI / Jetpack Compose — and existing wrapper customers can migrate to the native runtime **for free** when it ships.

So the Despia Custom Extension route is off the table as the intended path, and the question becomes *which native host* Runward uses.

## Confirmed facts about the SDKs (from both development guides)

- iOS 3.19.2 (`CRPSmartBand.framework`) and Android 1.8.5 (`crpblelib-*.aar`) are the same MoYoung "CRP" proprietary BLE protocol, mirrored APIs. **BLE only — no cloud API, no OAuth, no server endpoint.** A Railway/Supabase backend can never fetch watch data by itself; a phone must pull it.
- Workout history: iOS `getSportRecordList()` → `getSportRecordData(id:)`; Android `queryHistoryTraining()` → `queryTraining(id)`. Payload: start/end, sport type, steps, distance, kcal, **HR array, cadence per 10 s, stride per 10 s**.
- GPS track: `getGPSDataRecordList()` / `queryHistoryGps()` then detail by start time — **lat/lng only, one point per 2 s**; align to the HR/cadence arrays by time.
- Live session: real-time steps and HR, start/pause/resume/stop sport mode from the app.
- Daily: steps (**history only last 3 days, 7 on SiFli**), sleep + naps, HR, HRV, SpO2, stress, temperature, BP/ECG on supporting models.
- Extras: watch faces incl. custom background upload, notification/weather push, alarms, contacts, EPO GPS-assist upload, OTA firmware.
- **No structured-workout push** — the app can only set a sport mode by type, so Runward interval plans cannot be sent to the watch. Biggest gap vs Garmin.

## Options for the native host (pick one)

**A. Wait for / migrate to the Despia native runtime (recommended if the timeline fits)**
- Free migration, one app, native UI + native SDK support, and Despia stays the build/publish pipeline you already know.
- Cost: parts of the UI move from React to SwiftUI/Compose, so this is a real rewrite of the shell — ask Despia for the ship date, what "migrate for free" covers, whether the existing React app can still be hosted inside it during transition, and whether arbitrary vendor `.framework`/`.aar` binaries can be embedded.

**B. Capacitor shell for Runward (single app, available today)**
- Keep the entire existing React/Vite UI unchanged; Capacitor wraps it and hosts a small Swift/Kotlin plugin embedding the CRP SDK, exposed to JS as `pair()`, `sync()`, plus listener events.
- Single app in the stores, no rewrite, works now. Cost: we own the iOS/Android build and release pipeline instead of Despia.

**C. Companion sync app (two apps)**
- Runward stays on the Despia wrapper; a thin native "Runward Watch Sync" app runs the SDK and POSTs to Supabase.
- Lowest risk to the current app, worst user experience — rejected unless A and B both stall.

## Backend and app work (identical in all three options)

- Tables `watch_devices`, `watch_workouts`, `watch_workout_streams` (HR / cadence / stride arrays + 2 s GPS points), `watch_daily_metrics`, each with GRANTs and RLS scoped to `auth.uid()`.
- `watch-ingest` edge function: validates the user's JWT, upserts normalized workouts idempotently on (device_id, start_time), writes streams and daily metrics.
- Sync layer in the native host: pair → sync steps/sleep → workout list → per-workout detail + GPS → POST → mark synced. Must run often because of the 3-day retention.
- Runward UI: "Runward Watch" entry in Connect Apps (native only) with pair/sync status and last-sync time; first-party exemption from the existing provider-exclusivity trigger on `user_connections`.

## Questions to settle first

Despia: native runtime ship date; what free migration includes; can vendor binary frameworks/AARs be embedded; can the existing web UI be hosted during transition.

OEM: LC323 feature matrix (GPS track, new-version sport records, cadence/stride, HRV, stress, SpO2); protocol V1 or V2; latest Android SDK build (1.8.5 lags iOS 3.19.2); SPM/Maven or XCFramework distribution; structured-workout push on the roadmap; licensing for shipping the SDK in our own branded app.

## Next step

Tell me which host you want. If you pick B, I'll start with the Supabase tables + `watch-ingest` function and the Connect Apps UI (all doable here), and hand you the Capacitor plugin spec for the native side. If you pick A, we build the same backend now so it's ready when the native runtime lands.
