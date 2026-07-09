import { useState, useEffect, lazy, Suspense } from "react";
import { Activity, Dumbbell, Loader2, BarChart3, Award, Trophy, WifiOff } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmLeave } from "@/lib/unsavedGuard";
import { TabPageSkeleton, SettingsSkeleton, CommunitySkeleton, PostureSkeleton, TrainingSkeleton } from "@/components/ui/PageSkeleton";
import PullToRefreshContainer from "@/components/ui/PullToRefreshContainer";
import { useSimpleMode } from "@/hooks/use-simple-mode";

// Eagerly load the most common tab
import ActivitiesTab from "@/components/ActivitiesTab";
import Onboarding from "@/components/Onboarding";
import AppHeader, { preloadHeaderProfile } from "@/components/AppHeader";
import PromoBanner from "@/components/PromoBanner";
import WhatsNewWalkthrough from "@/components/WhatsNewWalkthrough";

// Lazy load less-visited tabs

const TrainingTab = lazy(() => import("@/components/TrainingTab"));
const MoreTab = lazy(() => import("@/components/MoreTab"));
const AnalyticsTab = lazy(() => import("@/components/AnalyticsTab"));
const ConnectApps = lazy(() => import("@/components/ConnectApps"));
const MessagingSettingsPage = lazy(() => import("@/components/MessagingSettingsPage"));
const ShoesPage = lazy(() => import("@/components/ShoesPage"));

const RewardsTab = lazy(() => import("@/components/RewardsTab"));
const RaceTab = lazy(() => import("@/components/RaceTab"));
const FloatingChatButton = lazy(() => import("@/components/coach/FloatingChatButton"));

type Tab = "training" | "analytics" | "activities" | "more" | "community" | "races";
const ONBOARDING_DELAY_MS = 500;
const ONBOARDING_SIGNUP_IN_PROGRESS_KEY = "onboarding_signup_in_progress";

