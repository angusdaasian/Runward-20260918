

## AI Running Coach — Premium Floating Chat

A draggable floating chat button + modal, gated to premium users, with per-user memory, conversation history, and Vertex AI Gemini 3.1 Flash Lite as the brain.

### Files to create

**Frontend**
- `src/components/coach/FloatingChatButton.tsx` — draggable circular button (56/64px), gradient + bounce, snaps to nearest edge, position persisted to `localStorage`, lock overlay for non-premium, X transform when open, z-index 9999.
- `src/components/coach/ChatModal.tsx` — full-screen on mobile (slide-up), 500×700 modal on desktop (fade-in), header, context bar, message list, input, "new conversation", remaining-message counter.
- `src/components/coach/MessageBubble.tsx` — user-right/AI-left chat bubbles with markdown rendering.
- `src/components/coach/TypingIndicator.tsx` — three-dot pulsing animation.
- `src/components/coach/ContextBar.tsx` — "Coach knows: …" summary line.
- `src/components/coach/CoachSettings.tsx` — sheet with units, goal, race date, experience, training days, injuries, intensity, "what coach knows" list, reset memory button.
- `src/components/coach/UpgradeModal.tsx` — premium upsell shown to non-premium taps (reuses existing `launchPaywall` from `useDespiaPurchases`).
- `src/hooks/use-ai-coach.ts` — manages session id, message list, send/receive, remaining-messages count, error toasts.

**Mounting**: render `<FloatingChatButton />` once inside `src/pages/Index.tsx` (after the bottom nav, fixed position so it floats above all tabs). Hidden during onboarding, guest mode, and on `/admin`, `/support`, `/privacy`.

**Backend (Supabase Edge Function)**
- `supabase/functions/ai-running-coach/index.ts` — handles chat. Reuses the existing `callVertexAI` pattern from `analyze-activity` (model: `gemini-3.1-flash-lite-preview`, temperature 0.7, maxOutputTokens 1024). Uses existing `GOOGLE_VERTEX_API_KEY` secret — no new keys needed.

Endpoint logic:
1. Validate JWT → load user.
2. Check `profiles.is_premium` → 403 if false.
3. Check `ai_coach_usage` for today → 429 if ≥100.
4. Load `ai_coach_preferences`, last 10 messages from `ai_coach_conversations` (filtered by `session_id`), top insights from `ai_coach_insights`, recent 7-day activities from `garmin_activities` + `strava_activities` + `apple_health_activities`, and `profiles` (display_name, experience).
5. Build system prompt with all context + safety rules.
6. Call Vertex AI.
7. Insert user + assistant messages into `ai_coach_conversations`, increment `ai_coach_usage` (upsert).
8. Fire-and-forget secondary Vertex call to extract insights from the latest exchange → upsert into `ai_coach_insights` (best-effort, ignore failures).
9. Return `{ response, session_id, remaining_messages_today }`.

Also handles a `?action=preferences` POST/GET for reading/updating preferences from the settings sheet (so the client never writes directly with elevated trust — keeps validation server-side).

### Database migration

Four new tables, all RLS-enabled with owner-only policies:

- **ai_coach_preferences** — `user_id` unique, `preferred_units` text default `'kilometers'`, `training_goal` text, `target_race_date` date, `experience_level` text, `training_days` jsonb default `'[]'`, `injuries_concerns` text, `training_intensity` text, timestamps.
- **ai_coach_conversations** — `user_id`, `session_id` uuid, `role` text (`user`|`assistant`), `content` text, `metadata` jsonb, `created_at`. Index on `(user_id, session_id, created_at)`.
- **ai_coach_insights** — `user_id`, `insight_type` text, `insight_key` text, `insight_value` text, `confidence` numeric, timestamps. Unique `(user_id, insight_key)`.
- **ai_coach_usage** — `user_id`, `date` date, `message_count` int default 0. Unique `(user_id, date)`.

RLS: each table — users can SELECT/INSERT/UPDATE/DELETE their own rows (`auth.uid() = user_id`). Edge function uses service role to bypass for cross-table reads.

### UX details

- **First-time premium**: opening the modal with no prior conversation triggers a welcome message + onboarding questions; answers are saved to `ai_coach_preferences` as the user replies (the AI is prompted to call out preference updates, parsed server-side).
- **Returning user**: greeting references most recent activity from connected sources.
- **Non-premium tap**: lock-icon button → `UpgradeModal` → `launchPaywall()`.
- **Rate-limit hit**: input disabled, banner shows reset time.
- **New conversation**: generates a fresh `session_id` (uuid) client-side, posts with `new_session: true`.
- **Reset memory**: deletes user's rows from `ai_coach_conversations` and `ai_coach_insights` (preferences kept).
- **Bilingual**: respects existing `app_lang` localStorage; system prompt instructs AI to reply in user's language.
- **Dark mode**: uses semantic tokens (`bg-card`, `text-foreground`, `border-border`, `bg-primary`) so it matches existing theme.
- **Drag**: pointer events (works for touch + mouse), constrained to viewport minus button size, snaps left/right on release with spring transition.

### Out of scope (not built)

- Streaming responses (request/response only — keeps the edge function simple and matches `analyze-activity` style).
- Conversation history browser UI (sessions exist in DB but only the active session is shown; can be added later).
- Voice input.
- Push-notification reminders from coach.

### Open questions before implementation

1. **Mounting scope** — show the floating button only inside `Index` (the in-app tabs), or also on `/support`, `/privacy`, `/admin`? Default: Index only.
2. **Daily limit** — keep 100 hard-coded, or store in a config table for future tuning? Default: hard-coded constant in the edge function.
3. **Insight extraction** — do the secondary AI call (richer memory, ~2x token cost) or skip it for v1? Default: include it, since "remembers everything" is a stated requirement.

