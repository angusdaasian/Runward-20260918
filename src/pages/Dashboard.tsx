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

import ActivitiesTab from "@/components/ActivitiesTab";
const TrainingTab = lazy(() => import("@/components/TrainingTab"));
const AnalyticsTab = lazy(() => import("@/components/AnalyticsTab"));
const RaceTab = lazy(() => import("@/components/RaceTab"));
const RewardsTab = lazy(() => import("@/components/RewardsTab"));
const MoreTab = lazy(() => import("@/components/MoreTab"));
const ConnectApps = lazy(() => import("@/components/ConnectApps"));
const FloatingChatButton = lazy(() => import("@/components/coach/FloatingChatButton"));

type View =
  | "activities"
  | "training"
  | "races"
  | "community"
  | "analytics"
  | "connect"
  | "settings";

const VIEWS: { id: View; icon: typeof Activity; labelEn: string; labelZh: string }[] = [
  { id: "activities", icon: Activity, labelEn: "Activities", labelZh: "活動" },
  { id: "training", icon: Dumbbell, labelEn: "Training", labelZh: "訓練" },
  { id: "races", icon: Trophy, labelEn: "Races", labelZh: "比賽" },
  { id: "community", icon: Award, labelEn: "Community", labelZh: "社群" },
  { id: "analytics", icon: BarChart3, labelEn: "Analytics", labelZh: "分析" },
];

const TOOLS: { id: View; icon: typeof Activity; labelEn: string; labelZh: string }[] = [
  { id: "connect", icon: Plug, labelEn: "Connect Apps", labelZh: "連接應用" },
  { id: "settings", icon: SettingsIcon, labelEn: "Settings", labelZh: "設定" },
];

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runningScore, setRunningScore] = useState<number | null>(null);

  const initialView = (searchParams.get("view") as View) || "activities";
  const [view, setViewState] = useState<View>(initialView);

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

  const currentLabel =
    [...VIEWS, ...TOOLS].find((v) => v.id === view)?.[zh ? "labelZh" : "labelEn"] ?? "";

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
                <Button size="sm" variant="default" onClick={() => navigate("/")}>
                  {zh ? "登入" : "Sign in"}
                </Button>
              )}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto py-4">
              {view === "activities" && <ActivitiesTab lang={lang} />}
              {view === "training" && (
                <Suspense fallback={<TabPageSkeleton />}>
                  <TrainingTab
                    score={runningScore}
                    setScore={setRunningScore}
                    lang={lang}
                    onLoginRequest={() => navigate("/")}
                  />
                </Suspense>
              )}
              {view === "races" && (
                <Suspense fallback={<TabPageSkeleton />}>
                  <RaceTab lang={lang} />
                </Suspense>
              )}
              {view === "community" && (
                <Suspense fallback={<TabPageSkeleton />}>
                  <RewardsTab lang={lang} />
                </Suspense>
              )}
              {view === "analytics" && (
                <Suspense fallback={<TabPageSkeleton />}>
                  <AnalyticsTab lang={lang} />
                </Suspense>
              )}
              {view === "connect" && (
                <Suspense fallback={<TabPageSkeleton />}>
                  <ConnectApps lang={lang} onBack={() => setView("activities")} />
                </Suspense>
              )}
              {view === "settings" && (
                <Suspense fallback={<TabPageSkeleton />}>
                  <MoreTab
                    lang={lang}
                    setLang={setLang}
                    onLoginRequest={() => navigate("/")}
                    onNavigateConnectApps={() => setView("connect")}
                  />
                </Suspense>
              )}
            </div>
          </main>
        </SidebarInset>

        {!isGuest && (
          <Suspense fallback={null}>
            <FloatingChatButton lang={lang} />
          </Suspense>
        )}
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
