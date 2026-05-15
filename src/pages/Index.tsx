import { useState, useEffect, lazy, Suspense } from "react";
import { Activity, Dumbbell, Loader2, BarChart3, Award, Trophy, WifiOff } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmLeave } from "@/lib/unsavedGuard";
import { TabPageSkeleton, SettingsSkeleton, CommunitySkeleton, PostureSkeleton, TrainingSkeleton } from "@/components/ui/PageSkeleton";

// Eagerly load the most common tab
import ActivitiesTab from "@/components/ActivitiesTab";
import Onboarding from "@/components/Onboarding";
import AppHeader, { preloadHeaderProfile } from "@/components/AppHeader";
import PromoBanner from "@/components/PromoBanner";

// Lazy load less-visited tabs

const TrainingTab = lazy(() => import("@/components/TrainingTab"));
const MoreTab = lazy(() => import("@/components/MoreTab"));
const AnalyticsTab = lazy(() => import("@/components/AnalyticsTab"));
const ConnectApps = lazy(() => import("@/components/ConnectApps"));
const RewardsTab = lazy(() => import("@/components/RewardsTab"));
const RaceTab = lazy(() => import("@/components/RaceTab"));
const FloatingChatButton = lazy(() => import("@/components/coach/FloatingChatButton"));

type Tab = "training" | "analytics" | "activities" | "more" | "community" | "races";
const ONBOARDING_DELAY_MS = 500;
const ONBOARDING_SIGNUP_IN_PROGRESS_KEY = "onboarding_signup_in_progress";

const Index = () => {
  const { user, loading, isWarmResume } = useAuth();
  const { online } = useOnlineStatus();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tabParam = searchParams.get("tab");
    // Back-compat: redirect old `posture` deeplinks into `analytics`
    if (tabParam === "posture") return "analytics";
    return (tabParam === "training" || tabParam === "analytics" || tabParam === "activities" || tabParam === "more" || tabParam === "community" || tabParam === "races") ? tabParam : "activities";
  });
  const [showConnectApps, setShowConnectApps] = useState(() => searchParams.get("page") === "connect-apps");
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
  };
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem("guest_mode") === "true");
  const [showOnboarding, setShowOnboarding] = useState(
    () => sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true"
  );
  const [checkingProfile, setCheckingProfile] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "training" || tabParam === "analytics" || tabParam === "activities" || tabParam === "more" || tabParam === "community" || tabParam === "races") {
      setActiveTab(tabParam);
    } else if (tabParam === "posture") {
      setActiveTab("analytics");
    }
    setShowConnectApps(searchParams.get("page") === "connect-apps");
  }, [searchParams]);

  // Preload header profile as soon as user is known
  useEffect(() => {
    if (user) preloadHeaderProfile(user.id);
  }, [user?.id]);

  // Key the entry-resolution effect off user.id (stable string) — NOT the
  // user object reference. Supabase emits new session objects on token refresh
  // and on app resume; if we depend on `user` directly the effect re-runs
  // every time, flipping checkingProfile=true and showing the skeleton
  // (which the user perceives as a "refresh" when returning from home screen).
  const userId = user?.id ?? null;
  useEffect(() => {
    if (loading) return;

    const suppressAppLoading = sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true";
    if (suppressAppLoading) {
      setShowOnboarding(true);
      setCheckingProfile(false);
      return;
    }

    let isActive = true;
    let onboardingTimeout: number | null = null;

    const resolveEntryState = async () => {
      if (!userId && !isGuest) {
        setCheckingProfile(true);
        setShowOnboarding(false);
        onboardingTimeout = window.setTimeout(() => {
          if (!isActive) return;
          setShowOnboarding(true);
          setCheckingProfile(false);
        }, ONBOARDING_DELAY_MS);
        return;
      }

      if (userId) {
        setShowOnboarding(false);
        setCheckingProfile(true);

        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("user_id", userId)
            .single();

          if (!isActive) return;

          setShowOnboarding(!data?.onboarding_completed);
        } finally {
          if (isActive) {
            setCheckingProfile(false);
          }
        }

        return;
      }

      setShowOnboarding(false);
      setCheckingProfile(false);
    };

    void resolveEntryState();

    return () => {
      isActive = false;
      if (onboardingTimeout !== null) {
        window.clearTimeout(onboardingTimeout);
      }
    };
  }, [userId, loading, isGuest]);

  // During loading: warm resume shows skeleton of last page, cold start shows splash
  const suppressAppLoading = sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true";
  if ((loading || checkingProfile) && !suppressAppLoading) {
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
  const tabs: { id: Tab; icon: typeof Activity; labelKey: string }[] = [
    { id: "activities", icon: Activity, labelKey: "activities" },
    { id: "training", icon: Dumbbell, labelKey: "training" },
    { id: "races", icon: Trophy, labelKey: "races" },
    { id: "community", icon: Award, labelKey: "community" },
    { id: "analytics", icon: BarChart3, labelKey: "analytics" },
  ];

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
      <div className="flex-1 overflow-y-auto relative" style={{ paddingBottom: 'calc(5rem + var(--safe-area-bottom, 0px))' }}>
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
        {activeTab === "activities" && (
          <ActivitiesTab lang={lang} />
        )}
        {activeTab === "more" && !showConnectApps && (
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
            />
          </Suspense>
        )}
        {activeTab === "more" && showConnectApps && (
          <Suspense fallback={<TabPageSkeleton />}>
            <ConnectApps lang={lang} onBack={() => setShowConnectApps(false)} />
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

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border" style={{ paddingBottom: 'var(--safe-area-bottom, 0px)' }}>
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

      {!isGuest && user && !aiChatDisabled && (
        <Suspense fallback={null}>
          <FloatingChatButton lang={lang} />
        </Suspense>
      )}
    </div>
  );
};

export default Index;
