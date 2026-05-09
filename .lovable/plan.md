# AI Poster Share

Add a new share option on Activity Detail that lets the user upload a photo of themselves, and uses Gemini (Nano Banana 2 image edit) to generate a stylized motivational poster with their run stats overlaid — similar in spirit to the reference image (big number, hand-drawn vibe, stat sticker, quote).

## Flow

1. On `ActivityDetail`, add a 4th item in the Share dropdown: **"Generate AI Poster" / "AI 海報"** (Premium-gated like the others).
2. Clicking opens a new `AiPosterDialog`:
   - File input ("Upload your photo")
   - Language toggle reuses current `lang`
   - Optional style preset chip row (e.g. *Bold Hype*, *Minimal Zen*, *Retro Magazine*) — picks a different prompt template
   - "Generate" button → calls edge function with photo + activity stats
   - Loading state with progress text (Gemini image gen takes ~10–30s)
   - Result preview, then **Share / Save / Regenerate** buttons (reuse existing despia / Web Share / download distribution helpers from `shareActivity.ts`).

## Backend

New edge function `supabase/functions/generate-share-poster/index.ts`:

- Auth via JWT (verify_jwt = true), CORS like other functions.
- Body: `{ imageBase64, mimeType, stats: { distanceKm, timeStr, paceStr, calories?, hr?, elevation? }, quote?, stylePreset, lang }`.
- If no `quote` provided, first do a tiny text completion (`google/gemini-3-flash-preview`) to generate a single short motivational running quote in the requested language.
- Build the image-edit prompt and call AI Gateway with `google/gemini-3.1-flash-image-preview` (Nano Banana 2 — best quality/speed for this), `modalities: ["image","text"]`, with the user's photo as the input image.
- Prompt template (English example, mirrored for zh):
  > Create a vertical 4:5 motivational running poster using this photo as the hero. Keep the person clearly visible and unaltered. Add bold hand-painted brush typography for the headline `{distanceKm}K DONE` in vivid yellow. Add a translucent rounded glass stat card in the lower-left containing: Distance {distanceKm} km, Time {timeStr}, Pace {paceStr}/km, Calories {calories} kcal — clean sans-serif, small icons. Add a hand-written motivational quote in the upper-right: "{quote}". Add small doodles (hearts, arrows, sun) sparingly. Style: energetic, magazine-poster, slight grain, high contrast. Do NOT add watermarks or extra text. Output a single image.
- Map style preset → tweaks (color palette, doodle density, font vibe).
- Handle 429/402 → return JSON error; client toasts.
- Return `{ imageDataUrl }` (base64 from Gemini response).

## Frontend additions

- `src/components/activities/AiPosterDialog.tsx` (new)
  - Uses shadcn `Dialog`, `Button`, `Input type=file`, `RadioGroup` for style.
  - Reads file → base64; calls `supabase.functions.invoke("generate-share-poster", { body })`.
  - On success, renders the returned data URL in an `<img>` and exposes Save/Share via a small helper extracted from `shareActivity.ts` (`distributeBlob(blob, filename)`).
- Tiny refactor in `src/lib/shareActivity.ts`: extract the existing despia/Web Share/download branch into an exported `distributeImageBlob(blob, filename, lang)` so the new dialog reuses it (no behavior change for current shares).
- `ActivityDetail.tsx`: add the new dropdown item, gated by `isPremium`, opens the dialog with current activity stats.

## Stats passed in

Computed once in `ActivityDetail` from the activity:
`distanceKm` (2 dp), `timeStr` (h:mm:ss or m:ss), `paceStr` (m:ss), optional `calories`, `avgHr`, `elevationGain`.

## Out of scope

- No DB schema changes, no storing of generated posters.
- No edits to existing `shareActivity` / `shareSplits` / `shareCharts` rendering.
- No camera capture flow — file upload only (works on mobile via native picker).
- No multi-image input.

## Files

- new: `supabase/functions/generate-share-poster/index.ts`
- new: `src/components/activities/AiPosterDialog.tsx`
- edit: `src/components/activities/ActivityDetail.tsx` (add dropdown item + dialog mount)
- edit: `src/lib/shareActivity.ts` (export `distributeImageBlob` helper)
- edit: `supabase/config.toml` (register new function, `verify_jwt = true`)
