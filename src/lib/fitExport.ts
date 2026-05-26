// FIT file export helpers.
// Produces a minimal but valid Garmin .fit Activity file from whatever data
// we have for an activity (Strava streams, Terra/Garmin/Apple per-second
// samples, or summary-only as a fallback).

import { FitEncoder, FitConstants, FitMessages, Message } from "fit-encoder";
import { supabase } from "@/integrations/supabase/client";

type Sample = { t: number; v: number };

export interface FitActivityInput {
  id: string;
  strava_id?: number;
  name?: string | null;
  sport_type?: string | null;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time?: number | null;
  total_elevation_gain?: number | null;
  start_date: string;
  average_speed?: number | null; // m/s
  max_speed?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  source?: string | null;
  provenance?: string | null;
  summary_polyline?: string | null;
  hr_samples?: Array<{ t: number; bpm: number }> | null;
  distance_samples?: Array<{ t: number; d: number }> | null;
  elevation_samples?: Array<{ t: number; e: number }> | null;
  cadence_samples?: Array<{ t: number; rpm: number }> | null;
}

// Polyline decoder (Google encoded polyline algorithm)
function decodePolyline(str: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    let b: number, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

// Convert degrees to FIT semicircles (signed int32)
function toSemicircles(deg: number): number {
  return Math.round((deg / 180) * 0x80000000);
}

function sportFor(activity: FitActivityInput): { sport: number; sub: number } {
  const s = (activity.sport_type || "").toLowerCase();
  const C = FitConstants as any;
  if (s.includes("ride") || s.includes("cycl") || s.includes("bik")) {
    return { sport: C.sport.cycling, sub: C.sub_sport.generic };
  }
  if (s.includes("swim")) return { sport: C.sport.swimming, sub: C.sub_sport.generic };
  if (s.includes("walk") || s.includes("hike")) return { sport: C.sport.walking, sub: C.sub_sport.generic };
  return { sport: C.sport.running, sub: C.sub_sport.generic };
}

// Build per-second records from whatever data the activity has.
function buildRecords(activity: FitActivityInput, streams: any[] | null): Array<{
  t: number;
  lat?: number;
  lng?: number;
  distance?: number;
  speed?: number;
  hr?: number;
  altitude?: number;
  cadence?: number;
}> {
  const out: Map<number, any> = new Map();
  const add = (t: number, key: string, v: any) => {
    if (v == null || !isFinite(v)) return;
    const ti = Math.round(t);
    const cur = out.get(ti) || { t: ti };
    cur[key] = v;
    out.set(ti, cur);
  };

  // Strava-style streams: parallel arrays keyed by `time` (sec)
  if (Array.isArray(streams) && streams.length > 0) {
    const time = streams.find((s: any) => s.type === "time")?.data as number[] | undefined;
    if (time && time.length > 0) {
      const hr = streams.find((s: any) => s.type === "heartrate")?.data as number[] | undefined;
      const dist = streams.find((s: any) => s.type === "distance")?.data as number[] | undefined;
      const alt = streams.find((s: any) => s.type === "altitude")?.data as number[] | undefined;
      const vel = streams.find((s: any) => s.type === "velocity_smooth")?.data as number[] | undefined;
      const cad = streams.find((s: any) => s.type === "cadence")?.data as number[] | undefined;
      const ll = streams.find((s: any) => s.type === "latlng")?.data as Array<[number, number]> | undefined;
      for (let i = 0; i < time.length; i++) {
        const t = time[i];
        if (hr?.[i] != null) add(t, "hr", hr[i]);
        if (dist?.[i] != null) add(t, "distance", dist[i]);
        if (alt?.[i] != null) add(t, "altitude", alt[i]);
        if (vel?.[i] != null) add(t, "speed", vel[i]);
        if (cad?.[i] != null) add(t, "cadence", cad[i]);
        if (ll?.[i]) {
          add(t, "lat", ll[i][0]);
          add(t, "lng", ll[i][1]);
        }
      }
    }
  }

  // Terra/Garmin/Apple per-second samples (with `t` offset in seconds)
  if (Array.isArray(activity.hr_samples)) {
    for (const s of activity.hr_samples) add(s.t, "hr", s.bpm);
  }
  if (Array.isArray(activity.distance_samples)) {
    for (const s of activity.distance_samples) add(s.t, "distance", s.d);
  }
  if (Array.isArray(activity.elevation_samples)) {
    for (const s of activity.elevation_samples) add(s.t, "altitude", s.e);
  }
  if (Array.isArray(activity.cadence_samples)) {
    for (const s of activity.cadence_samples) add(s.t, "cadence", s.rpm);
  }

  // Fallback: if we have no lat/lng samples but have a summary_polyline, sprinkle
  // its points evenly across the activity duration so the route shows in the FIT.
  const haveLatLng = Array.from(out.values()).some((r) => r.lat != null);
  if (!haveLatLng && activity.summary_polyline) {
    try {
      const pts = decodePolyline(activity.summary_polyline);
      if (pts.length > 1) {
        const dur = Math.max(1, activity.moving_time || activity.elapsed_time || pts.length);
        for (let i = 0; i < pts.length; i++) {
          const t = Math.round((i / (pts.length - 1)) * dur);
          add(t, "lat", pts[i][0]);
          add(t, "lng", pts[i][1]);
        }
      }
    } catch { /* ignore */ }
  }

  return Array.from(out.values()).sort((a, b) => a.t - b.t);
}

export function buildFitFile(activity: FitActivityInput, streams: any[] | null = null): Uint8Array {
  const C = FitConstants as any;
  const M = FitMessages as any;
  const startMs = new Date(activity.start_date).getTime();
  const startFit = FitEncoder.toFitTimestamp(new Date(startMs));
  const dur = Math.max(1, Math.round(activity.elapsed_time || activity.moving_time || 1));
  const endFit = startFit + dur;
  const { sport, sub } = sportFor(activity);

  const encoder = new (FitEncoder as any)();

  // file_id
  new Message(C.mesg_num.file_id, M.file_id, "time_created", "manufacturer", "product", "type")
    .writeDataMessage(startFit, C.manufacturer.development, 0, C.file.activity);

  // start event
  new Message(C.mesg_num.event, M.event, "timestamp", "data", "event", "event_type")
    .writeDataMessage(startFit, 0, C.event.timer, C.event_type.start);

  // sport
  new Message(C.mesg_num.sport, M.sport, "sport", "sub_sport").writeDataMessage(sport, sub);

  // records
  const records = buildRecords(activity, streams);
  const recordMsg = new Message(
    C.mesg_num.record,
    M.record,
    "timestamp",
    "position_lat",
    "position_long",
    "altitude",
    "heart_rate",
    "cadence",
    "distance",
    "speed",
  );

  if (records.length > 0) {
    for (const r of records) {
      const ts = startFit + r.t;
      const lat = r.lat != null ? toSemicircles(r.lat) : 0x7fffffff; // invalid
      const lng = r.lng != null ? toSemicircles(r.lng) : 0x7fffffff;
      // altitude scale = 5, offset = 500  => stored = (alt + 500) * 5
      const alt = r.altitude != null ? Math.round((r.altitude + 500) * 5) : 0xffff;
      const hr = r.hr != null ? Math.round(r.hr) : 0xff;
      const cad = r.cadence != null ? Math.round(r.cadence) : 0xff;
      const dist = r.distance != null ? Math.round(r.distance * 100) : 0xffffffff; // scale 100
      const spd = r.speed != null ? Math.round(r.speed * 1000) : 0xffff; // scale 1000
      recordMsg.writeDataMessage(ts, lat, lng, alt, hr, cad, dist, spd);
    }
  } else {
    // Summary-only fallback: emit two records (start + end with total distance)
    recordMsg.writeDataMessage(startFit, 0x7fffffff, 0x7fffffff, 0xffff, 0xff, 0xff, 0, 0xffff);
    recordMsg.writeDataMessage(
      endFit,
      0x7fffffff,
      0x7fffffff,
      0xffff,
      0xff,
      0xff,
      Math.round(activity.distance * 100),
      0xffff,
    );
  }

  // stop event
  new Message(C.mesg_num.event, M.event, "timestamp", "data", "event", "event_type")
    .writeDataMessage(endFit, 0, C.event.timer, C.event_type.stop_all);

  // lap (one big lap covering whole activity)
  new Message(
    C.mesg_num.lap,
    M.lap,
    "timestamp",
    "start_time",
    "total_elapsed_time",
    "total_timer_time",
    "total_distance",
    "event",
    "event_type",
  ).writeDataMessage(
    endFit,
    startFit,
    dur * 1000, // scale 1000
    Math.round((activity.moving_time || dur) * 1000),
    Math.round(activity.distance * 100), // scale 100
    C.event.lap,
    C.event_type.stop,
  );

  // session
  new Message(
    C.mesg_num.session,
    M.session,
    "timestamp",
    "start_time",
    "total_elapsed_time",
    "total_timer_time",
    "total_distance",
    "sport",
    "sub_sport",
    "avg_speed",
    "max_speed",
    "avg_heart_rate",
    "max_heart_rate",
    "total_ascent",
    "event",
    "event_type",
    "first_lap_index",
    "num_laps",
  ).writeDataMessage(
    endFit,
    startFit,
    dur * 1000,
    Math.round((activity.moving_time || dur) * 1000),
    Math.round(activity.distance * 100),
    sport,
    sub,
    activity.average_speed != null ? Math.round(activity.average_speed * 1000) : 0xffff,
    activity.max_speed != null ? Math.round(activity.max_speed * 1000) : 0xffff,
    activity.average_heartrate != null ? Math.round(activity.average_heartrate) : 0xff,
    activity.max_heartrate != null ? Math.round(activity.max_heartrate) : 0xff,
    activity.total_elevation_gain != null ? Math.round(activity.total_elevation_gain) : 0xffff,
    C.event.session,
    C.event_type.stop,
    0,
    1,
  );

  // activity
  new Message(
    C.mesg_num.activity,
    M.activity,
    "timestamp",
    "total_timer_time",
    "local_timestamp",
    "num_sessions",
    "type",
    "event",
    "event_type",
  ).writeDataMessage(
    endFit,
    Math.round((activity.moving_time || dur) * 1000),
    startFit,
    1,
    C.activity.manual,
    C.event.activity,
    C.event_type.stop,
  );

  return new Uint8Array(encoder.getFile());
}

// Resolve streams for a Strava activity (if needed) by calling the edge function.
export async function fetchStravaStreams(stravaId: number): Promise<any[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke("strava-activity-streams", {
      body: { strava_id: stravaId },
    });
    if (error) return null;
    return (data as any)?.streams || null;
  } catch {
    return null;
  }
}

// Sanitize a filename component (no slashes/colons etc).
function safeName(s: string, max = 60): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, max) || "activity";
}

export function fitFilenameFor(activity: FitActivityInput): string {
  const d = new Date(activity.start_date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${dt}_${safeName(activity.name || "activity", 40)}.fit`;
}

export function triggerDownload(bytes: Uint8Array, filename: string, mime = "application/octet-stream") {
  // Cast Uint8Array to a generic ArrayBuffer-backed BlobPart to satisfy newer DOM lib types
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export async function exportActivityFit(activity: FitActivityInput): Promise<void> {
  let streams: any[] | null = null;
  if (activity.strava_id && activity.strava_id > 0 && activity.provenance !== "garmin" && activity.provenance !== "terra" && activity.source !== "Apple Health") {
    streams = await fetchStravaStreams(activity.strava_id);
  }
  const bytes = buildFitFile(activity, streams);
  triggerDownload(bytes, fitFilenameFor(activity));
}
