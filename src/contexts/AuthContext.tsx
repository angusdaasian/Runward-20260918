import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { preloadHeaderProfile } from "@/components/AppHeader";
import despia from "despia-native";
import { syncPlatformToProfile } from "@/lib/detectPlatform";

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

function hasOAuthReturnParams() {
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return (
    search.includes("code=") ||
    search.includes("error=") ||
    hash.includes("access_token=") ||
    hash.includes("refresh_token=")
  );
}

function clearOAuthReturnUrl() {
  window.history.replaceState(window.history.state, document.title, window.location.pathname || "/");
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWarmResume] = useState(() => detectWarmResume());

  useEffect(() => {
    // Mark active on visibility changes.
    // IMPORTANT: do NOT setSession / setLoading on resume — onAuthStateChange
    // already fires when the token changes. Re-setting state here causes the
    // entire app to re-render and feel like a "refresh" every time the user
    // returns from the home screen.
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        markActive();
      }
      // On "visible" we intentionally do nothing. Supabase's auth listener
      // will emit TOKEN_REFRESHED if needed, which updates session naturally.
    };
    document.addEventListener("visibilitychange", onVisChange);

    // Mark active periodically while app is open
    markActive();
    const interval = setInterval(markActive, 30_000);

    // Set up listener BEFORE getSession to avoid missing events.
    // CRITICAL: Only update session state when the user/token actually changes.
    // Supabase emits TOKEN_REFRESHED / SIGNED_IN on resume with a new session
    // object that has the same user. If we naively call setSession every time,
    // the new object reference cascades through every consumer (Index.tsx's
    // user-dependent effects re-run, profile re-check fires, skeleton shows)
    // — which the user perceives as a "refresh / flicker" on app resume.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession((prev) => {
          const sameUser = prev?.user?.id === newSession?.user?.id;
          const sameToken = prev?.access_token === newSession?.access_token;
          if (sameUser && sameToken) {
            // No meaningful change — keep prev reference to avoid re-renders
            return prev;
          }
          return newSession;
        });
        setLoading(false);
        if (newSession?.user) {
          preloadHeaderProfile(newSession.user.id);
          // Register OneSignal player ID with the user's Supabase UID
          try {
            despia(`setonesignalplayerid://?user_id=${newSession.user.id}`);
          } catch (e) {
            console.warn("[Push] Failed to set OneSignal player ID:", e);
          }
          // Stamp last_login ONLY on real sign-in (not TOKEN_REFRESHED / USER_UPDATED),
          // so the 30-day inactivity job can trust this column.
          if (event === "SIGNED_IN") {
            const uid = newSession.user.id;
            setTimeout(() => {
              supabase
                .from("profiles")
                .update({ last_login: new Date().toISOString() })
                .eq("user_id", uid)
                .then(({ error }) => {
                  if (error) console.warn("[Auth] last_login update failed:", error.message);
                });
            }, 0);
          }
        }
      }
    );

    const finishOAuthReturn = async () => {
      if (!hasOAuthReturnParams()) return null;

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const error = params.get("error") || params.get("error_description");
      if (error) {
        console.warn("[Auth] OAuth returned an error:", error);
        clearOAuthReturnUrl();
        return null;
      }

      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.warn("[Auth] OAuth code exchange failed:", exchangeError.message);
          return null;
        }
        clearOAuthReturnUrl();
        return data.session;
      }

      const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          console.warn("[Auth] OAuth token session restore failed:", sessionError.message);
          return null;
        }
        clearOAuthReturnUrl();
        return data.session;
      }

      const { data } = await supabase.auth.getSession();
      clearOAuthReturnUrl();
      return data.session;
    };

    finishOAuthReturn().then((oauthSession) => {
      return supabase.auth.getSession().then(({ data: { session: storedSession } }) => {
        const initialSession = oauthSession ?? storedSession;
      setSession((prev) => {
        const sameUser = prev?.user?.id === initialSession?.user?.id;
        const sameToken = prev?.access_token === initialSession?.access_token;
        if (sameUser && sameToken) return prev;
        return initialSession;
      });
      if (initialSession?.user) {
        preloadHeaderProfile(initialSession.user.id);
        try {
          despia(`setonesignalplayerid://?user_id=${initialSession.user.id}`);
        } catch (e) {
          console.warn("[Push] Failed to set OneSignal player ID:", e);
        }
      }
      // Resolve immediately — getSession() has already restored from storage.
      setLoading(false);
      });
    }).catch((error) => {
      console.warn("[Auth] Failed to restore OAuth session:", error);
      setLoading(false);
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
