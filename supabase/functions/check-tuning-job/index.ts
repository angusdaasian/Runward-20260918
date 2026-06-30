// Admin-only: check the status of a Vertex AI tuning job and return details including the deployed model endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { getVertexAccessToken } from "../_shared/vertex-auth.ts";

const TRAINING_SA = "GOOGLE_VERTEX_TRAINING_SA_JSON";

const QuerySchema = z.object({
  job_name: z.string().min(1),
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

    if (!["GET", "POST"].includes(req.method)) return json(405, { error: "method not allowed" });

    let job_name: string | null = null;
    if (req.method === "GET") {
      const url = new URL(req.url);
      job_name = url.searchParams.get("job_name");
    } else {
      const body = await req.json().catch(() => ({}));
      const parsed = QuerySchema.safeParse(body);
      if (parsed.success) job_name = parsed.data.job_name;
    }
    const parsed = QuerySchema.safeParse({ job_name });
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });

    const projectId = Deno.env.get("GOOGLE_VERTEX_TRAINING_PROJECT_ID")!;
    const location = Deno.env.get("GOOGLE_VERTEX_TRAINING_LOCATION") || "us-central1";
    if (!projectId) return json(400, { error: "GOOGLE_VERTEX_TRAINING_PROJECT_ID is not configured" });

    const token = await getVertexAccessToken(TRAINING_SA);
    const baseUrl = `https://${location}-aiplatform.googleapis.com/v1`;
    const jobUrl = parsed.data.job_name.startsWith("projects/")
      ? `${baseUrl}/${parsed.data.job_name}`
      : `${baseUrl}/projects/${projectId}/locations/${location}/tuningJobs/${parsed.data.job_name}`;

    const resp = await fetch(jobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json().catch(() => ({} as any));
    if (!resp.ok) {
      return json(400, { error: `Vertex tuning job check failed (${resp.status})`, details: body });
    }

    return json(200, {
      success: true,
      job: {
        name: body.name,
        displayName: body.displayName,
        state: body.state,
        createTime: body.createTime,
        startTime: body.startTime,
        endTime: body.endTime,
        error: body.error,
        tunedModel: body.tunedModel,
        modelToValidate: body.modelToValidate,
        trainingStats: body.tuningDataStats,
      },
      location,
      project_id: projectId,
    });
  } catch (e) {
    console.error("[check-tuning-job]", e);
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});

