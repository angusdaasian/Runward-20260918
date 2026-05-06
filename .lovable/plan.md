## Remove Manual Upload Feature

All sync platforms (Garmin OAuth, Strava, Apple Health, Terra, COROS via Terra) are live, so the manual import paths are no longer needed.

### Frontend deletions
- Delete `src/components/activities/ManualImportTabs.tsx`
- Delete `src/components/activities/ManualGarminImport.tsx`
- Delete `src/components/activities/CorosFitImport.tsx`
- Delete `src/pages/ManualUploadGuide.tsx`
- Delete the 7 guide screenshot assets: `src/assets/garmin-step-1.png` … `garmin-step-6.png` (incl. `5a`/`5b`)

### Wire-up updates
- `src/components/ActivitiesTab.tsx` — remove the `ManualImportTabs` import and the `<ManualImportTabs ... />` render.
- `src/App.tsx` — remove the `ManualUploadGuide` import and the `/manual-upload-guide` route.

### Backend deletions
- Delete edge function `supabase/functions/garmin-manual-import/` (folder + index.ts).
- Remove its entry from `supabase/config.toml` if listed.

### Verification
- Grep for `ManualImport`, `ManualGarmin`, `CorosFit`, `ManualUpload`, `manual-upload-guide`, `garmin-manual-import` to confirm zero remaining references.
- Confirm share-intent handling (Garmin URL share) is no longer wired — share intent listener was only consumed inside `ManualImportTabs`; `registerShareIntent()` in `App.tsx` will stay (harmless) unless you want it removed too. I'll leave it in place to avoid scope creep; let me know if you want it stripped.