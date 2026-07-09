const SHARE_UNLOCK_CLASS = "runward-share-unlock";
const SHARE_UNLOCK_EVENT = "runward:share-unlock";

let installed = false;
let removeClassTimer: number | null = null;

export function forceUnlockUI() {
  if (typeof document === "undefined") return;

  try {
    document.documentElement.classList.add(SHARE_UNLOCK_CLASS);
    document.body.style.removeProperty("pointer-events");
    document.documentElement.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("overflow");
    document.body.removeAttribute("data-scroll-locked");
    document.documentElement.removeAttribute("data-scroll-locked");

    document.querySelectorAll("[data-aria-hidden='true']").forEach((el) => {
      el.removeAttribute("aria-hidden");
      el.removeAttribute("data-aria-hidden");
    });
    document.getElementById("root")?.removeAttribute("aria-hidden");
  } catch {
    // ignore
  }
}

export function keepUIUnlockedForShare() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  forceUnlockUI();

  if (removeClassTimer != null) window.clearTimeout(removeClassTimer);
  removeClassTimer = window.setTimeout(() => {
    document.documentElement.classList.remove(SHARE_UNLOCK_CLASS);
    removeClassTimer = null;
  }, 60000);

  window.dispatchEvent(new Event(SHARE_UNLOCK_EVENT));
}

export function installGlobalUIUnlockGuard() {
  if (typeof window === "undefined" || typeof document === "undefined" || installed) return;
  installed = true;

  forceUnlockUI();

  const unlock = () => forceUnlockUI();
  const unlockWhenVisible = () => {
    if (document.visibilityState === "visible") unlock();
  };

  window.addEventListener(SHARE_UNLOCK_EVENT, unlock);
  window.addEventListener("focus", unlock);
  window.addEventListener("pageshow", unlock);
  window.addEventListener("pagehide", unlock);
  document.addEventListener("visibilitychange", unlockWhenVisible);
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("touchstart", unlock, true);
}