// Admin-only edge function for seeding promo banners.
// Requires authenticated admin JWT. Ignores any client-supplied created_by.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CAPTION_LEN = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- AUTH: require valid JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    // --- AUTHORIZATION: must be admin ---
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr || !roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- INPUT VALIDATION ---
    const body = await req.json().catch(() => ({}));
    const imageUrl: string | undefined = body.image_url;
    const imageBase64: string | undefined = body.image_base64;
    const endsAt: string | undefined = body.ends_at;
    const caption: string = (body.caption ?? "").toString().slice(0, MAX_CAPTION_LEN);
    const captionZh: string = (body.caption_zh ?? "").toString().slice(0, MAX_CAPTION_LEN);
    const replaceId: string | undefined = body.replace_id;

    if (!imageUrl && !imageBase64) {
      return new Response(
        JSON.stringify({ error: "image_url or image_base64 required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!endsAt) {
      return new Response(JSON.stringify({ error: "ends_at required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const endsAtDate = new Date(endsAt);
    if (isNaN(endsAtDate.getTime()) || endsAtDate.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "ends_at must be a valid future ISO date" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- RESOLVE IMAGE BYTES ---
    let bytes: Uint8Array;
    if (imageBase64) {
      const clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const bin = atob(clean);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const imgResp = await fetch(imageUrl!);
      if (!imgResp.ok) {
        return new Response(JSON.stringify({ error: `failed fetching image: ${imgResp.status}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const ct = imgResp.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) {
        return new Response(
          JSON.stringify({ error: `URL did not return an image (got ${ct || "unknown"})` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      bytes = new Uint8Array(await imgResp.arrayBuffer());
    }

    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({ error: `Image too large (max ${MAX_IMAGE_BYTES} bytes)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isPng && !isJpg) {
      return new Response(
        JSON.stringify({ error: "Decoded data is not a valid PNG or JPEG image" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ext = isPng ? "png" : "jpg";
    const contentType = isPng ? "image/png" : "image/jpeg";
    const filename = `promo-${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from("promo-banners")
      .upload(filename, bytes, { contentType, upsert: false });

    if (upErr) {
      return new Response(JSON.stringify({ error: `upload: ${upErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = admin.storage.from("promo-banners").getPublicUrl(filename);

    if (replaceId) {
      const { data: oldRow } = await admin
        .from("promo_banners")
        .select("image_url")
        .eq("id", replaceId)
        .maybeSingle();
      if (oldRow?.image_url) {
        try {
          const u = new URL(oldRow.image_url);
          const idx = u.pathname.indexOf("/promo-banners/");
          if (idx >= 0) {
            const path = u.pathname.slice(idx + "/promo-banners/".length);
            await admin.storage.from("promo-banners").remove([path]);
          }
        } catch { /* ignore */ }
      }
      await admin.from("promo_banners").delete().eq("id", replaceId);
    }

    const { data: row, error: insErr } = await admin
      .from("promo_banners")
      .insert({
        image_url: pub.publicUrl,
        caption,
        caption_zh: captionZh,
        display_order: 0,
        ends_at: endsAtDate.toISOString(),
        is_active: true,
        created_by: callerId, // always the verified caller, never client-supplied
      })
      .select()
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: `insert: ${insErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, id: row.id, image_url: pub.publicUrl, bytes: bytes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
