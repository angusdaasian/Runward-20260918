## Fix 503 on `generate-share-poster`

Two root causes from the logs:

**A. Auth crash** — `supabase.auth.getClaims is not a function` (server SDK has no such method). The first invocation 500s here.

**B. Timeout (160s → 503)** — the Gemini image-edit call exceeds the edge function wall clock. Contributing factors:
- Large raw upload (843KB image base64) → slow inbound + slow model.
- No `AbortController` / explicit timeout, so the function just hangs until the platform kills it with an empty 503.
- Quote pre-call adds another network round-trip on top of the image call.

### Fix plan

1. **Auth check** (`supabase/functions/generate-share-poster/index.ts`)
   - Replace `supabase.auth.getClaims(token)` with `supabase.auth.getUser(token)`.
   - Keep the same 401 behavior on failure.

2. **Hard timeout on the Gemini image call**
   - Wrap the `fetch` to `ai.gateway.lovable.dev` in an `AbortController` with a 110s timeout.
   - On `AbortError`, return a clean 504 JSON `{ error: "Generation timed out, please try again" }` so the client toasts instead of receiving an empty 503.
   - Same (shorter, ~15s) timeout on the quote call; on failure just fall back to the default quote — never block image gen on it.

3. **Run quote + image prep in parallel**
   - Kick off the quote fetch and the prompt assembly concurrently with `Promise.all`, so we don't pay two sequential round-trips.

4. **Shrink the inbound payload (client side)** — `src/components/activities/AiPosterDialog.tsx`
   - Before calling the function, downscale the uploaded photo to max 1280px on the long edge and re-encode as JPEG quality 0.82 via a `<canvas>`. This typically drops 843KB → ~150–250KB, cutting upload + model latency significantly and avoiding the 1MB-ish edge body sweet spot.
   - Keep the existing 8MB pre-check as a safety net.
   - Add a small helper `downscaleImage(file, maxEdge, quality): Promise<{ base64, mimeType }>`.

5. **Better client error surfacing**
   - In `AiPosterDialog.generate`, when `error` is a `FunctionsHttpError`, attempt `error.context.json()` to read the structured `{ error }` from the function and toast that, instead of the generic SDK message. Falls back to `error.message` if parsing fails.

6. **Logging**
   - Add `console.log` markers around the Gemini call (`start`, `done in Xms`) so future timeouts are diagnosable from edge function logs.

### Out of scope

- No change to the prompt, style presets, dialog UI/layout, or sharing flow.
- No change to `shareActivity.ts`, `ActivityDetail.tsx`, or `supabase/config.toml`.
- No model swap — staying on `google/gemini-3.1-flash-image-preview`.

### Files touched

- edit: `supabase/functions/generate-share-poster/index.ts` (auth fix, timeouts, parallel quote, logs)
- edit: `src/components/activities/AiPosterDialog.tsx` (client-side downscale, better error toast)
