// Tiny pub/sub so plan mutations (insert/update/delete on training_plans)
// can instantly invalidate dependent queries (e.g. planned workouts on the
// activities calendar) across the app, without prop-drilling.

const EVENT = "training-plan-changed";

export function notifyPlanChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function subscribePlanChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
