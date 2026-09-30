# Project Architecture Rules

- Server notifications must read the user-selected in-app language from `profiles.lang`, never device locale or auth metadata, so every provider respects More settings.
- Mobile presentation uses the RunWard Fresh semantic-token system and shared native controls; keep business logic separate so visual refreshes cannot alter sync, training, or provider behavior.