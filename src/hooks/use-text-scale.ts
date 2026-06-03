import { useEffect, useState, useCallback } from "react";

export type TextScale = "default" | "lg" | "xl";

const KEY = "text_scale";
const EVT = "text-scale-change";

const SIZE_MAP: Record<TextScale, string> = {
  default: "16px",
  lg: "18px",
  xl: "20px",
};

function read(): TextScale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "lg" || v === "xl" || v === "default") return v;
  } catch {}
  return "default";
}

export function applyTextScale(scale: TextScale) {
  // Scale the whole document via the html root font-size (rem-based).
  // The header is locked back to its default size via CSS (see index.css),
  // so only content + footer + dropdowns scale.
  const el = document.documentElement;
  el.style.fontSize = SIZE_MAP[scale];
  el.dataset.textScale = scale;
}

export function useTextScale(): [TextScale, (v: TextScale) => void] {
  const [scale, setScaleState] = useState<TextScale>(() => read());

  useEffect(() => {
    applyTextScale(scale);
  }, [scale]);

  useEffect(() => {
    const sync = () => setScaleState(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((v: TextScale) => {
    try { localStorage.setItem(KEY, v); } catch {}
    applyTextScale(v);
    window.dispatchEvent(new Event(EVT));
    setScaleState(v);
  }, []);

  return [scale, set];
}
