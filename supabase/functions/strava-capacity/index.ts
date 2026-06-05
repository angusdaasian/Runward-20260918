import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pickAvailableApp, StravaAppsError } from "../_shared/strava-apps.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    try {
      await pickAvailableApp(supabase);
      return new Response(JSON.stringify({ full: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      if (e instanceof StravaAppsError && e.code === "ALL_APPS_FULL") {
        return new Response(JSON.stringify({ full: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
  } catch (error) {
    console.error("strava-capacity error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ full: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
