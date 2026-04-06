import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { preloadHeaderProfile } from "@/components/AppHeader";
import despia from "despia-native";

const LAST_ACTIVE_KEY = "runward_last_active";
const WARM_RESUME_MS = 5 * 60 * 1000; // 5 minutes

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isWarmResume: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isWarmResume: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Detect if this is a warm resume (user was active recently) */
function detectWarmResume(): boolean {
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
  return last > 0 && Date.now() - last < WARM_RESUME_MS;
}

/** Update last active timestamp */
function markActive() {
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWarmResume] = useState(() => detectWarmResume());

  useEffect(() => {
    // Mark active on visibility changes
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        markActive();
      } else if (document.visibilityState === "visible") {
        // Re-check session on resume
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setLoading(false);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    // Mark active periodically while app is open
    markActive();
    const interval = setInterval(markActive, 30_000);

    // Set up listener BEFORE getSession to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
        if (session?.user) {
          preloadHeaderProfile(session.user.id);
          // Register OneSignal player ID with the user's Supabase UID
          try {
            despia(`setonesignalplayerid://?user_id=${session.user.id}`);
          } catch (e) {
            console.warn("[Push] Failed to set OneSignal player ID:", e);
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) preloadHeaderProfile(session.user.id);
      // For warm resumes, resolve immediately since user was just here
      // For cold starts, add small delay for auth state to settle
      if (isWarmResume) {
        setLoading(false);
      } else {
        setTimeout(() => setLoading(false), 400);
      }
    });

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisChange);
      clearInterval(interval);
    };
  }, []);

  const signOut = async () => {
    localStorage.removeItem(LAST_ACTIVE_KEY);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, isWarmResume, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
