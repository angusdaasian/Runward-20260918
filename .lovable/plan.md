# Watch Integration Architecture — BLE Sync via Separate Backend

## Critical constraint: BLE cannot run in the cloud

The OEM SDK communicates with the watch via **Bluetooth (BLE)**. BLE requires a
physical Bluetooth radio within a few meters of the watch. A cloud-hosted
backend (Railway, Render, etc.) has no Bluetooth hardware and cannot run a
native iOS/Android BLE SDK.

So the architecture must split into two layers:

```
 ┌──────────┐    BLE     ┌───────────────┐   HTTPS POST   ┌──────────────┐   webhook/HTTP   ┌──────────┐
 │  Watch   │◄──────────►│  Phone (app)  │───────────────►│  Cloud relay │◄───────────────►│ Runward  │
 │ LC323    │  Bluetooth │  runs OEM SDK  │  JSON payload  │  (Railway)   │   fetch data    │ (Despia)  │
 └──────────┘            └───────────────┘                └──────────────┘                 └──────────┘
```

- **Phone layer** — a native iOS/Android app (or Despia's built-in BLE bridge)
  that physically connects to the watch via Bluetooth and reads workout/health data.
- **Cloud relay** (optional) — a server on Railway that receives POSTed data from
  the phone, normalizes it, stores it, and exposes webhooks for Runward to fetch.
- **Runward** — your existing Despia web app fetches watch data via HTTP from
  the relay (or directly from Supabase if the phone POSTs there).

## Two viable paths (depends on SDK review)

### Path A: Despia built-in BLE (simplest, if the watch uses standard GATT profiles)

Despia has a full BLE central stack accessible from JavaScript:
- `despia('bluetooth://scan?services=...')` — scan for the watch
- `despia('bluetooth://connect?id=...')` — connect
- `despia('bluetooth://discover?id=...')` — enumerate services/characteristics
- `despia('bluetooth://read?...')` / `despia('bluetooth://write?...')` — read/write
- `despia('bluetooth://subscribe?...')` — subscribe to notifications (HR, etc.)
- `despia('bluetooth://connect?...&server=<URL>')` — **auto-POST every notification
  and state change to your backend as JSON, even when the app is backgrounded**

This means your existing Despia app could talk to the watch directly and POST data
to a Supabase edge function — no separate app, no Capacitor, no Railway relay.

**Works only if** the watch exposes standard BLE GATT profiles (Heart Rate 0x180D,
Running Speed/Cadence 0x1814, Battery 0x180F, etc.) or documented custom
characteristics that can be read/parsed in JavaScript.

**Fails if** the OEM SDK uses proprietary protocol: encrypted payloads, custom
handshake/auth sequences, or binary parsing that requires native code.

### Path B: Separate sync app + cloud relay (if OEM SDK is required)

If the SDK does proprietary BLE work that can't be replicated with raw BLE:

1. **Build a separate native iOS app** ("Runward Watch Sync") that:
   - Runs the OEM iOS SDK to pair/sync with the watch via BLE
   - Authenticates the user (links to their Runward account via a pairing code
     or shared Supabase auth)
   - POSTs synced workout/health data to the cloud relay (or directly to Supabase)

2. **Cloud relay** (Railway, optional):
   - Receives POSTed data from the sync app
   - Normalizes the OEM data format into Runward's schema
   - Stores in Supabase (shared instance) or its own DB
   - Exposes webhook endpoints for Runward to pull data

3. **Runward** (existing Despia app):
   - Fetches watch activities from the relay/Supabase via HTTP
   - Displays them in the existing activity list alongside Strava/Terra/etc.

4. Repeat for **Android SDK** when available (separate Android sync app).

**Tradeoff**: users install two apps (Runward + Watch Sync). The sync app runs in
the background to pull data from the watch and push it to the cloud. More complex
UX but works with any proprietary SDK.

## What the SDK review must answer

When you send the SDKs, I need to determine:

1. **BLE protocol type** — Does the SDK use standard GATT profiles, or proprietary
   commands/encryption? (Determines Path A vs Path B)
2. **Data export format** — What does a synced workout look like? GPS track,
   HR samples, lap splits, or just summary metrics?
3. **Pairing/auth flow** — How does the SDK pair with the watch? BLE bonding,
   PIN, or custom handshake?
4. **Background sync** — Can the SDK sync in the background, or only foreground?
5. **Daily health data** — Does the SDK expose sleep, SpO2, stress, steps, or
   only workout records?
6. **Workout push** — Can the SDK push structured workouts TO the watch, or
   only read FROM it?
7. **Live data** — Can the SDK stream live HR/pace during a workout, or only
   post-workout sync?
8. **Android parity** — Does the Android SDK have the same capabilities?

## Recommendation

1. **Send the SDKs** — I'll review the API surface and determine which path is viable.
2. **If Path A is viable** — use Despia's built-in BLE. No new app, no Capacitor,
   no Railway. Your existing app scans, connects, and POSTs to Supabase. This is
   by far the simplest.
3. **If Path B is required** — build a separate Watch Sync app per platform (iOS
   first, then Android). A Railway relay is optional; the sync app can POST
   directly to Supabase edge functions if the data format is simple enough.
4. **First-party watch exemption** — the watch is your own brand, so it should be
   exempt from the existing "one fitness provider" mutual-exclusion rule that
   blocks Strava/Terra/Intervals/etc. from coexisting.

## Technical details

- **Despia BLE access**: requires emailing ble@despia.com to enable the feature.
  Background BLE requires enabling the Bluetooth addon in Despia Editor + fresh
  native build. Foreground BLE works out of the box.
- **Server POST from Despia**: fire-and-forget, best-effort delivery. Include a
  user identifier in the POST (e.g., the Supabase user ID) so the backend can
  attribute data. Add a shared secret header for auth.
- **Supabase tables**: new `watch_activities` and `watch_daily_health` tables,
  following the same pattern as `garmin_activities`, `terra_activities`, etc.
  RLS owner-scoped, with edge functions for ingestion.
- **No Capacitor**: the existing Despia setup is preserved. No migration needed.
