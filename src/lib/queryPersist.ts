import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";

/**
 * Cold-start cache persistence.
 *
 * Only lightweight, cheap-to-store queries are persisted so a relaunch can
 * paint real content immediately instead of a skeleton. Heavy queries (full
 * activity history with HR samples / polylines) stay in memory only.
 */

const STORAGE_KEY = "runward-query-cache";
export const QUERY_CACHE_BUSTER = "v1";
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

const PERSISTED_KEYS = new Set([
  "user-profile",
  "fitness-connection",
  "planned-workouts",
  "user-races",
]);

const ACTIVITY_KEYS = new Set([
  "terra-activities",
  "strava-activities",
  "apple-health-activities",
  "garmin-activities",
  "suunto-activities",
]);

/** Persist small profile/plan queries + the "latest activity" (limit 1) queries. */
export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey as unknown[];
  const root = typeof key[0] === "string" ? (key[0] as string) : "";
  if (PERSISTED_KEYS.has(root)) return true;
  if (ACTIVITY_KEYS.has(root)) return key[key.length - 1] === 1;
  return false;
}

export const queryPersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: STORAGE_KEY,
  throttleTime: 2000,
  // Storage can be full / disabled — never let persistence break the app.
  retry: ({ persistedClient, error }) => {
    console.warn("[queryPersist] write failed, dropping cache", error);
    return undefined;
  },
});