const Index = () => {
  const { user, loading, isWarmResume } = useAuth();
  const [simpleMode] = useSimpleMode();
  const { online } = useOnlineStatus();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (searchParams.get("page") === "connect-apps") return "more";
    const tabParam = searchParams.get("tab");
    // Back-compat: redirect old `posture` deeplinks into `analytics`
    if (tabParam === "posture") return "analytics";
    return (tabParam === "training" || tabParam === "analytics" || tabParam === "activities" || tabParam === "more" || tabParam === "community" || tabParam === "races") ? tabParam : "activities";
  });
  const [showConnectApps, setShowConnectApps] = useState(() => searchParams.get("page") === "connect-apps");
  const [showMessaging, setShowMessaging] = useState(() => {
    const p = searchParams.get("page");
    return p === "messaging" || p === "telegram" || p === "whatsapp";
  });
  const [promoTrigger, setPromoTrigger] = useState(0);
  const [runningScore, setRunningScore] = useState<number | null>(null);
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "en");
  const [langSwitching, setLangSwitching] = useState(false);
  const setLang = (l: Lang) => {
    setLangSwitching(true);
    setTimeout(() => {
      localStorage.setItem("app_lang", l);
      setLangState(l);
      setLangSwitching(false);
    }, 4000);
    // Persist to profile so server-side notifications (e.g. OneSignal) can localize
    if (user?.id) {
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase.from("profiles").update({ lang: l }).eq("user_id", user.id).then(({ error }) => {
          if (error) console.warn("[setLang] failed to persist lang", error);
        });
      });
    }
  };
  // Hydrate lang from profile on login (profile is source of truth across devices)
  useEffect(() => {
    if (!user?.id) return;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.from("profiles").select("lang").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        const remote = (data as any)?.lang as Lang | undefined;
        if (remote && (remote === "en" || remote === "zh") && remote !== lang) {
          localStorage.setItem("app_lang", remote);
          setLangState(remote);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem("guest_mode") === "true");
  const [showOnboarding, setShowOnboarding] = useState(
    () => sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true"
  );
  const [aiChatDisabled, setAiChatDisabled] = useState(() => localStorage.getItem("ai_chat_disabled") === "true");
  useEffect(() => {
    const sync = () => setAiChatDisabled(localStorage.getItem("ai_chat_disabled") === "true");
    window.addEventListener("ai-chat-toggle", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ai-chat-toggle", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (searchParams.get("page") === "connect-apps") {
      setActiveTab("more");
    } else if (tabParam === "training" || tabParam === "analytics" || tabParam === "activities" || tabParam === "more" || tabParam === "community" || tabParam === "races") {
      setActiveTab(tabParam);
    } else if (tabParam === "posture") {
      setActiveTab("analytics");
    }
    setShowConnectApps(searchParams.get("page") === "connect-apps");
    {
      const p = searchParams.get("page");
      setShowMessaging(p === "messaging" || p === "telegram" || p === "whatsapp");
    }
  }, [searchParams]);

  // Preload header profile as soon as user is known
  useEffect(() => {
    if (user) preloadHeaderProfile(user.id);
  }, [user?.id]);

  // Cold-start optimization: ActivitiesTab loads only the latest 60 activities.
  // After first paint, prefetch the full activity history + warm up lazy tab
  // chunks in the background so subsequent navigation is instant.
  useEffect(() => {
    if (!user?.id) return;
    const idle = (cb: () => void) => {
      const w = window as any;
      if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 5000 });
      else setTimeout(cb, 2000);
    };
    idle(() => {
      // Warm lazy tab bundles so first navigation doesn't pay the network cost.
      import("@/components/AnalyticsTab");
      import("@/components/TrainingTab");
      import("@/components/RewardsTab");
      import("@/components/RaceTab");
      import("@/components/MoreTab");
      // Prefetch full activity history into react-query so analytics/training
      // tabs render instantly when first visited.
      import("@/hooks/use-activities").then(() => {
        import("@tanstack/react-query").then(({ QueryClient: _ }) => { /* shared singleton */ });
      });
    });
  }, [user?.id]);

  // Resolve onboarding state without blocking first paint.
  // Optimistically assume returning users are onboarded — cache the flag in
  // localStorage so subsequent cold starts skip the network round-trip and
  // render the app immediately. Only force the Onboarding screen if the
  // remote profile explicitly says onboarding_completed === false.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (loading) return;

    const suppressAppLoading = sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true";
    if (suppressAppLoading) {
      setShowOnboarding(true);
      return;
    }

    if (!userId) {
      // No user and not a guest → show onboarding (login flow)
      if (!isGuest) setShowOnboarding(true);
      return;
    }

    // Trust the cached flag on cold start, then verify in the background.
    const cacheKey = `onboarding_completed:${userId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached === "true") {
      setShowOnboarding(false);
    }

    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", userId)
        .single();
      if (cancelled) return;
      const completed = !!data?.onboarding_completed;
      if (completed) {
        localStorage.setItem(cacheKey, "true");
        setShowOnboarding(false);
      } else if (cached !== "true") {
        // Only flip into onboarding if we never confirmed completion before.
        setShowOnboarding(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loading, isGuest]);

  // Cold start: brief splash only while auth itself is resolving.
  const suppressAppLoading = sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true";
  if (loading && !suppressAppLoading) {
    if (isWarmResume) {
      return <TabPageSkeleton />;
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => setShowOnboarding(false)}
        onGuest={() => {
          localStorage.setItem("guest_mode", "true");
          setIsGuest(true);
          setShowOnboarding(false);
        }}
        lang={lang}
        setLang={setLang}
      />
    );
  }

  const handleNavigateSettings = () => {
    setActiveTab("more");
    setShowConnectApps(false);
  };

  // 5 visible tabs (no "more" in nav bar — accessible via settings icon)
  const allTabs: { id: Tab; icon: typeof Activity; labelKey: string }[] = [
    { id: "activities", icon: Activity, labelKey: "activities" },
    { id: "training", icon: Dumbbell, labelKey: "training" },
    { id: "races", icon: Trophy, labelKey: "races" },
    { id: "community", icon: Award, labelKey: "community" },
    { id: "analytics", icon: BarChart3, labelKey: "analytics" },
  ];
  const tabs = simpleMode ? allTabs.filter(t => t.id !== "analytics") : allTabs;

  // If user is on analytics tab when simple mode flips on, bounce to activities
  if (simpleMode && activeTab === "analytics") {
    setTimeout(() => setActiveTab("activities"), 0);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div style={{ height: 'var(--safe-area-top, 0px)' }} className="shrink-0" />
      {/* Shared header across all tabs */}
      {activeTab !== "more" && (
        <AppHeader
          lang={lang}
          onNavigateSettings={handleNavigateSettings}
          onOpenPromoBanner={() => setPromoTrigger((n) => n + 1)}
          isGuest={isGuest}
        />
      )}
      {!online && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 border-y border-border py-1.5 px-3">
          <WifiOff size={12} />
          <span>{lang === "zh" ? "離線中 — 顯示已儲存的資料" : "You're offline — showing saved data"}</span>
        </div>
      )}
      <div
        className="flex-1 overflow-y-auto relative"
        style={{ paddingBottom: 'calc(5rem + var(--safe-area-bottom, 0px))', display: activeTab === "activities" ? "none" : "block" }}
      >
        {langSwitching && (
          <div className="absolute inset-0 bg-background/80 z-50 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} />{lang === "zh" ? "Switching language..." : "切換語言中..."}</div>
          </div>
        )}
        {activeTab === "training" && (
          <Suspense fallback={<TrainingSkeleton />}>
            <TrainingTab score={runningScore} setScore={setRunningScore} lang={lang} onLoginRequest={() => {
              localStorage.removeItem("guest_mode");
              setIsGuest(false);
              setShowOnboarding(true);
            }} />
          </Suspense>
        )}
        <div style={{ display: activeTab === "analytics" ? "block" : "none" }}>
          <Suspense fallback={<PostureSkeleton />}>
            <AnalyticsTab lang={lang} />
          </Suspense>
        </div>
        {activeTab === "more" && !showConnectApps && !showMessaging && (
          <Suspense fallback={<SettingsSkeleton />}>
            <MoreTab
              lang={lang}
              setLang={setLang}
              onLoginRequest={() => {
                localStorage.removeItem("guest_mode");
                setIsGuest(false);
                setShowOnboarding(true);
              }}
              onNavigateConnectApps={() => setShowConnectApps(true)}
              onNavigateMessaging={() => setShowMessaging(true)}
            />
          </Suspense>
        )}
        {activeTab === "more" && showConnectApps && (
          <Suspense fallback={<TabPageSkeleton />}>
            <ConnectApps lang={lang} onBack={() => setShowConnectApps(false)} />
          </Suspense>
        )}
        {activeTab === "more" && showMessaging && (
          <Suspense fallback={<TabPageSkeleton />}>
            <MessagingSettingsPage lang={lang} onBack={() => setShowMessaging(false)} />
          </Suspense>
        )}
        {activeTab === "races" && (
          <Suspense fallback={<TabPageSkeleton />}>
            <RaceTab lang={lang} />
          </Suspense>
        )}
        {activeTab === "community" && (
          <Suspense fallback={<CommunitySkeleton />}>
            <RewardsTab lang={lang} />
          </Suspense>
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto relative"
        style={{
          paddingBottom: 'calc(5rem + var(--safe-area-bottom, 0px))',
          display: activeTab === "activities" ? "block" : "none",
        }}
      >
        <ActivitiesTab lang={lang} />
      </div>

      <div className="bottom-nav fixed bottom-0 left-0 right-0 bg-card border-t border-border" style={{ paddingBottom: 'var(--safe-area-bottom, 0px)' }}>
        <div className="relative flex justify-around items-center h-16 max-w-lg mx-auto">
          {/* Sliding active indicator */}
          <div
            className="absolute top-2 h-12 rounded-xl bg-muted/70 transition-all duration-300 ease-out pointer-events-none"
            style={{
              width: `calc((100% / ${tabs.length}) - 0.5rem)`,
              left: `calc(((100% / ${tabs.length}) * ${tabs.findIndex(t => t.id === activeTab)}) + 0.25rem)`,
            }}
          />
          {tabs.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => {
                if (id !== activeTab && !confirmLeave(lang === "zh" ? "您的訓練計劃有未儲存的變更。確定要離開嗎？" : "You have unsaved changes to your training plan. Leave without saving?")) return;
                setActiveTab(id);
                setShowConnectApps(false);
                setShowMessaging(false);
              }}
              className={`relative z-10 flex flex-1 flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                activeTab === id ? "text-tab-active" : "text-tab-inactive"
              }`}
            >
              <Icon
                size={20}
                strokeWidth={activeTab === id ? 2.5 : 1.5}
                className={`transition-transform duration-300 ${activeTab === id ? "scale-110" : "scale-100"}`}
              />
              <span className="text-[10px] font-medium">{t(labelKey as any, lang)}</span>
            </button>
          ))}
        </div>
      </div>

      <PromoBanner lang={lang} userId={user?.id ?? null} triggerKey={promoTrigger} />

      <WhatsNewWalkthrough
        lang={lang}
        enabled={!!user && !isGuest && !showOnboarding && activeTab === "activities"}
      />

      {!isGuest && user && !aiChatDisabled && (
        <Suspense fallback={null}>
          <FloatingChatButton lang={lang} />
        </Suspense>
      )}
    </div>
  );
};

export default Index;
