# Custom watch sync — options, costs, and what to ask your supplier

No code changes in this plan. This is the decision write-up you asked for.

## What the two kits actually are

- iOS kit: `CRPSmartBand` framework (plus Realtek/JieLi firmware-update helpers) + an iOS Development Guide PDF, with Objective-C and Swift demo apps.
- Android kit: a single `crpblelib-2.0.4` library + an Android Development Guide PDF.

These are the CRP / Moyoung Bluetooth kits — the same family the DaFit app is built on. They are closed, compiled native libraries. They speak directly to the watch over Bluetooth Low Energy, and they only run inside a real iPhone/Android app binary.

## Can this work with Despia?

Not as it stands. Despia loads your web app inside a wrapper and exposes a fixed set of phone features. Bluetooth talk to this watch is not one of them, and cannot be added from your side — the watch libraries have to be compiled into the app itself.

Three realistic paths:

**A. Real native app (Capacitor) — the reliable path.**
Your app screens stay exactly as they are today; only the shell changes. The watch libraries go into the native shell, plus a thin bridge so your screens can say "scan", "connect", "pull today's activity". Needs a Mac with Xcode and Android Studio to build and release, and you take over App Store / Play submissions.
Cost: highest effort of the three; realistically several weeks of native work for pairing, sync, background reconnect, firmware updates. Ongoing: every watch firmware change may need a kit update and a new app release.

**B. Ask Despia to compile the kit in.**
Cheapest if they agree. This is a non-standard request — they would need to accept a third-party closed library and expose functions to your web layer. Ask them directly before planning around it.
Cost: unknown; a yes saves you the whole native shell, a no costs you only the email.

**C. Cloud sync, no Bluetooth in your app.**
The watch (via a companion app) uploads to the maker's server, and your server pulls from it. Your app stays a Despia web app. This only exists if the factory offers a data API — many CRP factories do not, and users would still need a second app installed, which defeats the point of selling branded watches.
Cost: low app-side effort, but depends entirely on the supplier and gives a worse user experience.

**D. Your own "Runward Watch" companion app — recommended.**
Exactly what you proposed, and it is the cleanest fit. A second, small app of your own (built with Capacitor, released from Xcode and Android Studio) does one job: pair with the watch over Bluetooth and pull activities. It then sends those activities to your existing Runward account over your own API, and your main Despia app keeps working untouched.

Why it is better than A: your main app never has to leave Despia, and the watch code lives in a small app you can update independently. Trade-off: customers install two apps, so the pairing screen and onboarding must make that feel deliberate — the watch box QR points at Runward Watch, and Runward Watch tells them to install Runward for training.

How the link-up works: the companion app signs in with the same Runward account, or the user pastes a short pairing code shown in the main app. From then on the companion uploads in the background to a new endpoint on your server, and the runs appear in Runward like any other provider.
Cost: the native Bluetooth work is the same as path A, but confined to a tiny app; plus two store listings to maintain and one new server endpoint. No risk to the main app.

Recommendation: path D, and send the supplier questions below in parallel. Only fall back to B or C if the supplier blocks the kit licence.


## The "DaFit" message on the watch

That text and the download code are baked into the watch firmware — nothing in your app can change it. It is a factory (OEM) job, and it is routine for these makers. What you need from them:

1. White-label firmware for your order: your app name shown on first power-on, and the pairing QR pointing at your own App Store / Play listing (or a link page you control).
2. Your own logo/animation on the boot screen and watch faces, if you want it.
3. Written licence to use the iOS and Android kits in **your** app, published under your developer account — including whether they require a per-app key or bind the kit to a bundle ID.
4. Confirmation your app can pair with the watch without DaFit ever being installed, and that the watch will not keep prompting for DaFit.
5. Exact watch model / chipset / firmware version, and which kit version matches it.
6. Minimum order quantity and unit-cost difference for custom firmware, plus lead time.
7. Whether they run a cloud/data API (for path C), and firmware-update files served from your own app.
8. Support terms: who fixes it when a phone OS update breaks pairing, and how kit updates are delivered.

Ask Despia one thing: "Can you compile a third-party closed Bluetooth SDK (iOS framework + Android AAR) into my wrapped app and expose a few JavaScript functions for it?"

## Technical notes

- Path D (companion app): a separate Capacitor project, not this repo. Two native plugin wrappers — `CRPSmartBand.framework` on iOS, `crpblelib-2.0.4.aar` on Android — behind one JS interface (scan, bond, fetch activities, fetch daily health, firmware update). UI is deliberately thin: sign in, pair, sync status, last-sync time.
- New provider in this project, mirroring the existing Strava/Terra shape: a `watch_connections` + `watch_activities` pair (or reuse of the existing activity tables), a `watch-ingest` edge function authenticated with the user's Supabase session, and a card in Connect apps / DashboardConnect showing pair status and last sync. Idempotent ingest keyed on device id + activity start time so re-syncs don't duplicate.
- Because ingest lands in the same activity tables the current providers write to, charts, splits, interval detection, leaderboards and share cards keep working untouched.
- Your one-fitness-provider-at-a-time rule needs the watch added as another option in that mutually exclusive group.
- Path A (kit inside the main app) would instead mean adding Capacitor to this repo directly — kept as the fallback if you later want a single app.
- iOS needs Bluetooth usage strings and background BLE entitlement; Android needs the newer Bluetooth scan/connect permissions and, on older versions, location permission.
- Sandbox limits: iOS and Android builds cannot be produced here — that work happens on your own Mac / Android Studio after exporting the companion project.

## Next step

Confirm path D and I will write the build plan: the companion app skeleton, the ingest endpoint, and the Connect apps card. Supplier answers on the kit licence can arrive in parallel.

