import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { POLAR_API_BASE } from "../_shared/polar.ts";

// Admin-only management of the single Polar AccessLink webhook.
// Polar uses partner-level (Basic auth with client_id:client_secret) for webhook CRUD.
// Docs: https://www.polar.com/accesslink-api/#create-webhook

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientId = Deno.env.get("POLAR_CLIENT_ID");
    const clientSecret = Deno.env.get("POLAR_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Polar not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(SUPABASE_URL, ANON);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE);

    // admin check
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "list";

    const basic = btoa(`${clientId}:${clientSecret}`);
    const polarHeaders = {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    if (action === "list") {
      const res = await fetch(`${POLAR_API_BASE}/webhooks`, { headers: polarHeaders });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      return new Response(JSON.stringify({ ok: res.ok, status: res.status, polar: json }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const url: string = body.url;
      const events: string[] = body.events ?? ["EXERCISE"];
      if (!url) {
        return new Response(JSON.stringify({ error: "url required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${POLAR_API_BASE}/webhooks`, {
        method: "POST",
        headers: polarHeaders,
        body: JSON.stringify({ events, url }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, status: res.status, polar: json }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Polar returns: { data: { id, events, url, signature_secret_key } } OR flat fields
      const w = json.data ?? json;
      const id = String(w.id);
      const signature_secret = w.signature_secret_key ?? w.signature_secret;

      // Replace any existing rows (we only support one webhook)
      await supabase.from("polar_webhooks").delete().neq("id", id);
      await supabase.from("polar_webhooks").upsert({
        id,
        url: w.url ?? url,
        events: w.events ?? events,
        signature_secret,
      });

      return new Response(JSON.stringify({ ok: true, polar: json }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const id: string | undefined = body.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${POLAR_API_BASE}/webhooks/${id}`, {
        method: "DELETE", headers: polarHeaders,
      });
      await supabase.from("polar_webhooks").delete().eq("id", id);
      return new Response(JSON.stringify({ ok: res.ok, status: res.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("polar-webhook-manage error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
