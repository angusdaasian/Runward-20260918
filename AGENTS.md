# Project Architecture Rules

- Server notifications must read the user-selected in-app language from `profiles.lang`, never device locale or auth metadata, so every provider respects More settings.
- Pace zones use all available running history, beginning with the provider's initial 30-day backfill and accumulating every later run, so their baseline improves over time.