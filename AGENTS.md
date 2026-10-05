# Project Architecture Rules

- Server notifications must read the user-selected in-app language from `profiles.lang`, never device locale or auth metadata, so every provider respects More settings.
- Pace zones use all available running history, beginning with the provider's initial 30-day backfill and accumulating every later run, so their baseline improves over time.
- Only user-facing shipped changes enter `src/data/changelog.ts`; group same-day changes and increment versions sequentially without gaps.
- Bulk provider teardown jobs use bounded sequential batches and stop their own schedules after draining, preventing database load spikes.
- Public-route geography is classified client-side from representative polyline points; use explicit Hong Kong areas and cached territory-city data elsewhere so browsing requires no route data migration.
