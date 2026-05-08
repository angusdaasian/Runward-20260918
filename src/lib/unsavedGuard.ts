// Simple cross-component "unsaved changes" guard.
// A component can register a checker; navigation actions can call confirmLeave()
// to ask the user to save/discard before leaving.

type Checker = () => boolean;

const checkers = new Set<Checker>();

export function registerUnsavedChecker(check: Checker) {
  checkers.add(check);
  return () => {
    checkers.delete(check);
  };
}

export function hasUnsavedChanges(): boolean {
  for (const c of checkers) {
    try {
      if (c()) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Returns true if it is safe to navigate away (no unsaved changes,
 * or the user confirmed discarding them).
 */
export function confirmLeave(message?: string): boolean {
  if (!hasUnsavedChanges()) return true;
  const msg =
    message ||
    "You have unsaved changes to your training plan. Leave without saving?";
  return window.confirm(msg);
}
