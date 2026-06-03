import { useEffect, useState, useCallback } from "react";

export type TextScale = "default" | "lg" | "xl";

const KEY = "text_scale";
const EVT = "text-scale-change";

function read(): TextScale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "lg" || v === "xl" || v === "default") return v;
  } catch {}
  return "default";
}

export function applyTextScale(scale: TextScale) {
  // Do NOT change html root font-size — that would scale the header & whole app.
  // Only set the data attribute; CSS rules in index.css target specific
  // surfaces (the dropdown menu popovers) so the header stays the same size.
  document.documentElement.dataset.textScale = scale;
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
