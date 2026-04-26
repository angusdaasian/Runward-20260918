// Shared helper for calling the Garmin Railway service.
// Persists refreshed OAuth tokens back to garmin_connections so that
// the long-lived session keeps working past the OAuth2 ~24h expiry.

import { encryptString } from "./garminCrypto.ts";

interface CallOpts {
  supabase: any;
  userId: string;
  railwayUrl: string;
  path: string; // e.g. "/garmin-activities"
  email: string;
  oauth1Token: string;
  oauth2Token: string;
  extraBody?: Record<string, unknown>;
}

interface CallResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorText?: string;
  reauthRequired?: boolean;
  // Updated tokens that the caller should use for subsequent requests in
  // the same invocation. Already persisted to the DB by this helper.
  oauth1Token: string;
  oauth2Token: string;
}

export async function callRailway<T = any>(opts: CallOpts): Promise<CallResult<T>> {
  const { supabase, userId, railwayUrl, path, email, oauth1Token, oauth2Token, extraBody } = opts;

  let res: Response;
  try {
    res = await fetch(`${railwayUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        oauth1_token: oauth1Token,
        oauth2_token: oauth2Token,
        ...(extraBody ?? {}),
      }),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorText: e instanceof Error ? e.message : "fetch failed",
      oauth1Token,
      oauth2Token,
    };
  }

  // Try to parse JSON body whether ok or not — Railway returns errors as JSON too.
  let body: any = null;
  let bodyText = "";
  try {
    bodyText = await res.text();
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = null;
  }

  if (res.status === 401) {
    // OAuth1 ticket is dead — flag user for re-auth.
    try {
      await supabase
        .from("garmin_connections")
        .update({ needs_reauth: true })
        .eq("user_id", userId);
    } catch (e) {
      console.error("[garminRailway] failed to set needs_reauth:", e);
    }
    return {
      ok: false,
      status: 401,
      data: body,
      errorText: bodyText.slice(0, 200),
      reauthRequired: true,
      oauth1Token,
      oauth2Token,
    };
  }

  // If Railway echoed back updated tokens (auto-refresh happened inside
  // garminconnect / garth), re-encrypt and persist them. We also update
  // last_refreshed_at for observability.
  let nextOauth1 = oauth1Token;
  let nextOauth2 = oauth2Token;

  const echoedOauth1: string | undefined =
    typeof body?.oauth1_token === "string" ? body.oauth1_token : undefined;
  const echoedOauth2: string | undefined =
    typeof body?.oauth2_token === "string" ? body.oauth2_token : undefined;

  const oauth1Changed = !!echoedOauth1 && echoedOauth1 !== oauth1Token;
  const oauth2Changed = !!echoedOauth2 && echoedOauth2 !== oauth2Token;

  if (oauth1Changed || oauth2Changed) {
    try {
      const updates: Record<string, unknown> = {
        last_refreshed_at: new Date().toISOString(),
      };
      if (oauth1Changed) {
        updates.oauth1_token_encrypted = await encryptString(echoedOauth1!);
        nextOauth1 = echoedOauth1!;
      }
      if (oauth2Changed) {
        updates.oauth2_token_encrypted = await encryptString(echoedOauth2!);
        nextOauth2 = echoedOauth2!;
      }
      const { error: updErr } = await supabase
        .from("garmin_connections")
        .update(updates)
        .eq("user_id", userId);
      if (updErr) console.error("[garminRailway] persist refreshed tokens failed:", updErr);
      else
        console.log(
          `[garminRailway] persisted refreshed tokens user=${userId} oauth1Changed=${oauth1Changed} oauth2Changed=${oauth2Changed}`,
        );
    } catch (e) {
      console.error("[garminRailway] re-encrypt failed:", e);
    }
  }

  // For successful payloads, strip the token fields from `data` so callers
  // don't accidentally treat them as part of the resource payload.
  let cleanData: any = body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const { oauth1_token: _o1, oauth2_token: _o2, ...rest } = body;
    cleanData = rest;
  }

  return {
    ok: res.ok,
    status: res.status,
    data: cleanData as T,
    errorText: res.ok ? undefined : bodyText.slice(0, 200),
    oauth1Token: nextOauth1,
    oauth2Token: nextOauth2,
  };
}
