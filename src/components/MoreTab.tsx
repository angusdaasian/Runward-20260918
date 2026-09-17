import { ChevronRight, ChevronLeft, Crown, Globe, BookOpen, Check, Lock, KeyRound, Clock, Shield, LifeBuoy, ShieldCheck, Smartphone, Moon, Sun, LogOut, Ticket, Bell, Footprints, Flame, Trash2, UserRound, Settings2, MessageSquare, Watch } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lang, t } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import despia from "despia-native";
import { useTextScale, type TextScale } from "@/hooks/use-text-scale";
import { useState, useEffect } from "react";
import { SettingsSkeleton } from "@/components/ui/PageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/contexts/PremiumContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/use-admin";
import { useLocation, useNavigate } from "react-router-dom";
import ProfileSection from "@/components/ProfileSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";
import PlanComparisonDialog from "@/components/PlanComparisonDialog";
import StartRunningGuide from "@/components/StartRunningGuide";
import FuelingGuide from "@/components/FuelingGuide";
import HomeWidgetDialog from "@/components/HomeWidgetDialog";
import CommunityPrivacy from "@/components/community/CommunityPrivacy";

interface Props {
  lang: Lang;
  setLang: (l: Lang) => void;
  onLoginRequest?: () => void;
  onNavigateConnectApps?: () => void;
  onNavigateMessaging?: () => void;
  onNavigateShoes?: () => void;
}


const definitions = [
  { nameKey: "Easy" as const, nameZhKey: "輕鬆跑", defKey: "easyDef" as const },
  { nameKey: "Marathon" as const, nameZhKey: "馬拉松配速", defKey: "marathonDef" as const },
  { nameKey: "Threshold" as const, nameZhKey: "乳酸閾值", defKey: "thresholdDef" as const },
  { nameKey: "Interval" as const, nameZhKey: "間歇訓練", defKey: "intervalDef" as const },
  { nameKey: "Repetition" as const, nameZhKey: "重複訓練", defKey: "repetitionDef" as const },
];



