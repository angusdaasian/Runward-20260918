# Runward — Your Running Training Companion

> Mobile-first running app that combines workout tracking, AI posture analysis, AI-generated training programs, and gamified progression — wrapped into a clean, bilingual (EN / 中文) experience.

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)

---

## Overview

Runward helps runners **train smarter, run better, and stay motivated**. It pulls activity data from Garmin / Strava / Apple Health (or manual `.fit` / `.gpx` upload), analyzes running form on-device with TensorFlow.js, generates personalized training plans via AI, and adds a layer of gamification (XP, ranks, monthly leaderboards, daily check-ins, redeemable rewards).

It ships as a responsive web app at [runward.app](https://welcome-ward-start.lovable.app) and as a native iOS / Android shell via Despia.

---

## Key Features

| Tab | What it does |
|---|---|
| **Activities** | Calendar view, year heatmap, training-load chart, monthly road quest, suggested next workout, activity detail with map & laps |
| **Analytics** | Performance trends, posture analysis history, **Garmin daily health card** (VO₂max, resting HR, sleep duration, sleep score) |
| **Training** | AI-generated personalized programs and free pre-built plans by goal distance & pace |
| **Races** | Race discovery, user-submitted race verification, admin moderation queue |
| **Rewards** | XP system, rank tiers (Bronze → Diamond), monthly leaderboards, daily check-in streaks, redeemable promo codes |
| **Coach** | Floating AI chat bubble — context-aware running advice, plan tweaks, recovery suggestions |
| **More** | Profile, connect apps, language toggle (EN / ZH), notifications, admin panel |

Plus standalone tools: VDOT calculator, pace equivalents, race-time predictor.

---

## Tech Stack

**Frontend**
- React 18 · Vite 5 · TypeScript 5
- Tailwind CSS v3 + shadcn/ui (Radix primitives)
- TanStack Query · React Router · React Hook Form + Zod
- Framer Motion · Recharts · Leaflet (activity maps)
- TensorFlow.js + `@tensorflow-models/pose-detection` (on-device posture analysis)

**Backend**
- [Lovable Cloud](https://lovable.dev) — Supabase (Postgres, Auth, Storage, Edge Functions on Deno)
- Row-Level Security (RLS) on every table; roles via `user_roles` + `has_role()` SECURITY DEFINER
- AES-GCM encryption helpers for sensitive third-party tokens (`_shared/garminCrypto.ts`)

**AI & Integrations**
- Lovable AI Gateway (Vertex / Gemini) for coach chat, activity analysis, posture feedback, plan generation
- **Garmin** — credential login + MFA via separate Railway Python service using `garminconnect`
- **Strava** — OAuth + webhook-driven activity sync
- **Apple Health** — native bridge via Despia / `median-js-bridge`
- **RevenueCat** — subscription management (premium tier)
- **Apple Sign-In** — passwordless auth for iOS
- **OneSignal** — push notifications
- **WeatherAPI / Mapbox** — race-day weather and activity maps
- **Firecrawl** — race scraping for the discovery feed

**Native shell**
- Despia + median-js-bridge wrap the web app into iOS / Android binaries with native auth, share intent, push, and HealthKit

**Tooling**
- Bun (preferred) / Node 18+
- ESLint · Vitest · Playwright

---

## Project Structure

```
runward/
├── src/
│   ├── pages/                   # Top-level routes (Index, Landing, Admin, Privacy, Support, …)
│   ├── components/              # Tab screens, shared UI, feature modules
│   │   ├── activities/          # Activity detail, calendar, charts
│   │   ├── analytics/           # Analytics cards (incl. GarminHealthCard)
│   │   ├── posture/             # Pose overlay, radar chart, results
│   │   ├── coach/               # AI chat UI
│   │   ├── rewards/             # XP, leaderboards, check-in, claim codes
│   │   ├── admin/               # Admin moderation panels
│   │   └── ui/                  # shadcn/ui primitives
│   ├── hooks/                   # use-activities, use-garmin, use-apple-health, use-ai-coach, …
│   ├── contexts/                # AuthContext, PremiumContext
│   ├── integrations/supabase/   # Generated client + types (auto-managed)
│   ├── lib/                     # i18n, ranks, VDOT, training load, native detection, …
│   └── assets/                  # Static images
├── supabase/
│   ├── functions/               # Deno edge functions (see table below)
│   ├── migrations/              # SQL migrations
│   └── config.toml              # Function-level config (verify_jwt, etc.)
├── public/                      # Static assets, _redirects, robots.txt
├── playwright.config.ts         # E2E tests
├── vitest.config.ts             # Unit tests
└── tailwind.config.ts           # Design tokens
```

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) (preferred) **or** Node.js 18+
- A Supabase project (or use Lovable Cloud, which auto-provisions one)

### Install & run

```bash
# install deps
bun install

# start the dev server (Vite on http://localhost:8080)
bun run dev

# production build
bun run build

# preview the production build locally
bun run preview

# unit tests
bun run test

# e2e tests (Playwright)
bunx playwright test

# lint
bun run lint
```

The dev server reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env` (auto-populated when running on Lovable Cloud — no manual setup needed in that case).

---

## Environment & Secrets

Secrets are managed in **Lovable Cloud → Settings → Functions → Secrets** (or in the Supabase dashboard for self-hosted setups). They are injected into edge functions as `Deno.env.get("…")` and never exposed to the browser.

Required secrets (high-level):

| Domain | Secrets |
|---|---|
| Supabase (auto) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_DB_URL` |
| Garmin | `GARMIN_RAILWAY_URL`, `GARMIN_ENC_KEY` (32-byte base64 AES-GCM key) |
| Strava | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_CLIENT_ID_PROD`, `STRAVA_CLIENT_SECRET_PROD`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `STRAVA_WEBHOOK_VERIFY_TOKEN_PROD` |
| AI | `LOVABLE_API_KEY`, `GOOGLE_VERTEX_API_KEY` |
| Push | `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` |
| Subscriptions | `REVENUECAT_SECRET_KEY` |
| Misc | `WEATHERAPI_KEY`, `FIRECRAWL_API_KEY`, `WEBHOOK_AUTH_KEY`, `SAHHA_CLIENT_ID`, `SAHHA_CLIENT_SECRET` |

Public values (safe in client code): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

---

## Edge Functions

All functions live in `supabase/functions/<name>/index.ts` and deploy automatically on push.

| Domain | Functions |
|---|---|
| **Garmin** | `garmin-credential-login`, `garmin-credential-mfa`, `garmin-sync`, `garmin-manual-import`, `garmin-daily-health-sync` |
| **Strava** | `strava-auth`, `strava-callback`, `strava-sync`, `strava-webhook`, `strava-disconnect`, `strava-activity-streams` |
| **Apple** | `apple-auth-start`, `apple-auth-callback`, `apple-health-post-sync` |
| **AI** | `ai-running-coach`, `analyze-activity`, `analyze-posture`, `generate-program`, `generate-free-plans`, `generate-suggested-workout` |
| **Subscriptions** | `activate-subscription`, `check-revenuecat-status`, `revenuecat-webhook` |
| **Races** | `scrape-races`, `verify-race` |
| **Gamification** | `apply-xp-decay`, `reset-season` |
| **Notifications** | `send-notification`, `send-daily-morning-push` |
| **Misc** | `get-weather`, `seed-promo-banner` |

---

## Garmin Integration Architecture

Garmin doesn't expose an official OAuth API for individuals, so we run a small Python microservice on **Railway** that wraps the community [`garminconnect`](https://github.com/cyberjunky/python-garminconnect) library. The auth tokens never leave our servers.

```
┌──────────────┐    1. credentials      ┌──────────────────────────┐
│  Mobile/Web  │ ───────────────────▶  │ garmin-credential-login   │
│   (React)    │                       │   (Supabase edge fn)      │
└──────────────┘                       └────────────┬──────────────┘
                                                    │ 2. POST /garmin-login
                                                    ▼
                                       ┌──────────────────────────┐
                                       │   Railway Python svc     │
                                       │  (FastAPI + garminconnect)│
                                       └────────────┬──────────────┘
                                                    │ 3. tokens (or needs_mfa)
                                                    ▼
                                       ┌──────────────────────────┐
                                       │  AES-GCM encrypt + store │
                                       │   in garmin_connections  │
                                       └──────────────────────────┘
```

- If Garmin requires **MFA**, the edge function returns `needs_mfa: true` with an encrypted credential bundle. The client then submits the 6-digit code to `garmin-credential-mfa`, which forwards it to Railway's `/garmin-login-mfa`.
- Activities are fetched on-demand via `garmin-sync` (incremental, monthly chunked).
- Daily health metrics (VO₂max, resting HR, sleep) are pulled by a **`pg_cron` job at 02:00 UTC (10:00 HKT)** that calls `garmin-daily-health-sync` for every connected user.
- Tokens are encrypted at rest with AES-GCM (`_shared/garminCrypto.ts`) using a 32-byte key in `GARMIN_ENC_KEY`.

The Railway service is a separate repository (not in this repo). Its `main.py` exposes:
- `POST /garmin-login` · `POST /garmin-login-mfa` · `POST /garmin-activities` · `POST /garmin-activity-details` · `POST /garmin-health-stats`

---

## Internationalization

Two languages are supported out of the box: **English** and **繁體中文**. Strings live in `src/lib/i18n.ts` and are accessed via `t(key, lang)`. The active language is persisted to `localStorage.app_lang` and toggleable from the **More** tab.

When adding a new component, prefer inline ternaries (`lang === "zh" ? "中文" : "English"`) for one-off strings and the `t()` helper for shared UI labels.

---

## Testing

```bash
# unit tests (Vitest + jsdom + Testing Library)
bun run test
bun run test:watch

# end-to-end (Playwright — see playwright.config.ts)
bunx playwright test
bunx playwright test --ui
```

- Unit tests: `src/test/`
- Test setup: `src/test/setup.ts`

---

## Deployment

| Target | How it deploys |
|---|---|
| **Web** | [welcome-ward-start.lovable.app](https://welcome-ward-start.lovable.app) + custom domain `angustest.site` — published via Lovable's "Publish" flow |
| **iOS / Android** | Despia builds wrap the published web URL into native shells with HealthKit, push, and share intent |
| **Edge functions** | Auto-deployed on every push via Lovable Cloud (or `supabase functions deploy`) |
| **Database migrations** | `supabase/migrations/*.sql` — applied through the Supabase migration tool |
| **Garmin auth service** | Deployed separately on Railway from its own repo |
| **Cron jobs** | `pg_cron` in Postgres — see SQL editor for active schedules (e.g. `garmin-daily-health-10am-hkt`) |

---

## Contributing

1. Branch from `main`, make changes, run `bun run lint && bun run test`
2. Database changes go through `supabase/migrations/` (never edit the live schema directly)
3. New secrets are added in Lovable Cloud / Supabase dashboard — never commit values to the repo
4. Follow the existing semantic-token Tailwind approach (`bg-primary`, `text-foreground`, etc.) — avoid raw color classes

---

## License

Proprietary — © Runward. All rights reserved.

Built with [Lovable](https://lovable.dev).
