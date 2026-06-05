import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUUNTO_API_BASE, refreshSuuntoToken, workoutRow, SuuntoWorkout } from "../_shared/suunto.ts";
import { fetchSuuntoFit, parseFit } from "../_shared/suunto-fit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendActivityUploadedNotification(supabase: any, userId: string, activityKey: string) {
  try {
    const { data: claim, error: claimErr } = await supabase
      .from("activity_push_log")
      .insert({ user_id: userId, activity_key: activityKey })
      .select("id")
      .maybeSingle();
    if (claimErr || !claim) {
      console.log(`[suunto-webhook] push already sent for ${userId} ${activityKey}, skipping`);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("activity_notifications")
      .eq("user_id", userId)
      .single();
    if (!profile?.activity_notifications) return;

    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!onesignalAppId || !onesignalApiKey) return;

    let lang: "zh" | "en" = "en";
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      const meta: any = (data?.user as any)?.user_metadata ?? {};
      const raw = String(meta.lang ?? meta.language ?? meta.locale ?? "").toLowerCase();
      if (raw.startsWith("zh")) lang = "zh";
    } catch (_) { /* default en */ }

    const title = lang === "zh" ? "新活動已同步" : "New activity synced";
    const message = lang === "zh" ? "你的最新活動已上傳。" : "Your latest activity has been uploaded.";

    await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${onesignalApiKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        include_external_user_ids: [userId],
        headings: { en: title },
        contents: { en: message },
      }),
    });
  } catch (e) {
    console.error("[suunto-webhook] push notification failed", e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Suunto pings the workout-notification URL on completion with JSON
  // { username: "...", workoutid: "..." }. Respond 200 quickly.
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  let event: any = null;
  try { event = await req.json(); }
  catch (_) {
    try { event = JSON.parse(await req.text()); } catch (_) { /* ignore */ }
  }
  console.log('[suunto-webhook] event:', JSON.stringify(event));

  // Suunto webhook payload shape:
  // { type: "WORKOUT_CREATED", username: "...", workout: { workoutKey, ... } }
  // Older/legacy: { username, workoutid }
  const username: string | undefined = event?.username;
  const inlineWorkout: SuuntoWorkout | undefined = event?.workout;
  const workoutId: string | undefined = event?.workoutid || inlineWorkout?.workoutKey;

  if (!username || !workoutId) {
    console.log('[suunto-webhook] skipping, missing username/workoutid');
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('SUUNTO_CLIENT_ID')!;
    const clientSecret = Deno.env.get('SUUNTO_CLIENT_SECRET')!;
    const subKey = Deno.env.get('SUUNTO_SUBSCRIPTION_KEY') || clientId;
    const supabase = createClient(SUPABASE_URL, SERVICE);

    const { data: conn } = await supabase
      .from('suunto_connections')
      .select('*')
      .eq('suunto_username', username)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn) {
      console.log('[suunto-webhook] no connection for', username);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let w: SuuntoWorkout | undefined = inlineWorkout;
    let accessToken: string | null = null;

    // If the workout looks incomplete (e.g. missing activityId or distance), or wasn't inlined, fetch it
    const needsFetch = !w || !w.workoutKey;
    if (needsFetch) {
      accessToken = await refreshSuuntoToken(conn, supabase, clientId, clientSecret);
      const res = await fetch(`${SUUNTO_API_BASE}/workout/${workoutId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Ocp-Apim-Subscription-Key': subKey,
        },
      });
      const text = await res.text();
      if (!res.ok) {
        console.error('[suunto-webhook] fetch workout failed', res.status, text);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const payload = JSON.parse(text);
      w = payload?.payload ?? payload;
    }

    if (w?.workoutKey) {
      await supabase
        .from('suunto_activities')
        .upsert(workoutRow(conn.user_id, w), { onConflict: 'suunto_workout_key' });
      console.log('[suunto-webhook] saved workout summary', w.workoutKey, 'for', conn.user_id);

      // Fetch + parse FIT for detail samples (HR/distance/elevation/cadence + polyline).
      try {
        if (!accessToken) {
          accessToken = await refreshSuuntoToken(conn, supabase, clientId, clientSecret);
        }
        const fitBuf = await fetchSuuntoFit(accessToken, subKey, w.workoutKey);
        if (fitBuf) {
          const details = await parseFit(fitBuf);
          await supabase
            .from('suunto_activities')
            .update({
              hr_samples: details.hr_samples,
              distance_samples: details.distance_samples,
              elevation_samples: details.elevation_samples,
              cadence_samples: details.cadence_samples,
              summary_polyline: details.summary_polyline,
              has_details: true,
            })
            .eq('suunto_workout_key', String(w.workoutKey))
            .eq('user_id', conn.user_id);
          console.log('[suunto-webhook] saved FIT details', w.workoutKey,
            'hr:', details.hr_samples?.length ?? 0,
            'gps:', details.has_gps);
        }
      } catch (fitErr) {
        console.error('[suunto-webhook] fit detail fetch/parse failed', fitErr);
      }

      await sendActivityUploadedNotification(supabase, conn.user_id, `suunto:${w.workoutKey}`);
    }
  } catch (err) {
    console.error('[suunto-webhook] error:', err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
