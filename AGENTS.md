# Project Architecture Rules

- Server notifications must read the user-selected in-app language from `profiles.lang`, never device locale or auth metadata, so every provider respects More settings.