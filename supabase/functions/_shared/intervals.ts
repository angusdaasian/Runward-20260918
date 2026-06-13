// Shared helpers for intervals.icu integration.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type IntervalsConnection = {
  user_id: string;
  athlete_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
};

const TOKEN_URL = "https://intervals.icu/api/oauth/token";
const API_BASE = "https://intervals.icu/api/v1";

export async function refreshIntervalsTokenIfNeeded(
  conn: IntervalsConnection,
  supabase: ReturnType<typeof createClient>,
) {
  const now = Math.floor(Date.now() / 1000);
  if (conn.expires_at > now + 60) return conn.access_token;

  const clientId = Deno.env.get("INTERVALS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("INTERVALS_CLIENT_SECRET")!;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`intervals.icu token refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
  await supabase
    .from("intervals_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || conn.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", conn.user_id);

  return data.access_token as string;
}

export function mapIntervalsActivity(userId: string, a: any) {
  return {
    user_id: userId,
    intervals_id: String(a.id),
    name: a.name ?? null,
    sport_type: a.type ?? a.sport ?? "Run",
    distance: a.distance ?? null,
    moving_time: a.moving_time ?? a.movingTime ?? null,
    elapsed_time: a.elapsed_time ?? a.elapsedTime ?? null,
    total_elevation_gain: a.total_elevation_gain ?? a.elevation_gain ?? null,
    start_date: a.start_date_local ?? a.start_date ?? null,
    average_speed: a.average_speed ?? null,
    max_speed: a.max_speed ?? null,
    average_heartrate: a.average_heartrate ?? a.icu_average_hr ?? null,
    max_heartrate: a.max_heartrate ?? a.icu_max_hr ?? null,
    summary_polyline: a.map?.summary_polyline ?? a.map_polyline ?? null,
    environment: "prod",
  };
}

export { API_BASE as INTERVALS_API_BASE };
