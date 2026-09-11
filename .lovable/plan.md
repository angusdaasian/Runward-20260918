# Community revamp: kilometre leaderboards, private groups, social wall

## What changes for users

**Leaderboards become distance-based**
- Ranking is monthly kilometres run, not points.
- Daily check-in, XP, rank tiers/divisions and the point explainer disappear from the Community tab.
- Joining is opt-in: a single switch "Show me on leaderboards". Off by default; nobody appears without opting in.

**Private leaderboards**
- A user can create a group (name + optional emoji), and gets one share link plus a QR code of that same link.
- Anyone opening the link (or scanning the QR) sees the group name and a Join button; joining requires being signed in.
- Codes are short, rotatable by the owner, and the owner can remove members or delete the group.
- Recommendation: one invite link is the source of truth, and the QR is just that link rendered on screen — it works in person and in chat, and needs no separate flow.

**Social wall**
- Separate switch: "Share my runs publicly". Off by default.
- When on, the user's runs (name, type, distance, duration, pace, elevation, date, route shape) appear on the wall for others.
- The wall shows recent runs from opted-in users, ordered so that runs near the viewer's own recent running locations come first, then by recency. Users with no location signal still appear, further down.
- Each run links to a read-only view. Heart rate, health data and raw samples are never shared.

**Privacy**
- Two independent switches in profile settings, both off until the user turns them on.
- Turning "Share my runs publicly" off immediately removes their runs from the wall.
- Exact start coordinates are never shown; location is rounded to roughly a 1–2 km grid and used only for ordering.

## Technical plan

### Database
New tables (each with GRANTs, RLS, updated_at trigger):

- `social_prefs` — `user_id` (unique), `leaderboard_opt_in bool default false`, `social_opt_in bool default false`. Owner read/write; opted-in rows readable by authenticated users via the RPCs below only.
- `social_activities` — denormalised public feed row: `user_id`, `source`, `source_id`, `started_at`, `name`, `activity_type`, `distance_m`, `duration_s`, `elevation_m`, `summary_polyline`, `start_lat_rounded`, `start_lng_rounded`, `geohash_cell`. Unique on `(source, source_id)`.
- `leaderboard_groups` — `owner_user_id`, `name`, `emoji`, `invite_code` (unique, 8-char base32), `created_at`.
- `leaderboard_group_members` — `group_id`, `user_id`, `joined_at`, unique `(group_id, user_id)`.

Triggers: extend the existing per-provider activity trigger pattern (strava/terra/apple/garmin/polar/suunto/intervals `*_activities`) with `tg_sync_social_activity()` — inserts/updates a `social_activities` row when the user has `social_opt_in = true`, deriving the rounded start point from the first polyline point (or Terra GPS samples). Backfill existing runs for users who opt in via a one-off function called on toggle-on; toggle-off deletes their rows.

Functions (security definer, `search_path = public`):
- `get_km_leaderboard(p_month date, p_limit int)` — monthly km summed from `social_activities` for `leaderboard_opt_in` users, returning display name, avatar, km, run count.
- `get_group_leaderboard(p_group_id uuid, p_month date)` — same for members of a group the caller belongs to; group membership implies consent inside that group regardless of the public switch.
- `join_group_by_code(p_code text)` — validates the code, inserts the caller as a member, returns group id/name.
- `get_social_feed(p_limit int, p_offset int)` — recent `social_activities` rows ordered by distance between each row's rounded start point and the caller's own recent run centroid (haversine on rounded coords, nulls last), then `started_at desc`.

The XP columns on `profiles` stay in place for now (territory/CityHunter still reads nothing from them) but are no longer read or written by Community; `get_leaderboard` is dropped.

### Frontend
- Remove `DailyCheckIn`, `XpExplainer`, `RankUpOverlay`, rank emblem usage and `HeroSection` XP display from `RewardsTab.tsx` and `DashboardCommunity.tsx`; keep `ClaimRewards`, `InstagramFollow`, `RateAppReward` (reward codes, unrelated to XP).
- `HeroSection` becomes a distance summary: this month's km, run count, current leaderboard position.
- `LeaderboardTabs` → `KmLeaderboard`: tabs for Global and each of the user's groups, plus a "Create / join group" entry.
- New `GroupManager` (create, share link, QR via a small QR dependency, rotate code, leave/remove/delete) and a `/join/:code` route that resolves the code and offers Join.
- New `SocialWall` component in the Community tab: infinite list of run cards using the existing activity card visual language and a static route thumbnail; tap opens a read-only detail sheet.
- Two switches added to `ProfileSection.tsx`, wired to `social_prefs`.
- Sub-tabs on Community become: Leaderboards | Social | CityHunter (rewards codes move under the existing More/profile area).
- All new strings in EN / ZH / JA to match current i18n coverage.
