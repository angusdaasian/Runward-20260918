## Goal
When all Strava apps have hit their athlete limit, disable the Strava Connect button in ConnectApps and show an explanatory message below it (EN + ZH).

## Changes

### 1. New edge function: `strava-capacity`
- Returns `{ full: boolean }` based on the same `pickAvailableApp` logic in `_shared/strava-apps.ts`.
- If `pickAvailableApp` throws `StravaAppsError` with code `ALL_APPS_FULL` → return `{ full: true }`.
- Otherwise → `{ full: false }`.
- Lightweight, no auth required (public, like other init endpoints).

### 2. `src/components/ConnectApps.tsx`
- Add state `stravaFull: boolean`.
- In `checkConnections` (or a new effect), invoke `strava-capacity` once on mount and set `stravaFull`.
- Update Strava button:
  - `disabled = stravaDisabledByOther || stravaFull`
  - When `stravaFull`, apply the same grey/`cursor-not-allowed` styles already used for `stravaDisabledByOther`.
- Below the Strava card, when `stravaFull && !stravaConnected`, render a small muted-text note:
  - EN: "Max athletes connected. We've requested more capacity from Strava — please check back soon."
  - ZH: "Strava 名額已滿,我們正向 Strava 申請更多名額,請稍後再試。"

### 3. Keep existing click-time fallback
Leave the existing `ALL_APPS_FULL` toast handling in `handleConnectStrava` as a safety net in case the capacity status is stale.

## Out of scope
- No DB changes.
- No changes to other connectors.
- No admin UI changes.
