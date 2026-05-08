# City Coverage Progress

Add per-city exploration progress, tap-to-zoom heatmap, and milestone badges to the Territory tab.

## Data model

New table **`territory_cities`** — one row per city ever encountered:
- `slug` (text, PK) — e.g. `taipei-tw`
- `display_name` (text), `display_name_zh` (text, nullable)
- `country` (text, 2-letter), `admin1` (text, nullable)
- `bbox` (jsonb) — `[minLat, minLng, maxLat, maxLng]` for map fitBounds
- `center_lat`, `center_lng` (numeric)
- `total_hex_count` (int) — H3 res 8 hexes inside city polygon
- `polygon_filled_at` (timestamptz, nullable) — when polyfill finished

New table **`territory_city_hexes`** — membership lookup (one row per hex inside a city polygon):
- `hex_id` (text, PK) — H3 cell id
- `city_slug` (text, FK → territory_cities.slug, indexed)

Add column **`city_slug`** (text, nullable, indexed) to `territory_hexes`.

RLS: both tables readable by all authenticated users; service role full access.

## Backend

**New edge function `resolve-city`** (called from `process-territory` per unseen hex):
1. Take a hex_id → `cellToLatLng` → reverse-geocode via Nominatim (`/reverse?lat=&lon=&zoom=10&format=json&accept-language=en`).
2. Derive `slug` from `address.city || address.town || address.county` + country code.
3. If city already in `territory_cities`, return cached slug.
4. Otherwise:
   - Fetch boundary polygon via Nominatim (`/search?q=<city>&polygon_geojson=1&limit=1`).
   - Compute bbox + centroid.
   - Use `polygonToCells` (h3-js) at res 8 to enumerate all hex_ids inside polygon.
   - Insert `territory_cities` row with `total_hex_count`, then bulk-insert into `territory_city_hexes`.
5. Return `{ slug, display_name }`.

**Modify `process-territory/index.ts`**:
- After computing the hex set for an activity, look up `city_slug` for each hex via:
  1. Check `territory_city_hexes` table (cheap, indexed).
  2. If miss, call `resolve-city` for that hex's coords (rate-limit: max 1 Nominatim call per 1.1s, dedupe by approximate lat/lng).
- Stamp `city_slug` on each `territory_hexes` upsert row.

**Nominatim etiquette**: hardcoded `User-Agent: lovable-territory/1.0`, sequential calls only.

## Frontend

**New file `src/components/rewards/CityProgressList.tsx`**:
- Query: `select hex_id, city_slug from territory_hexes where owner_user_id = me`.
- Group by `city_slug`, count.
- Join with `territory_cities` for name + total.
- Render sorted by % desc:
  ```
  Taipei  ━━━━━░░░░░  2.4% explored
          428 of 17,832 hexes  · 🥉 1%
  ```
- Badge tier shown next to row: 🥉 1%, 🥈 5%, 🏅 10%, 🏆 25%, 💎 50%, 👑 100% (highest earned only).
- Tap row → calls `onCityFocus(slug)` prop.

**New file `src/lib/cityBadges.ts`**:
- `const CITY_BADGE_TIERS = [1, 5, 10, 25, 50, 100]`
- `getCityBadge(percent) → { tier, icon, label }`

**Modify `TerritoryMap.tsx`**:
- New prop `focusCity?: { bbox: [number,number,number,number]; slug: string } | null`.
- When set, `fitBounds` to bbox and dim hexes whose `city_slug !== slug` (lower opacity).
- Add `city_slug` to `Hex` interface.

**Modify `TerritoryTab.tsx`**:
- Fetch `territory_cities` rows the user has hexes in.
- Render `<CityProgressList>` above the map.
- Track `focusedCity` state; pass to `<TerritoryMap>`.
- Add a small "Show all" pill when focused.

## i18n

Strings (en/zh) added inline in components:
- "X explored" / "已探索 X"
- "Y of Z hexes" / "Y / Z 地塊"
- Badge labels: Bronze/Silver/Gold/Platinum/Diamond/Crown — keep emoji, localize tooltip.

## Out of scope
- Backfill of existing `territory_hexes` rows (city_slug stays null until next sync touches them; we'll add a one-shot backfill button later if needed).
- City leaderboards (separate feature).