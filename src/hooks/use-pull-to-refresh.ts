import { useEffect, useRef, useState } from "react";

interface Options {
  onRefresh?: () => void | Promise<void>;
  threshold?: number;
  maxPull?: number;
}

/**
 * Pull-to-refresh for a scrollable container.
 * Attach the returned ref to the scroll element. Pulling down past `threshold`
 * while scrolled to top triggers `onRefresh` (defaults to window.location.reload()).
 */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>({
  onRefresh,
  threshold = 70,
  maxPull = 120,
}: Options = {}) {
  const ref = useRef<T | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (el.scrollTop > 0) { startYRef.current = null; return; }
      startYRef.current = e.touches[0].clientY;
      activeRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) { setPull(0); activeRef.current = false; return; }
      if (el.scrollTop > 0) { setPull(0); return; }
      activeRef.current = true;
      // Resistance curve
      const eased = Math.min(maxPull, dy * 0.5);
      setPull(eased);
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!activeRef.current) { setPull(0); startYRef.current = null; return; }
      const shouldRefresh = pull >= threshold;
      startYRef.current = null;
      activeRef.current = false;
      if (shouldRefresh) {
        setRefreshing(true);
        setPull(threshold);
        try {
          if (onRefresh) await onRefresh();
          else window.location.reload();
        } finally {
          setTimeout(() => { setRefreshing(false); setPull(0); }, 400);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull, refreshing, threshold, maxPull, onRefresh]);

  return { ref, pull, refreshing, threshold };
}
