import { useEffect, useState, useCallback } from "react";

const KEY = "simple_mode";
const EVT = "simple-mode-toggle";

function read(): boolean {
  try { return localStorage.getItem(KEY) === "true"; } catch { return false; }
}

export function useSimpleMode(): [boolean, (v: boolean) => void] {
  const [simple, setSimple] = useState<boolean>(() => read());

  useEffect(() => {
    const sync = () => setSimple(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    try { localStorage.setItem(KEY, v ? "true" : "false"); } catch {}
    window.dispatchEvent(new Event(EVT));
    setSimple(v);
  }, []);

  return [simple, set];
}

export function isSimpleMode(): boolean {
  return read();
}
