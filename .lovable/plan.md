## Fix `analyze-posture` 500 errors

### Edit `supabase/functions/analyze-posture/index.ts`

1. Update `VERTEX_MODEL_MAP` and default model in `callVertexAI` to use `gemini-3-flash-preview` (the same model `analyze-activity` uses successfully). Map `google/gemini-3.1-flash-preview` → `gemini-3-flash-preview` so existing call sites keep working without further changes.

2. In `callVertexAI`, when Vertex returns non-OK, log the upstream status and response body (`console.error("Vertex error:", status, body)`) before returning, so future failures are visible in edge function logs.

3. In the top-level `serve` handler `catch`, include the error stack in the logged output for clearer triage.

No client, schema, RLS, or secrets changes. After deploy, verify with a small curl call and check logs.
