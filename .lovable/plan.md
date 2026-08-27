# Runward Watch — single-app path via Despia Custom Extensions

## Answer: yes, one app is possible — via a Despia Custom Extension

Despia supports **Custom Code Extensions**: you write native Swift/Kotlin that is compiled directly into your existing Despia app binary, exposed to your web app through `despia('scheme://...')` calls and `window.on_*` event callbacks. Despia's own docs show "OEM Bluetooth device integration" as the headline example. This means:

- No second app, no App Store restructure — Runward stays the single app on Despia.
- The extension hosts the watch SDK natively and reports data to the existing React UI, which POSTs to Supabase like today.

## The one blocker: SDK distribution format

Despia extension `dependencies` resolve only:
- **iOS:** Swift Package Manager (git URL + version)
- **Android:** Maven artifact (`group:name:version`)

The OEM gave us a raw `CRPSmartBand.framework` (iOS) and `crpblelib-*.aar` (Android) — neither is on SPM or Maven. So before committing we must either:
1. Ask the OEM for SPM + Maven (or XCFramework binary target) distribution — many BLE vendors do publish these (e.g. Nordic, Realtek DFU are on SPM/Maven); or
2. Ask Despia support whether a vendored `.framework`/`.aar` can be bundled in an extension; or
3. Vendor the binaries in a thin Swift Package / local Maven repo we host ourselves.

Until that is answered, the fallback remains the separate native sync-app plan.

## What the extension would look like

```text
Despia Extension "runwardwatch"
├── despia-extension.json        scheme: runwardwatch, hosts + events below
├── Sources/ios/WatchBridge.swift      embeds CRPSmartBand.framework
└── Sources/android/WatchBridge.kt     embeds crpblelib aar

Actions (despia('runwardwatch://...')):
  scan, connect(deviceId), unbind, syncSteps, syncSleep,
  syncWorkoutList, getWorkoutDetail(id), getGpsTrack(startTime),
  setUserInfo, syncTime, getBattery, getFirmwareVersion

Events (window.on_*):
  on_watch_connected / on_watch_disconnected
  on_watch_sync_progress(stage, percent)
  on_watch_workout_ready(summary)      → web app POSTs to watch-ingest
  on_watch_live_hr(bpm)                (optional, live mode)
```

- Background sync: requires the Despia Bluetooth addon (email ble@despia.com) plus a fresh native build; CoreBluetooth background mode is already declared by the SDK's requirements.
- Data flows into the same Supabase tables/edge function as the separate-app plan — that part doesn't change.

## Backend (shared either way)

- Tables: `watch_devices`, `watch_workouts`, `watch_workout_streams` (HR/cadence/stride arrays + 2s GPS points), `watch_daily_metrics` — with GRANTs + RLS.
- `watch-ingest` edge function validating the user's JWT and upserting normalized workouts (idempotent on watch_id + startTime).
- Connect Apps UI: "Runward Watch" entry gated to native, first-party exemption from the provider-exclusivity trigger.

## Open questions (in priority order)

1. **OEM:** SPM / Maven / XCFramework distribution for both SDKs?
2. **Despia support:** can an extension bundle a vendored binary framework/AAR? (Email them — the BLE addon is also gated via ble@despia.com anyway.)
3. **OEM:** LC323 feature matrix + protocol V1/V2 + latest Android SDK build.
4. **OEM:** structured-workout push on roadmap?

## Next step

I'll draft the extension skeleton (`despia-extension.json` + Swift/Kotlin bridge stubs mapping every SDK call we need) once you confirm, and you can start the two vendor conversations in parallel.
