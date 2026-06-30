# Train Llama 3.1 8B LoRA on Old Vertex Account (Free Trial Credit, Expires July 3)

Goal: burn the $2,160.31 expiring Vertex Free Trial credit on a one-time supervised fine-tune of Llama 3.1 8B Instruct, using our 2026 runner data. Export LoRA weights to GCS. Decide hosting (Mac Mini vs Runpod) after eval. Live app keeps using Gemini 3.1 Pro on the current Vertex account — no user-facing changes.

## Why this works across accounts

Vertex AI tuning is account-scoped, but the output is a portable LoRA adapter (safetensors + adapter_config.json) that runs anywhere with the open Llama 3.1 8B base. The current account stays clean for inference. We just need the service-account JSON from the old project.

## Timeline (must finish before July 3 credit expiry)

- Today: export dataset, upload to GCS, kick off tuning job.
- Job runs: ~4–10 hours for 8B LoRA on ~10–20k examples.
- After export: download weights, run eval comparison, decide hosting.

## Secrets needed

- `GOOGLE_VERTEX_TRAINING_SA_JSON` — service account JSON for the **old** GCP project (paste the whole JSON).
- `GOOGLE_VERTEX_TRAINING_PROJECT_ID` — old GCP project ID.
- `GOOGLE_VERTEX_TRAINING_BUCKET` — GCS bucket name in the old project (e.g., `runner-llama-training`).
- `GOOGLE_VERTEX_TRAINING_LOCATION` — region, default `us-central1`.

Existing inference secrets (`GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON`, `GOOGLE_VERTEX_PROJECT_ID`, etc.) are untouched.

## Steps

### 1. New edge function: `export-coach-training-data`
Admin-only. Reads all 2026 activities across the 7 provider tables, joins to `profiles` and `ai_coach_insights`, and emits JSONL for 4 task types matching our structured Gemini calls:

- `analyze_activity` — input: single activity + recent context; target: analysis JSON from `activity_analyses`.
- `suggest_workout` — input: user context + day; target: workout JSON from recent Gemini outputs.
- `predict_race_time` — input: profile + recent training; target: predicted times from existing records.
- `finetune_plan_week` — input: plan + feedback; target: adjusted week from existing records.

Estimated ~10–20k examples. Uploads `gs://$BUCKET/datasets/coach-train-{ts}.jsonl` via a signed REST upload with the training SA token.

### 2. New edge function: `submit-llama-tuning-job`
Admin-only. POSTs to the old project's Vertex AI tuning endpoint for `meta/llama3-1-8b-instruct-maas` with LoRA rank 16, 3 epochs, learning rate 1e-4. Output dir: `gs://$BUCKET/models/coach-lora-{ts}/`. Returns the tuning job resource name.

### 3. New edge function: `check-tuning-job`
Admin-only. Polls a tuning job's status and returns progress + final GCS path of LoRA weights.

### 4. Admin UI panel (Settings → Admin → Llama Training)
- Button: Export training dataset → shows row count and GCS path.
- Button: Submit tuning job → shows job name.
- Status: polls `check-tuning-job` every 30s, shows state and final weights URI.

No A/B wiring, no shadow calls, no model switch in this plan. Pure training pipeline.

## After training (separate plan)

Once weights land in GCS, we'll do a follow-up plan covering: download from GCS, host on Mac Mini or Runpod, build the A/B shadow harness, and decide whether to switch any edge functions off Gemini.

## Out of scope

- Hosting / serving the trained model
- A/B comparison harness or admin rater UI
- Switching any edge function off Gemini 3.1 Pro
- Cohort reference model
- Touching the current Vertex account or inference path
- GenAI App Builder credit

## Technical details

- Tuning endpoint: `https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{OLD_PROJECT}/locations/{LOCATION}/tuningJobs` with `baseModel: "meta/llama3-1-8b-instruct-maas"`.
- Auth: reuse `_shared/vertex-auth.ts` pattern, parameterized to accept a different SA JSON env name so these 3 functions use the training SA.
- All 3 new functions: admin-gated via `has_role(auth.uid(), 'admin')`, `verify_jwt = false` with in-code JWT validation (matches existing pattern).
- No new DB tables. Job state lives in Vertex; the UI polls.
- Dataset export streams JSONL to avoid edge function memory limits (chunked GCS resumable upload).

## Risk

If the credit expires mid-job or Vertex Llama tuning quota is hit, the durable JSONL dataset remains in GCS and can be re-run on any GPU host later. The dataset is the reusable artifact.