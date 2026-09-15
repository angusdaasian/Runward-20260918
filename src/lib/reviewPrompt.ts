/**
 * Native App Store / Play Store rating prompt.
 *
 * Uses Despia's `rateapp://` bridge, which presents the OS's own star-rating
 * sheet in place (iOS SKStoreReviewController / Google Play In-App Review).
 * The OS rate-limits displays and may silently swallow the request, so this
 * module tracks its own engagement signals and only spends a request on
 * users who have shown real usage.
 *
 * Policy: fire at most once per 90 days, and only after ALL of:
 *   - running inside the Despia native shell
 *   - ≥ 5 app sessions (tracked per day, so one session per day max)
 *   - ≥ 3 days since first tracked session
 *   - ≥ 3 runs recorded locally (positive-engagement signal)
 */

const KEY = {
  sessions: "review_sessions", // JSON array of YYYY-MM-DD session dates
  firstSeen: "review_first_seen", // ISO date string
  runs: "review_runs_seen", // number — highest activity count observed
  lastPrompt: "review_last_prompt", // ISO date string of last rateapp:// call
};

const MIN_SESSIONS = 5;
const MIN_DAYS_SINCE_INSTALL = 3;
const MIN_RUNS = 3;
const REPROMPT_COOLDOWN_DAYS = 90;

function isDespia(): boolean {
  if (typeof navigator === "undefined") return false;
  return /despia|median/i.test(navigator.userAgent || "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Record a session (call once per app load). Returns nothing. */
export function trackReviewSession(): void {
  try {
    const raw = localStorage.getItem(KEY.sessions);
    const sessions: string[] = raw ? JSON.parse(raw) : [];
    const t = today();
    if (!sessions.includes(t)) {
      sessions.push(t);
      localStorage.setItem(KEY.sessions, JSON.stringify(sessions));
    }
    if (!localStorage.getItem(KEY.firstSeen)) {
      localStorage.setItem(KEY.firstSeen, t);
    }
  } catch {
    /* ignore */
  }
}

/** Update the observed run count (call when activities load). */
export function trackReviewRunCount(count: number): void {
  try {
    const prev = Number(localStorage.getItem(KEY.runs) || 0);
    if (count > prev) localStorage.setItem(KEY.runs, String(count));
  } catch {
    /* ignore */
  }
}

export function hasPromptedRecently(): boolean {
  try {
    const last = localStorage.getItem(KEY.lastPrompt);
    if (!last) return false;
    return daysBetween(last, today()) < REPROMPT_COOLDOWN_DAYS;
  } catch {
    return false;
  }
}

/**
 * Fire the native rating prompt if engagement thresholds are met.
 * Safe to call on every app load — it self-limits.
 */
export function maybeRequestReview(): void {
  if (!isDespia()) return;
  try {
    if (hasPromptedRecently()) return;

    const sessions: string[] = JSON.parse(localStorage.getItem(KEY.sessions) || "[]");
    if (sessions.length < MIN_SESSIONS) return;

    const firstSeen = localStorage.getItem(KEY.firstSeen);
    if (!firstSeen || daysBetween(firstSeen, today()) < MIN_DAYS_SINCE_INSTALL) return;

    const runs = Number(localStorage.getItem(KEY.runs) || 0);
    if (runs < MIN_RUNS) return;

    // All conditions met — spend the request and record it.
    localStorage.setItem(KEY.lastPrompt, today());
    import("despia-native")
      .then(({ default: despia }) => despia("rateapp://"))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Open the store's write-review composer (explicit user action only). */
export function openReviewComposer(): void {
  if (isDespia()) {
    import("despia-native")
      .then(({ default: despia }) => despia("rateapp://review"))
      .catch(() => {});
  } else {
    window.open(
      "https://apps.apple.com/us/app/runward/id6761060757?action=write-review",
      "_blank",
      "noopener,noreferrer",
    );
  }
}