function formatCountdown(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

const MoreTab = ({ lang, setLang, onLoginRequest, onNavigateConnectApps, onNavigateMessaging }: Props) => {
  // Mandatory skeleton on every mount
  const [skeletonDone, setSkeletonDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSkeletonDone(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const [showDefs, setShowDefs] = useState(false);
  const [showStartGuide, setShowStartGuide] = useState(false);
  const [showFuelGuide, setShowFuelGuide] = useState(false);
  const { isPremium, expiresAt } = usePremium();
  const { user, signOut } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const { launchPaywall, redeemOfferCode } = useDespiaPurchases();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showPlanCompare, setShowPlanCompare] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const isAndroid = /android/i.test(navigator.userAgent);
  const [profileSubpage, setProfileSubpage] = useState<"main" | "hr-zones" | "personal-bests" | "edit-profile" /* | "badges" */>("main");
  const [aiChatDisabled, setAiChatDisabled] = useState(() => localStorage.getItem("ai_chat_disabled") === "true");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [textScale, setTextScale] = useTextScale();
  const [hubSection, setHubSection] = useState<"main" | "fitness" | "communication" | "guides" | "settings">("main");

  const handleDeleteAccount = async () => {
    if (!user || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      toast({
        title: lang === "zh" ? "帳號已刪除" : "Account deleted",
        description: lang === "zh" ? "您的帳號及資料已永久刪除。" : "Your account and data have been permanently removed.",
      });
      await signOut();
    } catch (e: any) {
      toast({
        title: lang === "zh" ? "刪除失敗" : "Delete failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Open HR zones subpage when navigated via #hr-zones (e.g. from ActivityDetail).
  useEffect(() => {
    if (sessionStorage.getItem("open_fueling_guide") === "1") {
      sessionStorage.removeItem("open_fueling_guide");
      setShowFuelGuide(true);
    }
  }, []);

  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#hr-zones") {
        setHubSection("main");
        window.setTimeout(() => document.getElementById("more-heart-rate-zones")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    checkHash();
    const onHash = () => checkHash();
    const onCustom = () => {
      setHubSection("main");
      window.setTimeout(() => document.getElementById("more-heart-rate-zones")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    };
    const onOpenFuel = () => setShowFuelGuide(true);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("focus-hr-zones", onCustom);
    window.addEventListener("open-fueling-guide", onOpenFuel);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("focus-hr-zones", onCustom);
      window.removeEventListener("open-fueling-guide", onOpenFuel);
    };
  }, []);
  const [countdown, setCountdown] = useState("");
  const [activityNotifications, setActivityNotifications] = useState(true);
  const [notifLoading, setNotifLoading] = useState(false);
  const currentRoute = `${location.pathname}${location.search}`;
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("app_theme") === "dark" || document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("app_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("app_theme", "light");
    }
  }, [darkMode]);

  // Update countdown every minute
  useEffect(() => {
    if (!isPremium || !expiresAt) return;
    setCountdown(formatCountdown(expiresAt));
    const interval = setInterval(() => {
      setCountdown(formatCountdown(expiresAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [isPremium, expiresAt]);

  const handleUpgradeClick = () => {
    if (!user) {
      setShowLoginPrompt(true);
    } else {
      launchPaywall("default", lang === "zh" ? "zh_Hant" : "en");
    }
  };

  // Load notification preference
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("activity_notifications")
        .eq("user_id", user.id)
        .single();
      if (data) setActivityNotifications(data.activity_notifications);
    };
    load();
  }, [user]);

  const toggleActivityNotifications = async () => {
    if (!user || notifLoading) return;
    if (!navigator.onLine) {
      toast({
        title: lang === "zh" ? "離線中" : "You're offline",
        description: lang === "zh" ? "需要連線才能更改通知設定" : "Connect to the internet to change notification settings",
        variant: "destructive",
      });
      return;
    }
    setNotifLoading(true);
    const newVal = !activityNotifications;
    setActivityNotifications(newVal);
    await supabase
      .from("profiles")
      .update({ activity_notifications: newVal } as any)
      .eq("user_id", user.id);
    setNotifLoading(false);
  };
  if (!skeletonDone) return <SettingsSkeleton />;

  // Start Running Guide subpage
  if (showStartGuide) {
    return <StartRunningGuide lang={lang} onBack={() => setShowStartGuide(false)} />;
  }
  if (showFuelGuide) {
    return <FuelingGuide lang={lang} onBack={() => setShowFuelGuide(false)} />;
  }

  // Profile subpage view (HR Zones, Personal Bests) — render full-screen subpage.
  if (user && profileSubpage !== "main") {
    return (
      <div className="px-5 pt-2 max-w-lg mx-auto">
        <ProfileSection lang={lang} subpage={profileSubpage} onNavigate={setProfileSubpage} />
      </div>
    );
  }

  const sectionTitle = {
    fitness: lang === "zh" ? "連接健身應用程式" : "Connect Fitness Apps",
    communication: lang === "zh" ? "連接通訊應用程式" : "Connect Communication Apps",
    guides: lang === "zh" ? "跑步指南" : "Running Guides",
    settings: lang === "zh" ? "應用程式設定" : "App Settings",
  } as const;

  const HubTile = ({ section, icon: Icon, title, description }: {
    section: Exclude<typeof hubSection, "main">;
    icon: typeof UserRound;
    title: string;
    description: string;
  }) => (
    <Button
      variant="outline"
      onClick={() => setHubSection(section)}
      className="h-36 min-w-0 flex-col items-start justify-between rounded-2xl border-border bg-card p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={21} />
      </span>
      <span className="w-full min-w-0 whitespace-normal">
        <span className="flex h-5 items-end font-display text-[15px] font-semibold leading-tight text-foreground">{title}</span>
        <span className="mt-1 block h-8 text-xs font-normal leading-snug text-muted-foreground">{description}</span>
      </span>
    </Button>
  );

  const MenuRow = ({ icon: Icon, label, detail, onClick, destructive = false }: {
    icon: typeof UserRound;
    label: string;
    detail?: string;
    onClick: () => void;
    destructive?: boolean;
  }) => (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`h-auto w-full justify-start rounded-none px-4 py-3.5 ${destructive ? "text-destructive hover:text-destructive" : "text-foreground"}`}
    >
      <Icon size={19} className={destructive ? "text-destructive" : "text-primary"} />
      <span className="min-w-0 flex-1 whitespace-normal text-left">
        <span className="block text-sm font-medium">{label}</span>
        {detail && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{detail}</span>}
      </span>
      <ChevronRight size={17} className="shrink-0 text-muted-foreground" />
    </Button>
  );

  const ToggleRow = ({ icon: Icon, label, detail, checked, onToggle, disabled = false }: {
    icon: typeof UserRound;
    label: string;
    detail?: string;
    checked: boolean;
    onToggle: () => void;
    disabled?: boolean;
  }) => (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Icon size={19} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{detail}</p>}
      </div>
      <Button
        variant="ghost"
        size="icon"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onToggle}
        className={`h-7 w-12 shrink-0 rounded-full p-0 ${checked ? "bg-primary hover:bg-primary/90" : "bg-input hover:bg-input"}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-2.5" : "-translate-x-2.5"}`} />
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg px-5 pt-3 pb-6">
      {hubSection === "main" ? (
        <div className="space-y-5">
          {user ? (
            <ProfileSection lang={lang} subpage="main" onNavigate={setProfileSubpage} compact />
          ) : (
            <div className="flex items-center gap-4 py-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UserRound size={27} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl font-bold">{lang === "zh" ? "你的個人頁面" : "Your profile"}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{lang === "zh" ? "登入以同步設定與紀錄" : "Sign in to sync settings and records"}</p>
              </div>
              <Button size="sm" onClick={onLoginRequest}>{lang === "zh" ? "登入" : "Sign in"}</Button>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning"><Crown size={21} /></span>
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-foreground">{isPremium ? (lang === "zh" ? "Runward Premium" : "Runward Premium") : t("upgradePremium", lang)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{isPremium ? (countdown ? `${lang === "zh" ? "剩餘" : "Renews in"} ${countdown}` : (lang === "zh" ? "已啟用" : "Active")) : (lang === "zh" ? "解鎖完整訓練體驗" : "Unlock the complete training experience")}</p>
                </div>
              </div>
              <Button size="sm" variant={isPremium ? "outline" : "default"} onClick={() => isPremium ? setShowPlanCompare(true) : handleUpgradeClick()}>
                {isPremium ? (lang === "zh" ? "查看" : "View") : t("upgrade", lang)}
              </Button>
            </div>
          </div>

          <div>
            <h2 className="mb-3 px-1 font-display text-xs font-semibold uppercase text-muted-foreground">{lang === "zh" ? "你的 Runward" : "Your Runward"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <HubTile section="fitness" icon={Watch} title={lang === "zh" ? "連接健身應用程式" : "Connect Fitness Apps"} description={lang === "zh" ? "手錶與主要運動資料來源" : "Watches and activity data sources"} />
              <HubTile section="communication" icon={MessageSquare} title={lang === "zh" ? "連接通訊應用程式" : "Connect Communication Apps"} description={lang === "zh" ? "WhatsApp、Telegram 通知" : "WhatsApp and Telegram alerts"} />
              <HubTile section="guides" icon={BookOpen} title={lang === "zh" ? "跑步指南" : "Running Guides"} description={lang === "zh" ? "訓練、長跑與補給知識" : "Training, distance and fueling"} />
              <HubTile section="settings" icon={Settings2} title={lang === "zh" ? "應用程式設定" : "App Settings"} description={lang === "zh" ? "顯示、語言、通知與私隱" : "Display, language and notifications"} />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
            <MenuRow icon={LifeBuoy} label={lang === "zh" ? "支援與幫助" : "Support & Help"} onClick={() => navigate("/support", { state: { from: currentRoute } })} />
            {!adminLoading && isAdmin && <MenuRow icon={Shield} label={lang === "zh" ? "管理員" : "Admin Panel"} onClick={() => navigate("/admin", { state: { from: currentRoute } })} />}
          </div>
          {user && <Button variant="ghost" className="w-full text-muted-foreground" onClick={signOut}><LogOut size={18} />{lang === "zh" ? "登出" : "Sign Out"}</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 py-1">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setHubSection("main")} aria-label={lang === "zh" ? "返回" : "Back"}><ChevronLeft size={21} /></Button>
            <div>
              <p className="text-xs text-muted-foreground">{lang === "zh" ? "個人頁面" : "Personal"}</p>
              <h1 className="font-display text-xl font-bold">{sectionTitle[hubSection]}</h1>
            </div>
          </div>

          {hubSection === "fitness" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
              {user && <MenuRow icon={Smartphone} label={t("connectFitnessApps", lang)} detail={lang === "zh" ? "管理你的主要運動資料來源" : "Manage your primary fitness data source"} onClick={() => onNavigateConnectApps?.()} />}
              {user && <MenuRow icon={KeyRound} label={lang === "zh" ? "已連結的應用程式" : "Connected apps"} detail={lang === "zh" ? "第三方應用程式存取" : "Third-party app access"} onClick={() => navigate("/settings/connected-apps", { state: { from: currentRoute } })} />}
              {!user && <MenuRow icon={Lock} label={lang === "zh" ? "登入以連接健身應用程式" : "Sign in to connect fitness apps"} onClick={() => onLoginRequest?.()} />}
            </div>
          )}

          {hubSection === "communication" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
              {user ? <MenuRow icon={MessageSquare} label={lang === "zh" ? "通訊應用程式（試行）" : "Messaging Apps (BETA)"} detail="WhatsApp · Telegram" onClick={() => onNavigateMessaging?.()} /> : <MenuRow icon={Lock} label={lang === "zh" ? "登入以連接通訊應用程式" : "Sign in to connect communication apps"} onClick={() => onLoginRequest?.()} />}
            </div>
          )}

          {hubSection === "guides" && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
              <MenuRow icon={BookOpen} label={t("trainingDefinitions", lang)} detail={lang === "zh" ? "了解各種訓練強度" : "Understand each training intensity"} onClick={() => setShowDefs(!showDefs)} />
              {showDefs && <div className="space-y-2 bg-muted/40 p-4">{definitions.map((def) => <div key={def.nameKey}><p className="text-sm font-semibold">{lang === "zh" ? def.nameZhKey : def.nameKey}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(def.defKey, lang)}</p></div>)}</div>}
              <MenuRow icon={Footprints} label={lang === "zh" ? "如何開始長距離跑步" : "How to Start Long Distance Running"} onClick={() => setShowStartGuide(true)} />
              <MenuRow icon={Flame} label={lang === "zh" ? "跑者補給指南" : "Runner Fueling Guide"} onClick={() => setShowFuelGuide(true)} />
            </div>
          )}

          {hubSection === "settings" && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
                <ToggleRow icon={darkMode ? Moon : Sun} label={lang === "zh" ? "深色模式" : "Dark Mode"} checked={darkMode} onToggle={() => setDarkMode(!darkMode)} />
                <ToggleRow icon={Bell} label={lang === "zh" ? "停用 AI 聊天" : "Disable AI Chat"} detail={lang === "zh" ? "隱藏浮動聊天按鈕" : "Hide the floating chat button"} checked={aiChatDisabled} onToggle={() => { const next = !aiChatDisabled; setAiChatDisabled(next); if (next) localStorage.setItem("ai_chat_disabled", "true"); else localStorage.removeItem("ai_chat_disabled"); window.dispatchEvent(new Event("ai-chat-toggle")); }} />
                {user && <ToggleRow icon={Bell} label={lang === "zh" ? "活動推送通知" : "Activity Notifications"} detail={lang === "zh" ? "跑步同步後接收通知" : "Get notified after a run syncs"} checked={activityNotifications} onToggle={toggleActivityNotifications} disabled={notifLoading} />}
              </div>

              {user && (
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <h2 className="mb-3 font-display text-sm font-semibold text-foreground">{lang === "zh" ? "社群私隱" : "Community Privacy"}</h2>
                  <CommunityPrivacy lang={lang} compact />
                </div>
              )}

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2"><Globe size={18} className="text-primary" /><p className="text-sm font-medium">{t("language", lang)}</p></div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={lang === "en" ? "default" : "secondary"} onClick={() => setLang("en")}>{t("english", lang)}</Button>
                  <Button variant={lang === "zh" ? "default" : "secondary"} onClick={() => setLang("zh")}>{t("chinese", lang)}</Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="mb-3 text-sm font-medium">{lang === "zh" ? "文字大小" : "Text Size"}</p>
                <div className="grid grid-cols-3 gap-2">{([ { v: "default" as TextScale, label: lang === "zh" ? "預設" : "Default" }, { v: "lg" as TextScale, label: lang === "zh" ? "大" : "Large" }, { v: "xl" as TextScale, label: lang === "zh" ? "特大" : "X-Large" } ]).map((opt) => <Button key={opt.v} variant={textScale === opt.v ? "default" : "secondary"} className="h-12 flex-col gap-0 text-xs" onClick={() => setTextScale(opt.v)}><span className={opt.v === "xl" ? "text-lg" : opt.v === "lg" ? "text-base" : "text-sm"}>A</span><span>{opt.label}</span></Button>)}</div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
                <MenuRow icon={Smartphone} label={lang === "zh" ? "主螢幕小工具" : "Home Screen Widget"} detail={user?.id?.startsWith("c7a7") ? undefined : (lang === "zh" ? "即將推出" : "Coming soon")} onClick={() => user?.id?.startsWith("c7a7") && setShowWidgetDialog(true)} />
                {user && !isPremium && <MenuRow icon={Ticket} label={lang === "zh" ? "兌換優惠代碼" : "Redeem Offer Code"} onClick={() => setShowRedeemDialog(true)} />}
                <MenuRow icon={ShieldCheck} label={lang === "zh" ? "隱私權政策" : "Privacy Policy"} onClick={() => navigate("/privacy", { state: { from: currentRoute } })} />
                {user && <MenuRow icon={Trash2} label={lang === "zh" ? "刪除帳號" : "Delete Account"} onClick={() => setShowDeleteDialog(true)} destructive />}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Login Prompt Dialog */}
      <Dialog open={showLoginPrompt} onOpenChange={setShowLoginPrompt}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock size={18} />
              {lang === "zh" ? "需要登入" : "Login Required"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {lang === "zh" ? "請先登入或註冊以升級至高級版。" : "Please sign in or create an account to upgrade to Premium."}
          </p>
          <Button onClick={() => { setShowLoginPrompt(false); onLoginRequest?.(); }} className="w-full">
            {lang === "zh" ? "登入 / 註冊" : "Sign In / Sign Up"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Redeem Offer Code Dialog */}
      <Dialog open={showRedeemDialog} onOpenChange={(open) => { setShowRedeemDialog(open); if (!open) setOfferCode(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket size={18} />
              {lang === "zh" ? "輸入優惠代碼" : "Enter Offer Code"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "輸入您的優惠代碼，我們將引導您前往 App Store 完成兌換。"
              : "Enter your offer code and we'll take you to the App Store to complete redemption."}
          </p>
          <Input
            value={offerCode}
            onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
            placeholder={lang === "zh" ? "輸入代碼" : "Enter code"}
            className="text-center text-lg tracking-widest font-mono"
            autoFocus
          />
          <Button
            onClick={() => {
              if (offerCode.trim()) {
                redeemOfferCode(offerCode.trim(), lang);
                setShowRedeemDialog(false);
                setOfferCode("");
              }
            }}
            disabled={!offerCode.trim()}
            className="w-full"
          >
            {lang === "zh" ? "兌換" : "Redeem"}
          </Button>
        </DialogContent>
      </Dialog>

      <PlanComparisonDialog open={showPlanCompare} onOpenChange={setShowPlanCompare} lang={lang} />
      <HomeWidgetDialog open={showWidgetDialog} onOpenChange={setShowWidgetDialog} lang={lang} />

      {/* Delete Account Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(o) => !deleting && setShowDeleteDialog(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 size={18} />
              {lang === "zh" ? "刪除帳號" : "Delete Account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "zh"
                ? "此操作將永久刪除您的帳號、活動、訓練計劃及所有相關資料。此操作無法復原。"
                : "This will permanently delete your account, activities, training plans and all related data. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {lang === "zh" ? "取消" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? (lang === "zh" ? "刪除中..." : "Deleting...")
                : (lang === "zh" ? "永久刪除" : "Permanently Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MoreTab;
