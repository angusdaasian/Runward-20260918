/**
 * Tiny typed localStorage wrapper for offline data caching.
 *
 * Keys are namespaced with `cache:` to avoid colliding with other
 * localStorage keys used by the app (auth, theme, lang, etc.).
 *
 * Values are stored as `{ v: T, t: number }` where `t` is the write timestamp
 * in ms (used for optional TTL checks).
 */

const PREFIX = "cache:";

interface Envelope<T> {
  v: T;
  t: number;
}

function key(k: string): string {
  return PREFIX + k;
}

export function getCached<T>(k: string): { value: T; storedAt: number } | null {
  try {
    const raw = localStorage.getItem(key(k));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (parsed && typeof parsed === "object" && "v" in parsed && "t" in parsed) {
      return { value: parsed.v, storedAt: parsed.t };
    }
    return null;
  } catch {
    return null;
  }
}

export function setCached<T>(k: string, value: T): void {
  try {
    const env: Envelope<T> = { v: value, t: Date.now() };
    localStorage.setItem(key(k), JSON.stringify(env));
  } catch {
    // Quota exceeded or storage disabled — fail silently.
  }
}

export function clearCached(k: string): void {
  try {
    localStorage.removeItem(key(k));
  } catch {
    /* ignore */
  }
}

/** Returns true if the cached entry is older than ttlMs (or missing). */
export function isStale(k: string, ttlMs: number): boolean {
  const cached = getCached<unknown>(k);
  if (!cached) return true;
  return Date.now() - cached.storedAt > ttlMs;
}

// ─── Cache key helpers (centralised to avoid typos) ───
export const CacheKeys = {
  freePlans: (distance: string) => `free_plans:${distance}`,
  trainingPlan: (userId: string) => `training_plan:${userId}`,
  races: () => `races:upcoming`,
} as const;
