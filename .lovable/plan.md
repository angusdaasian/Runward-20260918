# Smoother cold start

## What happens today

Opening the app produces four or five visible stages instead of one:

1. A full-screen spinner while the sign-in session is restored (`src/pages/Index.tsx:200-210`).
2. The header appears empty, then fills in name/avatar from its own separate fetch (`src/components/AppHeader.tsx:20-174`).
3. A grey placeholder list (`ActivityListSkeleton`, `src/components/ActivitiesTab.tsx:1176`).
4. Runs appear in waves: Terra runs are fetched first, and only after that finishes do Strava / Apple Health / Garmin start (`src/hooks/use-activities.ts:426-465`). Each source arrives as its own repaint, so the list reshuffles.
5. Cards inside the page (next workout, Apple Health stats, plan info) each fetch on their own and pop in afterwards (`src/components/activities/PlanNextWorkoutCard.tsx:40`, `src/components/ActivitiesTab.tsx:653`).

The root cause is that every piece has its own loading state and nothing is remembered between launches. The app already has a small local storage cache helper (`src/lib/offlineCache.ts`) but the data layer does not use it, and the query cache is created with no settings at all (`src/App.tsx:40`), so each launch starts from an empty screen.

## The new loading behaviour

**1. Remember the last screen.** Persist the query cache to local storage, so on the next launch the app immediately paints the runs, profile and stats from the previous session, then quietly refreshes in the background. Cold start becomes "instant content, silently updated" instead of "spinner, skeleton, pop-in".

**2. One loading state, not five.** Replace the spinner + skeleton sequence with a single skeleton that matches the real Activities layout, and only ever show it on a true first-ever launch (no cached data). The session restore, header profile and first page of runs are gated together so they reveal in one step.

**3. Stop the wave effect in the run list.** Fetch all sources in parallel and merge before the first paint of the list, rather than fetching Terra first and letting the other sources trickle in. Duplicate handling stays exactly as it is now — it just runs once on the merged set instead of repainting per source.

**4. Header never renders empty.** Seed it from the persisted cache and reserve its space, so no text/avatar shift.

**5. Cards reserve their space.** In-page cards keep placeholders of the same height while loading, so nothing jumps as they arrive.

**6. Nothing non-essential competes with first paint.** Promo banner, what's-new walkthrough and the chat button already mount on load; they get deferred until after the first screen is interactive.

## Technical notes

- `src/App.tsx`: give `QueryClient` sensible defaults (`staleTime`, `gcTime`, `refetchOnWindowFocus: false`) and wrap with `PersistQueryClientProvider` using a local-storage persister with a version key and a max-age of ~24h; only whitelist the activity/profile/plan query keys.
- `src/hooks/use-activities.ts`: drop the `secondaryEnabled` gate so Terra/Strava/Apple/Garmin/Suunto run concurrently; expose a single `loading` that is true only when there is no cached/merged data at all, plus an `isRefreshing` flag for the pull-to-refresh indicator.
- `src/pages/Index.tsx`: unify the spinner path and `ActivitiesTab`'s skeleton into one gate — show the app shell (header + bottom nav) immediately, skeleton only the content region, and use cached data to skip the skeleton entirely on repeat launches.
- `src/components/AppHeader.tsx`: read the persisted profile query as its initial value instead of its own module cache.
- Defer `PromoBanner` / `WhatsNewWalkthrough` / `FloatingChatButton` mount behind an idle callback.
- No backend or business-logic changes; dedupe, plan logic and adherence comparison are untouched.

## Verification

- Measure the number of visual stages on a simulated cold start with an empty and a warm cache (Playwright screenshots at 300/600/1200 ms).
- Confirm the run list contains the same, correctly de-duplicated activities as today after the parallel-fetch change.
