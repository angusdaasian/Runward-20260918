// Shared helpers for routing OAuth, token refresh, and webhooks to the
// correct Strava API app when multiple apps are configured to share the
// total athlete pool. Each app has its own client_id / client_secret /
// verify_token and a max_athletes cap (Strava enforces 10 per unapproved
// app; raise to 999 once approved).

export interface StravaApp {
  id: string;
  client_id: string;
  client_secret: string | null;
  verify_token: string | null;
  subscription_id: number | null;
  max_athletes: number;
  priority: number;
  is_active: boolean;
}

export class StravaAppsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Fallback to env secrets only for the legacy primary app (Client ID 215250)
// while the admin UI gets the new secret pasted in.
function envFallbackSecret(clientId: string): string | null {
  const legacyId = Deno.env.get("STRAVA_CLIENT_ID_PROD");
  if (legacyId && legacyId === clientId) {
    return Deno.env.get("STRAVA_CLIENT_SECRET_PROD") ?? null;
  }
  return null;
}

function envFallbackVerifyToken(clientId: string): string | null {
  const legacyId = Deno.env.get("STRAVA_CLIENT_ID_PROD");
  if (legacyId && legacyId === clientId) {
    return Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN_PROD")
      ?? Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN")
      ?? null;
  }
  return null;
}

function hydrate(row: any): StravaApp {
  return {
    id: row.id,
    client_id: row.client_id,
    client_secret: row.client_secret ?? envFallbackSecret(row.client_id),
    verify_token: row.verify_token ?? envFallbackVerifyToken(row.client_id),
    subscription_id: row.subscription_id,
    max_athletes: row.max_athletes,
    priority: row.priority,
    is_active: row.is_active,
  };
}

export async function getStravaAppById(supabase: any, id: string): Promise<StravaApp> {
  const { data, error } = await supabase
    .from("strava_apps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    throw new StravaAppsError("APP_NOT_FOUND", `Strava app ${id} not found`);
  }
  return hydrate(data);
}

export async function pickAvailableApp(supabase: any): Promise<StravaApp> {
  const { data: apps, error } = await supabase
    .from("strava_apps")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  if (error) throw error;
  if (!apps || apps.length === 0) {
    throw new StravaAppsError("NO_APPS_CONFIGURED", "No active Strava apps configured");
  }
  for (const row of apps) {
    const { count } = await supabase
      .from("strava_connections")
      .select("id", { count: "exact", head: true })
      .eq("strava_app_id", row.id);
    if ((count ?? 0) < row.max_athletes) {
      const app = hydrate(row);
      if (!app.client_secret) {
        throw new StravaAppsError(
          "APP_SECRET_MISSING",
          `Strava app ${app.client_id} has no client_secret set`
        );
      }
      return app;
    }
  }
  throw new StravaAppsError(
    "ALL_APPS_FULL",
    "All Strava apps have reached their athlete cap"
  );
}

export async function getActiveApps(supabase: any): Promise<StravaApp[]> {
  const { data, error } = await supabase
    .from("strava_apps")
    .select("*")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map(hydrate);
}

export async function getAppForConnection(
  supabase: any,
  connection: { strava_app_id?: string | null }
): Promise<StravaApp> {
  if (connection.strava_app_id) {
    return await getStravaAppById(supabase, connection.strava_app_id);
  }
  // Legacy connection with no app link — fall back to first active app
  // matching the env primary client id.
  const legacyId = Deno.env.get("STRAVA_CLIENT_ID_PROD");
  if (legacyId) {
    const { data } = await supabase
      .from("strava_apps")
      .select("*")
      .eq("client_id", legacyId)
      .maybeSingle();
    if (data) return hydrate(data);
  }
  throw new StravaAppsError("APP_NOT_FOUND", "No Strava app associated with this connection");
}
