import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Activity,
  Dumbbell,
  Trophy,
  Award,
  BarChart3,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Globe,
  LogOut,
  Home,
  LayoutDashboard,
  Calculator,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Lang, t } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import appIcon from "@/assets/app-icon.png";

const FloatingChatButton = lazy(() => import("@/components/coach/FloatingChatButton"));
const DashboardOverview = lazy(() => import("@/components/dashboard/DashboardOverview"));

const DashboardTraining = lazy(() => import("@/components/dashboard/DashboardTraining"));
const DashboardRaces = lazy(() => import("@/components/dashboard/DashboardRaces"));
const DashboardCommunity = lazy(() => import("@/components/dashboard/DashboardCommunity"));
const DashboardAnalytics = lazy(() => import("@/components/dashboard/DashboardAnalytics"));
const DashboardCalculators = lazy(() => import("@/components/dashboard/DashboardCalculators"));
const DashboardConnect = lazy(() => import("@/components/dashboard/DashboardConnect"));
const DashboardSettings = lazy(() => import("@/components/dashboard/DashboardSettings"));
const DashboardAuth = lazy(() => import("@/components/dashboard/DashboardAuth"));

type View =
  | "overview"
  
  | "training"
  | "races"
  | "community"
  | "analytics"
  | "calculators"
  | "connect"
  | "settings";

const VIEWS: { id: View; icon: typeof Activity; labelEn: string; labelZh: string }[] = [
  { id: "overview", icon: Activity, labelEn: "Activity", labelZh: "活動" },
  { id: "training", icon: Dumbbell, labelEn: "Training", labelZh: "訓練" },
  { id: "races", icon: Trophy, labelEn: "Races", labelZh: "比賽" },
  { id: "community", icon: Award, labelEn: "Community", labelZh: "社群" },
  { id: "analytics", icon: BarChart3, labelEn: "Analytics", labelZh: "分析" },
  { id: "calculators", icon: Calculator, labelEn: "Calculators", labelZh: "計算器" },
];

const TOOLS: { id: View; icon: typeof Activity; labelEn: string; labelZh: string }[] = [
  { id: "connect", icon: Plug, labelEn: "Connect Apps", labelZh: "連接應用" },
  { id: "settings", icon: SettingsIcon, labelEn: "Settings", labelZh: "設定" },
];

