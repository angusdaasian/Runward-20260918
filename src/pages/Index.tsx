import { useState, useEffect, lazy, Suspense } from "react";
import { Activity, Dumbbell, Loader2, ScanEye, Shield, Award, Trophy, WifiOff } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TabPageSkeleton, SettingsSkeleton, CommunitySkeleton, PostureSkeleton, TrainingSkeleton } from "@/components/ui/PageSkeleton";

// Eagerly load the most common tab
import ActivitiesTab from "@/components/ActivitiesTab";
import Onboarding from "@/components/Onboarding";
import AppHeader, { preloadHeaderProfile } from "@/components/AppHeader";
import PromoBanner from "@/components/PromoBanner";

// Lazy load less-visited tabs

const TrainingTab = lazy(() => import("@/components/TrainingTab"));
const MoreTab = lazy(() => import("@/components/MoreTab"));
const PostureTab = lazy(() => import("@/components/PostureTab"));
const ConnectApps = lazy(() => import("@/components/ConnectApps"));
const RewardsTab = lazy(() => import("@/components/RewardsTab"));
const RaceTab = lazy(() => import("@/components/RaceTab"));

type Tab = "training" | "posture" | "activities" | "more" | "community" | "races";
const ONBOARDING_DELAY_MS = 500;
const ONBOARDING_SIGNUP_IN_PROGRESS_KEY = "onboarding_signup_in_progress";

const Index = () => {
  const { user, loading, isWarmResume } = useAuth();
  const { isAdmin } = useAdmin();
  const { online } = useOnlineStatus();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tabParam = searchParams.get("tab");
    return (tabParam === "training" || tabParam === "posture" || tabParam === "activities" || tabParam === "more" || tabParam === "community" || tabParam === "races") ? tabParam : "activities";
  });
  const [showConnectApps, setShowConnectApps] = useState(() => searchParams.get("page") === "connect-apps");
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

  // Preload header profile as soon as user is known
  useEffect(() => {
    if (user) preloadHeaderProfile(user.id);
  }, [user]);

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
      if (!user && !isGuest) {
        setCheckingProfile(true);
        setShowOnboarding(false);
        onboardingTimeout = window.setTimeout(() => {
          if (!isActive) return;
          setShowOnboarding(true);
          setCheckingProfile(false);
        }, ONBOARDING_DELAY_MS);
        return;
      }

      if (user) {
        setShowOnboarding(false);
        setCheckingProfile(true);

        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("user_id", user.id)
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
  }, [user, loading, isGuest]);

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
    { id: "posture", icon: ScanEye, labelKey: "posture" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div style={{ height: 'var(--safe-area-top, 0px)' }} className="shrink-0" />
      {isAdmin && (
        <div className="flex justify-end p-2">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Shield size={14} />
            Admin
          </button>
        </div>
      )}
      {/* Shared header across all tabs */}
      {activeTab !== "more" || !showConnectApps ? (
        <AppHeader lang={lang} onNavigateSettings={handleNavigateSettings} isGuest={isGuest} />
      ) : null}
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
        <div style={{ display: activeTab === "posture" ? "block" : "none" }}>
          <Suspense fallback={<PostureSkeleton />}>
            <PostureTab lang={lang} />
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
              onClick={() => { setActiveTab(id); setShowConnectApps(false); }}
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

      <PromoBanner lang={lang} userId={user?.id ?? null} />
    </div>
  );
};

export default Index;
