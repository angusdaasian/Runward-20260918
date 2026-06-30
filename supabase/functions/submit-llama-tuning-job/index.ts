// Admin-only: submit a Llama 3.1 8B supervised tuning job on Vertex AI using an exported GCS JSONL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { getVertexAccessToken } from "../_shared/vertex-auth.ts";

const TRAINING_SA = "GOOGLE_VERTEX_TRAINING_SA_JSON";

const BodySchema = z.object({
  gcs_uri: z.string().regex(/^gs:\/\/.+\/.+\.jsonl$/),
  display_name: z.string().min(1).max(128).default("runner-coach-llama-3-1-8b"),
  tuned_model_display_name: z.string().min(1).max(128).optional(),
  train_steps: z.number().int().min(10).max(5000).default(300),
  learning_rate_multiplier: z.number().min(0.1).max(10).default(1.0),
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!auth) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${auth}` } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json(403, { error: "forbidden" });

    if (req.method !== "POST") return json(405, { error: "method not allowed" });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { gcs_uri, display_name, tuned_model_display_name, train_steps, learning_rate_multiplier } = parsed.data;

    const projectId = Deno.env.get("GOOGLE_VERTEX_TRAINING_PROJECT_ID")!;
    const location = Deno.env.get("GOOGLE_VERTEX_TRAINING_LOCATION") || "us-central1";
    if (!projectId) return json(400, { error: "GOOGLE_VERTEX_TRAINING_PROJECT_ID is not configured" });

    const token = await getVertexAccessToken(TRAINING_SA);
    const baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}`;

    // Submit a supervised tuning job for Llama 3.1 8B Instruct.
    const payload = {
      displayName: display_name,
      tunedModelDisplayName: tuned_model_display_name || `${display_name}-tuned`,
      baseModel: "publishers/meta/models/llama-3.1-8b-instruct",
      tuningData: {
        gcsSource: {
          uris: [gcs_uri],
        },
      },
      trainSteps: train_steps,
      learningRateMultiplier: learning_rate_multiplier,
    };

    const resp = await fetch(`${baseUrl}/tuningJobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      return json(400, { error: `Vertex tuning job submission failed (${resp.status})`, details: body });
    }

    return json(200, {
      success: true,
      job: {
        name: body.name,
        displayName: body.displayName,
        state: body.state,
        createTime: body.createTime,
        tunedModelDisplayName: body.tunedModelDisplayName,
      },
      location,
      project_id: projectId,
    });
  } catch (e) {
    console.error("[submit-llama-tuning-job]", e);
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
