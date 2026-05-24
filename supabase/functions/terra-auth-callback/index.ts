import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getTerraCreds, type TerraEnv } from "../_shared/terraEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const redirect = (to: string) => new Response(null, { status: 302, headers: { ...corsHeaders, Location: to } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "success").toLowerCase();
  const terraUserId = (url.searchParams.get("user_id") ?? "").trim();
  const referenceId = (url.searchParams.get("reference_id") ?? "").trim();
  const provider = (url.searchParams.get("resource") ?? url.searchParams.get("provider") ?? "").toUpperCase().trim();
  const env: TerraEnv = url.searchParams.get("env") === "test" ? "test" : "prod";
  const returnUrl = new URL(url.searchParams.get("return_url") || (env === "test" ? "https://angustest.site/terra-return" : "https://pacecalculator.fun/terra-return"));

  for (const [key, value] of url.searchParams.entries()) {
    if (!["return_url", "env"].includes(key)) returnUrl.searchParams.set(key, value);
  }

  if (status !== "success" || !terraUserId || !referenceId || !provider || referenceId === "null") {
    console.log(`[terra-auth-callback] passthrough status=${status} provider=${provider} terra_user_id=${terraUserId || "missing"} reference_id=${referenceId || "missing"}`);
    return redirect(returnUrl.toString());
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { devId, apiKey } = getTerraCreds(env);
    let terraUser: any = null;

    const info = await fetch(`https://api.tryterra.co/v2/userInfo?user_id=${encodeURIComponent(terraUserId)}`, {
      headers: { "dev-id": devId, "x-api-key": apiKey },
    });
    if (!info.ok) {
      console.error(`[terra-auth-callback] userInfo failed terra_user_id=${terraUserId} status=${info.status}`);
      return redirect(returnUrl.toString());
    }
    const userInfo = await info.json().catch(() => ({}));
    terraUser = userInfo?.user ?? null;
    if (!terraUser || userInfo?.is_authenticated === false) {
      console.error(`[terra-auth-callback] userInfo not authenticated terra_user_id=${terraUserId}`);
      return redirect(returnUrl.toString());
    }

    if (terraUser?.reference_id && terraUser.reference_id !== referenceId) {
      console.error(`[terra-auth-callback] reference mismatch terra_user_id=${terraUserId} redirect=${referenceId} terra=${terraUser.reference_id}`);
      return redirect(returnUrl.toString());
    }

    const { data: existing } = await admin
      .from("terra_connections")
      .select("id, user_id")
      .eq("terra_user_id", terraUserId)
      .maybeSingle();

    if (!existing || existing.user_id === referenceId) {
      const { error } = await admin.from("terra_connections").upsert({
        user_id: referenceId,
        terra_user_id: terraUserId,
        provider,
        reference_id: referenceId,
        active: true,
        last_webhook_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });
      if (error) console.error("[terra-auth-callback] upsert failed", error);
      else console.log(`[terra-auth-callback] linked provider=${provider} terra_user_id=${terraUserId} user_id=${referenceId} env=${env}`);
    } else {
      console.error(`[terra-auth-callback] terra_user_id already linked terra_user_id=${terraUserId} existing=${existing.user_id} redirect=${referenceId}`);
    }
  } catch (e) {
    console.error("[terra-auth-callback] error", e);
  }

  return redirect(returnUrl.toString());
});