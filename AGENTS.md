# Project Architecture Rules

- Watch connection guidance uses a shared pre-connection sheet before invoking the existing connect flow; cancelling must never disconnect a provider or start authorization.

- Server notifications must read the user-selected in-app language from `profiles.lang`, never device locale or auth metadata, so every provider respects More settings.
- Pace zones use all available running history, beginning with the provider's initial 30-day backfill and accumulating every later run, so their baseline improves over time.
- Only user-facing shipped changes enter `src/data/changelog.ts`; group same-day changes and increment versions sequentially without gaps.
- Bulk provider teardown jobs use bounded sequential batches and stop their own schedules after draining, preventing database load spikes.
- Public-route geography is classified client-side from representative polyline points; use explicit Hong Kong areas and cached territory-city data elsewhere so browsing requires no route data migration.
- Suunto is exempt from the single-fitness-provider lock (UI and DB triggers) and its FIT files are parsed with the shared watch-connection mapper, so details match other watch runs.
- AI coach training runs once per watch connection: watch-connection syncs retrain when the coach's training marker predates the connection; bulk retraining goes strictly one user at a time with pacing and self-chaining.
- MCP server lives in a separate Netlify project (mcp.runwardapp.com); per-user access uses hashed tokens in mcp_tokens, because the Supabase instance is external and cannot host app MCP functions.
- AI connection management uses a dedicated More hub subpage and the shared connection view, keeping credentials and instructions off the main settings list.
