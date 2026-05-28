## 1. Update today's sync zero-activity message
In `supabase/functions/terra-sync-today/index.ts`, replace the `noData` response messages (lines 200-201) with clearer copy:

- **EN**: "Your data hasn't reached our service provider yet, or you don't have any latest activity today. Please try again shortly."
- **ZH**: "您的資料尚未傳到我們的供應商，或者您今天沒有任何最新活動。請稍後再試。"

## 2. Supabase Data API grant compliance check
The migration `20260527143428_5519d292-c28d-4358-a392-189ea96eda05.sql` already includes explicit `GRANT` statements for the new `terra_sync_usage` table:
- `GRANT SELECT, INSERT ON public.terra_sync_usage TO authenticated;`
- `GRANT ALL ON public.terra_sync_usage TO service_role;`

**No action needed.** The project is already compliant with Supabase's new default (May 30 for new projects, Oct 30 enforced for existing). The existing project retains current behavior until Oct 30, and our migration already has the required grants.