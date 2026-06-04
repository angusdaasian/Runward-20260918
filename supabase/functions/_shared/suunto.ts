// Shared helpers for Suunto Cloud API integration.
// Cloud API base: https://cloudapi.suunto.com/v2
// All requests require Bearer token + Ocp-Apim-Subscription-Key header (= client id).

export const SUUNTO_API_BASE = 'https://cloudapi.suunto.com/v2';

// Map Suunto activityId -> our sport_type label.
// Reference: https://apizone.suunto.com/activitydefinitions
const RUNNING_ACTIVITY_IDS = new Set([3, 4, 22, 46, 47, 49, 70]); // run / trail run / treadmill / orienteering
const CYCLING_ACTIVITY_IDS = new Set([5, 6, 7, 22, 29, 39, 40]);
const SWIMMING_ACTIVITY_IDS = new Set([15, 16, 32, 33]);

export function mapSuuntoSport(activityId: number | null | undefined): string {
  if (activityId == null) return 'Run';
  if (RUNNING_ACTIVITY_IDS.has(activityId)) return 'Run';
  if (CYCLING_ACTIVITY_IDS.has(activityId)) return 'Ride';
  if (SWIMMING_ACTIVITY_IDS.has(activityId)) return 'Swim';
  if (activityId === 1 || activityId === 11) return 'Walk';
  if (activityId === 2) return 'Hike';
  return 'Workout';
}

export async function refreshSuuntoToken(
  conn: { refresh_token: string; expires_at: number; user_id: string },
  supabase: any,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (conn.expires_at > now + 60) return (conn as any).access_token;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch('https://cloudapi-oauth.suunto.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Suunto refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
  await supabase
    .from('suunto_connections')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? conn.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', conn.user_id);
  return data.access_token;
}

export type SuuntoWorkout = {
  workoutKey: string;
  workoutName?: string;
  activityId?: number;
  startTime?: number; // epoch ms
  totalTime?: number; // seconds
  totalDistance?: number; // meters
  totalAscent?: number; // meters
  maxSpeed?: number; // m/s
  averageSpeed?: number;
  hrdata?: { avg?: number; max?: number };
  averageHeartRate?: number;
  maxHeartRate?: number;
  centerPosition?: { x: number; y: number };
};

export function workoutRow(userId: string, w: SuuntoWorkout) {
  const startIso = w.startTime
    ? new Date(w.startTime).toISOString()
    : new Date().toISOString();
  const duration = w.totalTime ? Math.round(w.totalTime) : 0;
  return {
    user_id: userId,
    suunto_workout_key: String(w.workoutKey),
    name: w.workoutName ?? null,
    sport_type: mapSuuntoSport(w.activityId),
    activity_id: w.activityId ?? null,
    distance: w.totalDistance ?? null,
    moving_time: duration,
    elapsed_time: duration,
    total_elevation_gain: w.totalAscent ?? null,
    start_date: startIso,
    average_speed: w.averageSpeed ?? null,
    max_speed: w.maxSpeed ?? null,
    average_heartrate: w.averageHeartRate ?? w.hrdata?.avg ?? null,
    max_heartrate: w.maxHeartRate ?? w.hrdata?.max ?? null,
    summary_polyline: null,
    environment: 'prod' as const,
  };
}
