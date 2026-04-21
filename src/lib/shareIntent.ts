/**
 * Despia share-extension bridge.
 *
 * When the user shares a URL / text from another app (e.g. Garmin Connect)
 * into our app, Despia calls `window.onSharedDataReceived(value, type)`.
 * We normalize that into a DOM CustomEvent that feature components can
 * listen to without coupling to the native bridge.
 */

export type SharedDataType = "image" | "url" | "text";

export interface SharedPayload {
  value: string;
  type: SharedDataType;
}

export const SHARED_DATA_EVENT = "runward:shared-data";
const BUFFER_KEY = "runward_pending_shared_data";

declare global {
  interface Window {
    onSharedDataReceived?: (value: string, type: SharedDataType) => void;
  }
}

const dispatchShared = (payload: SharedPayload) => {
  try {
    window.dispatchEvent(new CustomEvent<SharedPayload>(SHARED_DATA_EVENT, { detail: payload }));
  } catch {
    /* ignore */
  }
};

/**
 * Register the global Despia callback. Safe to call multiple times.
 * If no listener is mounted yet, buffers the last payload in sessionStorage
 * so the target component can pick it up on mount.
 */
export function registerShareIntent() {
  if (typeof window === "undefined") return;
  if ((window as any).__runwardShareIntentRegistered) return;
  (window as any).__runwardShareIntentRegistered = true;

  window.onSharedDataReceived = (value: string, type: SharedDataType) => {
    if (!value) return;
    const payload: SharedPayload = { value, type };
    try {
      sessionStorage.setItem(BUFFER_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    dispatchShared(payload);
  };
}

/** Consume any payload delivered before a listener was mounted. */
export function consumePendingShared(): SharedPayload | null {
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(BUFFER_KEY);
    return JSON.parse(raw) as SharedPayload;
  } catch {
    return null;
  }
}
