import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "simple_mode";
const EVT = "simple-mode-toggle";

function read(): boolean {
  try { return localStorage.getItem(KEY) === "true"; } catch { return false; }
}

function write(v: boolean) {
  try { localStorage.setItem(KEY, v ? "true" : "false"); } catch {}
}

// Sync DB -> localStorage once on load so the flag is authoritative across devices
let syncedFromDB = false;
async function syncFromDB() {
  if (syncedFromDB) return;
  syncedFromDB = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("simple_mode")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data && typeof (data as any).simple_mode === "boolean") {
      const dbVal = (data as any).simple_mode as boolean;
      if (dbVal !== read()) {
        write(dbVal);
        window.dispatchEvent(new Event(EVT));
      }
    }
  } catch {}
}

async function persistToDB(v: boolean) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ simple_mode: v } as any)
      .eq("user_id", user.id);
  } catch {}
}

export function useSimpleMode(): [boolean, (v: boolean) => void] {
  const [simple, setSimple] = useState<boolean>(() => read());

  useEffect(() => {
    const sync = () => setSimple(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    syncFromDB();
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    write(v);
    window.dispatchEvent(new Event(EVT));
    setSimple(v);
    void persistToDB(v);
  }, []);

  return [simple, set];
}

export function isSimpleMode(): boolean {
  return read();
}
