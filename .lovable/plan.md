# Plan — Write `README.md` for Runward

Replace the current placeholder `README.md` with a comprehensive document covering what the app does, its tech stack, how to run it, and how the major integrations (Garmin, Strava, Apple Health, AI coach, posture analysis) fit together.

## Proposed structure

### 1. Header
- Title: **Runward — Your Running Training Companion**
- One-line tagline pulled from `index.html` meta description
- Badges (optional): React 18, Vite, TypeScript, Supabase, Tailwind

### 2. Overview
Short paragraph describing Runward as a mobile-first running app that:
- Tracks runs from Garmin / Strava / Apple Health / manual upload
- Analyzes running posture via on-device TensorFlow.js pose detection
- Generates personalized training programs via AI
- Gamifies training with XP, ranks, leaderboards, daily check-ins, rewards
- Provides race discovery, calculators (VDOT, pace equivalents), and an AI running coach

### 3. Key Features
Bullet list grouped by tab:
- **Activities** — calendar, year heatmap, training load, monthly road quest, suggested next workout
- **Analytics** — performance, posture results, Garmin daily health card (VO₂max, resting HR, sleep)
- **Training** — AI-generated programs and free plans
- **Races** — discovery, verification, pending race manager
- **Rewards** — XP, ranks, leaderboards, daily check-in, claim codes
- **Coach** — floating AI chat with context-aware running advice
- **More** — settings, profile, connect apps, language toggle (EN / ZH), admin panel

### 4. Tech Stack
Pulled from `package.json` + project conventions:
- **Frontend:** React 18, Vite 5, TypeScript 5, Tailwind CSS v3, shadcn/ui (Radix), TanStack Query, React Router, Framer Motion, Recharts, Leaflet
- **Backend:** Lovable Cloud (Supabase) — Postgres, Auth, Storage, Edge Functions (Deno)
- **AI:** Lovable AI Gateway (Vertex/Gemini), TensorFlow.js pose detection
- **Native shell:** Despia / median-js-bridge for iOS/Android wrappers
- **Integrations:** Garmin (via Railway Python service using `garminconnect`), Strava OAuth + webhooks, Apple Health (native bridge), RevenueCat (subscriptions)
- **Tooling:** ESLint, Vitest, Playwright, Bun

### 5. Project Structure
Tree showing top-level layout: `src/pages`, `src/components`, `src/hooks`, `src/contexts`, `src/lib`, `src/integrations/supabase`, `supabase/functions`, `supabase/migrations`.

### 6. Getting Started
- Prerequisites (Node 18+ or Bun, Supabase project / Lovable Cloud)
- Install: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build`
- Tests: `bun run test`
- Lint: `bun run lint`

### 7. Environment & Secrets
Note that secrets are managed via Lovable Cloud (no local `.env` editing required). List required secrets at a high level:
- Supabase URL / anon key (auto-injected)
- Garmin Railway endpoint URL + auth key
- Strava client ID/secret
- Lovable AI gateway key
- RevenueCat webhook secret
- Apple sign-in keys
- Mapbox / weather API keys

### 8. Edge Functions (Supabase)
Brief table grouping the ~30 functions by domain:
- **Garmin:** `garmin-credential-login`, `garmin-credential-mfa`, `garmin-sync`, `garmin-manual-import`, `garmin-daily-health-sync`
- **Strava:** `strava-auth`, `strava-callback`, `strava-sync`, `strava-webhook`, `strava-disconnect`, `strava-activity-streams`
- **Apple:** `apple-auth-start`, `apple-auth-callback`, `apple-health-post-sync`
- **AI:** `ai-running-coach`, `analyze-activity`, `analyze-posture`, `generate-program`, `generate-free-plans`, `generate-suggested-workout`
- **Subscriptions:** `activate-subscription`, `check-revenuecat-status`, `revenuecat-webhook`
- **Misc:** `get-weather`, `scrape-races`, `verify-race`, `apply-xp-decay`, `reset-season`, `send-notification`, `send-daily-morning-push`, `seed-promo-banner`

### 9. Garmin Integration Architecture
Short explanation of the Garmin auth flow:
- Frontend collects credentials → `garmin-credential-login` → Railway `/garmin-login` (uses `garminconnect` Python lib)
- MFA path via `garmin-credential-mfa` → Railway `/garmin-login-mfa`
- Tokens encrypted (`_shared/garminCrypto.ts`) and stored in `garmin_connections`
- Daily cron at 02:00 UTC (10:00 HKT) → `garmin-daily-health-sync` → upserts into `garmin_daily_health`
- Activities synced via `garmin-sync`

### 10. Internationalization
EN / ZH supported via `src/lib/i18n.ts`, toggleable in More tab.

### 11. Testing
- Unit: Vitest (`src/test/`)
- E2E: Playwright (`playwright.config.ts`)

### 12. Deployment
- Web: Lovable hosting (`https://welcome-ward-start.lovable.app`) + custom domain (`angustest.site`)
- Native: Despia builds for iOS / Android
- Backend: Supabase edge functions auto-deployed via Lovable Cloud
- Garmin auth microservice: Railway (separate repo)

### 13. License & Credits
- Built with [Lovable](https://lovable.dev)
- Note that this is a private project (or pick a license — TBD)

---

## File to write
- `README.md` (overwrite the current placeholder)

## Open questions (will assume defaults unless you say otherwise)
1. **License** — assume "private / proprietary" unless you want MIT/Apache.
2. **Public-facing vs internal README** — I'll write it as an internal/developer README (assumes reader has repo access). If you'd rather have a marketing-style README, say so.
3. **Include screenshots?** — I'll skip image embeds since none are in the repo at predictable paths; can add later.

Once approved I'll write the full `README.md` in default mode.