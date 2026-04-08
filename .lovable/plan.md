

## Fix Build Errors + Enable Apple Health + Add name_zh Column

### Problem 1: RaceTab.tsx — `name_zh` missing from Supabase types
The `races` table in the generated types file doesn't have `name_zh`. The migration to add `name_zh` to the `races` table needs to be created (it was done in the other Lovable project but not this one). After the migration runs, the types will regenerate. Meanwhile, fix the cast on line 235 to use `unknown` first.

**Fix**: 
- Create a database migration: `ALTER TABLE public.races ADD COLUMN IF NOT EXISTS name_zh text;`
- Change line 235 from `(data as Race[])` to `(data as unknown as Race[])`

### Problem 2: use-apple-health.ts — `connected_at` not in types
The `apple_health_connections` table Insert type only has `created_at`, `id`, `updated_at`, `user_id`. The code on line 119 passes `connected_at` which doesn't exist in the schema.

**Fix**: Remove `connected_at` from the upsert — use `updated_at` instead:
```typescript
.upsert({ user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
```

### Problem 3: Enable Apple Health in ConnectApps
The ConnectApps component currently shows Apple Health as "Coming Soon" with `opacity-50`. Re-enable it with the connect/disconnect buttons (the functional code is already there but the UI is hardcoded to "coming soon").

### Changes Summary
1. **Database migration** — Add `name_zh text` column to `races` table
2. **`src/components/RaceTab.tsx`** line 235 — Cast through `unknown`
3. **`src/hooks/use-apple-health.ts`** line 119 — Replace `connected_at` with `updated_at`
4. **`src/components/ConnectApps.tsx`** — Re-enable Apple Health card with connect/disconnect functionality (remove opacity-50, remove "Coming Soon" badge, restore interactive buttons)

