# Routes + mobile return link

## Part 1 — Return link straight back into the app (Stridee 28 Sep)

Stridee now accepts an app link (like `com.runward.app:/stridee-callback`) instead of only a website address. After approving on the consent page, the browser sheet closes and drops the user back inside the app — no more stuck consent browser on iPhone.

**What you need to do (cannot be done from here):**
1. In Despia, find your app's link scheme / bundle ID (e.g. `com.runward.app`) and tell me the exact value.
2. In the Stridee dashboard → Return URIs, add `<your-bundle-id>:/stridee-callback`.
3. Confirm Despia opens the app when that link is called (Despia "deep link / URL scheme" setting).

**What I will do once you send the scheme:**
- On the phone app, send that app link as the return address; the website keeps using the current runward.site / angustest.site addresses.
- When the app reopens from that link, finish the connection and show the "connected successfully" message for the right brand.
- Garmin keeps its current Safari flow until we confirm the new link works for it too.

## Part 2 — Shared routes (Stridee 24 Sep)

**Who gets saved:** runs with a map route from people whose activities are public (Community sharing switched on). If someone turns sharing off, their routes disappear from the list.

**New "Routes" section in the Training tab** (next to Training / Free / Program / Custom):
- List of routes: name, map preview, distance, climb, city, who ran it, how many times run.
- Filters: near me, distance (e.g. <5 km, 5–10, 10–21, 21+), search by name.
- Route page: full map, elevation profile, details.
- Buttons:
  - **Send to my watch** — puts it on the watch as a Course (Garmin via the watch connection; needs the user to allow "Course Import" when asked).
  - **Download GPX** — for any watch (COROS, Suunto, Apple, etc.) to import manually.
- Same run from the same place repeated many times is shown once (merged by start point + distance).

**Gating (please confirm):** browsing free for everyone; Send to watch and Download GPX for Premium only?

**Privacy:** start/finish trimmed by ~200 m so home addresses aren't exposed; owner can hide any of their routes.

**Changelog:** one minor entry ("New Routes library in Training") once shipped — no provider names.

## Technical details

- Table `shared_routes` (id, user_id, source_activity_id unique, name, polyline, distance_m, elevation_gain_m, start_lat/lng, city_slug, run_count, hidden, created_at) with GRANTs + RLS: anyone signed in can read rows whose owner has `social_opt_in` and `hidden=false`; owner can update `hidden`.
- Fill it from existing activity tables via the trigger path already used for City Hunter; one-off backfill run one account at a time (dedup-style sequential rule).
- Edge function `route-gpx`: builds GPX from the polyline (trimmed ends) and returns it.
- Edge function `route-push`: builds GPX, base64, signed `POST /v1/routes` to Stridee with name/sport=running; returns status/reason; respects the 60/min push limit.
- Mobile return: `stridee-connect` accepts an allow-listed app scheme when called from the Despia app; new handling for the deep link in the app shell.
