# Runward Watch — standalone companion app, step 1: prove the Bluetooth link

Goal of this first step: get the watch to pair with an app of ours and read one activity off it, on an iPhone, using Xcode. Nothing else. The DaFit text on the watch does not block this — the watch talks to whichever app holds the maker's Bluetooth kit.

## Where this lives

This must be a separate project from Runward. I cannot create a second Lovable project from inside this one, so pick one of these:

- Create a new blank Lovable project named "Runward Watch", open it, and I generate the companion app there.
- Or keep it entirely local: I hand you the Xcode project files and setup steps, and you build it on your Mac.

Either way the main Runward app is untouched.

## What gets built in step 1

A single-screen iOS app:

1. Ask for Bluetooth permission.
2. "Scan" button → list nearby watches with name and signal strength.
3. Tap one → pair and show connected state, battery, firmware version.
4. "Read activities" button → dump whatever the watch returns (steps, workouts, heart rate) as plain text on screen.

No accounts, no server, no design. This screen exists only to answer "does the watch talk to us".

## How it is put together

- New Capacitor app (`app.runward.watch`), added iOS platform, opened in Xcode.
- Drop the supplier's `CRPSmartBand.framework` (from the iOS kit you uploaded) into the Xcode project, with the Realtek/JieLi firmware helpers left out for now.
- One small Swift plugin exposing four calls to the web layer: `requestPermissions`, `scan`, `connect(mac)`, `readActivities`. Each mirrors a delegate callback in the kit; the kit's Development Guide PDF is the reference for the exact method names.
- The single screen is plain React inside the Capacitor app, calling those four functions and printing raw results.
- Android is deliberately skipped this round; the same plugin shape gets an `crpblelib` implementation later.

## What you need on your side

- A Mac with Xcode, an Apple developer account (free account is enough to run on your own iPhone).
- A real iPhone — the simulator has no Bluetooth.
- The watch, charged, and not currently paired to DaFit (unpair it in iPhone Settings > Bluetooth first if it is).

## Known risks for this step

- Some CRP kits refuse to connect until the app passes a licence key from the factory. If we hit that, we stop and ask the supplier — this is exactly what the branding/licence questions below are for.
- Firmware may be older or newer than kit 3.19.4; the guide lists supported firmware. Worth asking the supplier for the model and firmware version now.

## Still to ask your supplier (unchanged, run in parallel)

1. White-label firmware: your app name on first power-on, pairing QR pointing at your own listing.
2. Your logo on the boot screen and watch faces, if wanted.
3. Written licence to ship their iOS and Android kits in your own app, plus whether a per-app key or bundle-ID binding is required.
4. Confirmation the watch pairs with your app without DaFit installed.
5. Exact model, chipset, firmware version, and which kit version matches.
6. MOQ, extra unit cost, lead time for custom firmware.
7. Whether they offer a cloud/data API, and firmware update files you can host.
8. Support terms when a phone OS update breaks pairing.

## After step 1 works

Then, and only then: sign-in with the Runward account inside the companion app, a `watch-ingest` edge function in this project, a `watch_connections` / activity ingest that lands in the same tables the current providers write to (so charts, splits, interval detection, leaderboards and share cards keep working), a card in Connect apps, and the Android build.

## Next step

Tell me which route you want for the second project — a new Lovable project, or local Xcode files from me — and I will produce the app and the exact Xcode steps.
