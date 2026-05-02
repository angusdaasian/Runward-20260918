## Confirmed bug — approved pending races get wiped on every scrape

When an admin clicks ✓ Approve in **Pending Race Confirmation**, the row is inserted into the public `races` table with `source: "user_submitted"` (`PendingRaceManager.tsx` line 38–45).

But the `scrape-races` edge function deletes from `races` indiscriminately in **three** places:

1. Line 733 — cross-source dedup: `supabase.from("races").delete().not("id", "is", null)` — wipes everything.
2. Line 843 — per-source filtered run: `delete().eq("source", sv)` — safe (only touches the scraper's own sources).
3. Line 846 — full run: `delete().not("id", "is", null)` — wipes everything, including `user_submitted`.

So whenever the full scraper runs (or the cross-source dedup triggers), every approved community race disappears.

### Fix

Exclude any non-scraper source from deletion in all three call sites. The scraper only owns these sources:
`flyareyou_japan`, `flyareyou_overseas`, `fitz_hk`, `world_athletics_china`, `taipei_marathon_tw`.

Anything else (`user_submitted` today, plus any future admin-added or imported source) must be preserved.

Concrete edits in `supabase/functions/scrape-races/index.ts`:

1. Define a constant near the top:
   ```ts
   const SCRAPER_SOURCES = [
     "flyareyou_japan",
     "flyareyou_overseas",
     "fitz_hk",
     "world_athletics_china",
     "taipei_marathon_tw",
   ];
   ```

2. Line 733 (cross-source dedup delete) — change to:
   ```ts
   await supabase.from("races").delete().in("source", SCRAPER_SOURCES);
   ```
   And in the SELECT at line 700, also filter `.in("source", SCRAPER_SOURCES)` so user-submitted rows are never pulled into the dedup/re-insert pipeline (otherwise they'd get re-inserted with a scraper category mapping).

3. Line 846 (full run delete) — change to:
   ```ts
   await supabase.from("races").delete().in("source", SCRAPER_SOURCES);
   ```

4. Line 843 stays as-is (already source-scoped).

### Why not just add a DB-level guard?

We could add a trigger that blocks deletes where `source = 'user_submitted'`, but the scraper would then throw on every run. Source-scoping the delete is the right fix and keeps the door open for other manually-added sources later.

### Optional follow-up (not required)

Approved pending races currently get inserted with a single `category` and no `name_zh` / `description`. If you want, I can also have the approve flow let admins pick multiple categories, but that's a separate request — say the word.

### Summary

Single edge-function file change. No migration, no schema change, no frontend change. After deploy, approved community races will survive every scrape run.