const Dashboard = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runningScore, setRunningScore] = useState<number | null>(null);

  const initialView = (searchParams.get("view") as View) || "overview";
  const [view, setViewState] = useState<View>(initialView);
  const [showAuth, setShowAuth] = useState<boolean>(() => searchParams.get("auth") === "1");
  const openAuth = () => setShowAuth(true);

  const gateLang: Lang = (localStorage.getItem("app_lang") as Lang) || "en";
  const gateZh = gateLang === "zh";

  // Dashboard access: admins + explicit email/user-id allowlist (beta).
  const DASHBOARD_ALLOWED_EMAILS = ["angchenghk@gmail.com"];
  const DASHBOARD_ALLOWED_USER_IDS = ["c7a7d1ca-c7bf-4288-bb9d-794006a04087"];
  const emailAllowed = !!user?.email && DASHBOARD_ALLOWED_EMAILS.includes(user.email.toLowerCase());
  const idAllowed = !!user?.id && DASHBOARD_ALLOWED_USER_IDS.includes(user.id);
  const canAccessDashboard = isAdmin || emailAllowed || idAllowed;

  // Redirect signed-in users who aren't allowlisted back to home,
  // so the sign-in flow completes without being trapped on a gate screen.
  useEffect(() => {
    if (!authLoading && !adminLoading && user && !canAccessDashboard) {
      navigate("/", { replace: true });
    }
  }, [authLoading, adminLoading, user, canAccessDashboard, navigate]);

  const setView = (v: View) => {
    setViewState(v);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("view", v);
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    const v = searchParams.get("view") as View | null;
    if (v && v !== view) setViewState(v);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("app_lang") as Lang) || "en"
  );
  const setLang = (l: Lang) => {
    localStorage.setItem("app_lang", l);
    setLangState(l);
    if (user?.id) {
      supabase.from("profiles").update({ lang: l }).eq("user_id", user.id);
    }
  };
  const toggleLang = () => setLang(lang === "en" ? "zh" : "en");
  const zh = lang === "zh";

  const isGuest = !user;

  // Auto-close auth overlay once user is authenticated
  useEffect(() => {
    if (user && showAuth) {
      setShowAuth(false);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("auth");
          return next;
        },
        { replace: true }
      );
    }
  }, [user, showAuth, setSearchParams]);

  const currentLabel =
    [...VIEWS, ...TOOLS].find((v) => v.id === view)?.[zh ? "labelZh" : "labelEn"] ?? "";

  if (authLoading || (user && adminLoading) || (user && !canAccessDashboard)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Signed-out visitors never see the dashboard shell — sign-in first, then the
  // admin/allowlist check above decides whether they stay.
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src={appIcon} alt="Runward" className="h-12 w-12 rounded-xl ring-1 ring-border" />
        <div>
          <h1 className="font-display text-xl font-bold">
            {gateZh ? "此儀表板僅供管理員使用" : "Dashboard is admin-only"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gateZh
              ? "請使用管理員帳戶登入以繼續。"
              : "Sign in with an administrator account to continue."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openAuth}>{gateZh ? "登入" : "Sign in"}</Button>
          <Button variant="outline" onClick={() => navigate("/")}>
            {gateZh ? "返回首頁" : "Back to home"}
          </Button>
        </div>
        {showAuth && (
          <Suspense fallback={<TabPageSkeleton />}>
            <DashboardAuth
              lang={gateLang}
              onSuccess={() => setShowAuth(false)}
              onGuest={() => setShowAuth(false)}
              onClose={() => setShowAuth(false)}
            />
          </Suspense>
        )}
      </div>
    );
  }


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-2.5 px-2 py-2 group">
              <img
                src={appIcon}
                alt="Runward"
                className="h-8 w-8 rounded-lg ring-1 ring-border shrink-0"
              />
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="font-display font-bold text-sm leading-tight">
                  {zh ? "向前跑" : "Runward"}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Dashboard
                </span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{zh ? "主要" : "Main"}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {VIEWS.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={view === item.id}
                        onClick={() => setView(item.id)}
                        tooltip={zh ? item.labelZh : item.labelEn}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{zh ? item.labelZh : item.labelEn}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>{zh ? "工具" : "Tools"}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {TOOLS.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={view === item.id}
                        onClick={() => setView(item.id)}
                        tooltip={zh ? item.labelZh : item.labelEn}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{zh ? item.labelZh : item.labelEn}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {isAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => navigate("/admin")}
                        tooltip="Admin"
                      >
                        <Shield className="h-4 w-4" />
                        <span>Admin</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={toggleLang} tooltip={zh ? "語言" : "Language"}>
                  <Globe className="h-4 w-4" />
                  <span>{zh ? "English" : "中文"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {!isGuest && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => {
                      signOut();
                      navigate("/");
                    }}
                    tooltip={zh ? "登出" : "Sign out"}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{zh ? "登出" : "Sign out"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate("/")} tooltip={zh ? "首頁" : "Home"}>
                  <Home className="h-4 w-4" />
                  <span>{zh ? "首頁" : "Home"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex-1 flex flex-col min-w-0">
          <header className="h-14 shrink-0 flex items-center gap-3 border-b border-border bg-card/40 backdrop-blur px-4 sticky top-0 z-30">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border" />
            <h1 className="font-display font-semibold text-base">{currentLabel}</h1>
            <div className="ml-auto flex items-center gap-2">
              {isGuest && (
                <Button size="sm" variant="default" onClick={openAuth}>
                  {zh ? "登入 / 註冊" : "Sign in / Register"}
                </Button>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-[1600px] mx-auto px-6 py-6">
              <Suspense fallback={<TabPageSkeleton />}>
                {view === "overview" && (
                  <DashboardOverview lang={lang} onNavigate={(v) => setView(v)} />
                )}
                
                {view === "training" && (
                  <DashboardTraining
                    lang={lang}
                    score={runningScore}
                    setScore={setRunningScore}
                    onLoginRequest={openAuth}
                  />
                )}
                {view === "races" && <DashboardRaces lang={lang} />}
                {view === "community" && <DashboardCommunity lang={lang} />}
                {view === "analytics" && <DashboardAnalytics lang={lang} />}
                {view === "calculators" && <DashboardCalculators lang={lang} />}
                {view === "connect" && (
                  <DashboardConnect lang={lang} onBack={() => setView("overview")} />
                )}
                {view === "settings" && (
                  <DashboardSettings
                    lang={lang}
                    setLang={setLang}
                    onLoginRequest={openAuth}
                    onNavigateConnectApps={() => setView("connect")}
                  />
                )}
              </Suspense>
            </div>
          </main>
        </SidebarInset>

        {!isGuest && (
          <Suspense fallback={null}>
            <FloatingChatButton lang={lang} />
          </Suspense>
        )}

        {/* Desktop-only auth overlay — independent from mobile Onboarding flow */}
        {showAuth && (
          <Suspense fallback={<TabPageSkeleton />}>
            <DashboardAuth
              lang={lang}
              onSuccess={() => setShowAuth(false)}
              onGuest={() => {
                localStorage.setItem("guest_mode", "true");
                setShowAuth(false);
              }}
              onClose={() => {
                setShowAuth(false);
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("auth");
                    return next;
                  },
                  { replace: true }
                );
              }}
            />
          </Suspense>
        )}
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
