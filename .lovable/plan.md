# Runward Watch (MoYoung/CRP SDK) — Findings from both development guides

I read the English guides for iOS SDK 3.19.2 and Android CRPBandSDK 1.8.5. Both are the same product family (MoYoung "CRP" BLE protocol), with mirrored APIs.

## What the SDKs are

- Pure **BLE-only** SDKs. There is no cloud API, no OAuth, no server endpoint anywhere in either guide. The phone talks to the watch over Bluetooth; nothing else can.
- Proprietary CRP protocol on top of GATT (`com.crrepa.ble.*` / `CRPSmartBand.framework`), plus vendor DFU services (Realtek, SiFli) for firmware. This is **not** readable through a generic BLE bridge — the byte protocol is undocumented and lives inside the SDK binaries.
- iOS requires `CRPSmartBand.framework` as an embedded binary, CoreBluetooth background mode, and Bluetooth Always usage description. Android requires the `.aar`, BLUETOOTH_SCAN/CONNECT + coarse location, and declared DFU services.
- Guides say plainly: "a certain watch only supports part of the functions" — per-feature support must be confirmed with the OEM for the LC323.

## Capabilities relevant to Runward

Running / workout data:
- Historical workout records: iOS `getSportRecordList()` → `receiveSportList([CRPSportRecord])`, then `getSportRecordData(id:)`. Android `queryHistoryTraining()` → `queryTraining(id)`.
- Per-workout payload (`CRPNewSportModel`): start/end time, valid time, sport type, steps, distance, kcal, **heart-rate array**, **cadence array (per 10 s)**, **stride array (per 10 s, cm)**.
- GPS track: `getGPSDataRecordList()` → start-time list, then `getGPSRecordData(time:)` / Android `queryHistoryGps()` + `queryGpsDetail(time)`. Track is **latitude/longitude only, one point every 2 seconds**. No per-point pace/altitude/HR — those come from the separate arrays and must be time-aligned.
- Live session: real-time steps, real-time HR, `CRPNewSportingModel` (state, steps, sport time, live HR) while a workout runs; app can start/pause/resume/stop sport mode on the watch.
- Daily: steps (today + history — **only last 3 days, 7 on SiFli watches**), sleep incl. naps, HR records, dynamic HR, HRV, SpO2, stress, temperature, blood pressure, ECG on supporting models.
- Extras usable for branding: watch faces (incl. custom background upload), notification push, weather push, alarms, contacts, world clock, EPO/GPS assist file upload, OTA firmware.

Important limits for our use case:
- **No structured-workout push.** The SDK can only switch the watch into a sport mode by type; there is no way to send a Runward interval plan (warmup/reps/paces) to the watch. That is the single biggest gap versus Garmin.
- **No cloud sync.** Data only exists on the watch until a paired phone with the SDK pulls it. A Railway/Supabase backend can never fetch it by itself.
- Short history retention means the phone must sync often or data is lost.
- Android SDK (1.8.5, dated 0911) is older than iOS (3.19.2); ask the OEM for the latest Android build and the LC323 feature matrix.

## What this means for the architecture

The earlier conclusion holds and is now confirmed by the guides: the SDK must run on the phone, so we need a native host. Options, unchanged:

- **Path B (recommended):** a thin native iOS + Android "Runward Watch Sync" app that embeds the SDK, does pairing and background sync, normalizes each workout (summary + HR/cadence/stride arrays + GPS points) and POSTs it to a Supabase edge function. Runward stays on Despia and simply reads the new tables like it reads Terra/Strava.
- **Path A (ruled out):** Despia's raw BLE bridge cannot speak the CRP protocol, so this is not viable without the OEM releasing the byte-level spec.

## Questions for the OEM before we build

1. LC323 feature matrix: which of GPS track, new-version sport records (`CRPNewSportModel`), cadence/stride arrays, HRV, stress, SpO2, temperature are actually enabled?
2. Protocol version (V1 or V2)? V2 is required for the richer sport records.
3. Latest Android SDK build, and Swift Package/CocoaPods distribution for iOS if available.
4. Any structured-workout / training-plan push capability on the roadmap?
5. Licensing terms for shipping the SDK in our own branded app, and white-label watch-face tooling.

## Next step

If you confirm Path B, I'll write the implementation plan: Supabase tables (`watch_devices`, `watch_workouts`, `watch_workout_streams`, `watch_daily_metrics`) with GRANTs and RLS, a device-token-authenticated `watch-ingest` edge function, the Runward UI (pair/sync status in Connect Apps, provider-exclusivity handling), and the native sync-app spec for each platform.
