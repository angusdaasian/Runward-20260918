import { ChevronRight, Crown, Globe, BookOpen, Check, ScanEye, Lock, KeyRound, Clock, Shield, Info, LifeBuoy, Mail, ShieldCheck, Smartphone, Moon, Sun, LogOut, Gift, Ticket, Bell, Footprints, Flame } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import despia from "despia-native";
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

interface Props {
  lang: Lang;
  setLang: (l: Lang) => void;
  onLoginRequest?: () => void;
  onNavigateConnectApps?: () => void;
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

const MoreTab = ({ lang, setLang, onLoginRequest, onNavigateConnectApps }: Props) => {
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
  const { isPremium, expiresAt, plan, rcEntitlement } = usePremium();
  const { user, signOut } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const { launchPaywall, redeemOfferCode } = useDespiaPurchases();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showPlanCompare, setShowPlanCompare] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const [profileSubpage, setProfileSubpage] = useState<"main" | "hr-zones" | "personal-bests" | "edit-profile" /* | "badges" */>("main");
  const [aiChatDisabled, setAiChatDisabled] = useState(() => localStorage.getItem("ai_chat_disabled") === "true");

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
        setProfileSubpage("hr-zones");
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    checkHash();
    const onHash = () => checkHash();
    const onCustom = () => setProfileSubpage("hr-zones");
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
  const { refreshSubscription } = usePremium();
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

  return (
    <div className="px-5 pt-2 max-w-lg mx-auto">
      <div className="space-y-3">
        {user && <ProfileSection lang={lang} subpage="main" onNavigate={setProfileSubpage} />}

        {/* Dark Mode - right after profile/sign-in */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {darkMode ? <Moon size={20} className="text-primary" /> : <Sun size={20} className="text-primary" />}
              <span className="font-medium text-foreground">{lang === "zh" ? "深色模式" : "Dark Mode"}</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? "bg-primary" : "bg-input"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${darkMode ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        {!user && (
          <button
            onClick={onLoginRequest}
            className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 text-primary"
          >
            <KeyRound size={20} />
            <span className="font-medium">{lang === "zh" ? "登入 / 註冊" : "Sign In / Sign Up"}</span>
          </button>
        )}

        {/* Training Definitions */}
        <button
          onClick={() => setShowDefs(!showDefs)}
          className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <BookOpen size={20} className="text-primary" />
            <span className="font-medium text-foreground">{t("trainingDefinitions", lang)}</span>
          </div>
          <ChevronRight size={18} className={`text-muted-foreground transition-transform ${showDefs ? "rotate-90" : ""}`} />
        </button>

        {showDefs && (
          <div className="space-y-2 pl-2">
            {definitions.map((def) => (
              <div key={def.nameKey} className="bg-accent rounded-lg p-3">
                <h3 className="font-display font-semibold text-sm text-foreground mb-1">
                  {lang === "zh" ? def.nameZhKey : def.nameKey}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{t(def.defKey, lang)}</p>
              </div>
            ))}
          </div>
        )}

        {/* How to Start Long Distance Running */}
        <button
          onClick={() => setShowStartGuide(true)}
          className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Footprints size={20} className="text-primary" />
            <span className="font-medium text-foreground text-left">
              {lang === "zh" ? "如何開始長距離跑步" : "How to Start Long Distance Running"}
            </span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        {/* Fueling Guide */}
        <button
          onClick={() => setShowFuelGuide(true)}
          className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Flame size={20} className="text-orange-500" />
            <span className="font-medium text-foreground text-left">
              {lang === "zh" ? "跑者補給指南" : "Runner Fueling Guide"}
            </span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        {/* Premium */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown size={20} className="text-warning" />
              <div>
                <span className="font-medium text-foreground block">{t("upgradePremium", lang)}</span>
              </div>
            </div>
            {isPremium ? (
              <div className="text-right">
                <span className="bg-success/15 text-success px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                  <Check size={12} />
                  {(() => {
                    const isLifetime = expiresAt && (expiresAt.getFullYear() - new Date().getFullYear()) > 50;
                    if (isLifetime || plan?.includes("lifetime") || plan === "NON_RENEWING_PURCHASE")
                      return lang === "zh" ? "終身" : "Lifetime";
                    if (plan === "monthly" || plan?.includes("monthly"))
                      return lang === "zh" ? "月費" : "Monthly";
                    if (plan === "code_annual")
                      return lang === "zh" ? "年費（代碼）" : "Annual (Code)";
                    return lang === "zh" ? "年費" : "Yearly";
                  })()}
                </span>
                {expiresAt && (expiresAt.getFullYear() - new Date().getFullYear()) <= 50 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 justify-end">
                    <Clock size={10} />
                    {countdown}
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowPlanCompare(true)}
                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-semibold"
              >
                {t("upgrade", lang)}
              </button>
            )}
          </div>
        </div>


        {/* Current Entitlement */}
        {isPremium && rcEntitlement && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Shield size={20} className="text-primary" />
              <span className="font-medium text-foreground">
                {lang === "zh" ? "當前權益" : "Current Entitlement"}
              </span>
            </div>
            <div className="bg-accent rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{lang === "zh" ? "權益" : "Entitlement"}</span>
                <span className="text-sm font-semibold text-foreground capitalize">{rcEntitlement}</span>
              </div>
              {plan && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{lang === "zh" ? "方案" : "Plan"}</span>
                  <span className="text-sm text-foreground">
                    {plan.includes("monthly") ? (lang === "zh" ? "月費" : "Monthly")
                      : plan === "code_annual" ? (lang === "zh" ? "年費（代碼）" : "Annual (Code)")
                      : plan.includes("annual") || plan.includes("yearly") ? (lang === "zh" ? "年費" : "Annual")
                      : plan.includes("lifetime") ? (lang === "zh" ? "終身" : "Lifetime")
                      : plan}
                  </span>
                </div>
              )}
              {expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{lang === "zh" ? "到期" : "Expires"}</span>
                  <span className="text-sm text-foreground">{expiresAt.toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Redeem Offer Code */}
        {user && !isPremium && (
          <button
            onClick={() => setShowRedeemDialog(true)}
            className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Ticket size={20} className="text-primary" />
              <span className="font-medium text-foreground">
                {lang === "zh" ? "兌換優惠代碼" : "Redeem Offer Code"}
              </span>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        )}
        {/* Language */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Globe size={20} className="text-primary" />
            <span className="font-medium text-foreground">{t("language", lang)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setLang("en")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${lang === "en" ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"}`}
            >
              {t("english", lang)}
            </button>
            <button
              onClick={() => setLang("zh")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${lang === "zh" ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"}`}
            >
              {t("chinese", lang)}
            </button>
          </div>
        </div>
        {/* Connect to Fitness Apps */}
        {user && (
          <button
            onClick={onNavigateConnectApps}
            className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Smartphone size={20} className="text-primary" />
              <span className="font-medium text-foreground">{t("connectFitnessApps", lang)}</span>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        )}

        {/* Activity Push Notifications */}
        {user && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell size={20} className="text-primary" />
                <span className="font-medium text-foreground">
                  {lang === "zh" ? "活動推送通知" : "Activity Notifications"}
                </span>
              </div>
              <button
                onClick={toggleActivityNotifications}
                disabled={notifLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${activityNotifications ? "bg-primary" : "bg-input"}`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${activityNotifications ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-8">
              {lang === "zh" ? "跑步完成後接收 XP 通知" : "Get notified when a run is synced with XP earned"}
            </p>
            <button
              onClick={async () => {
                try {
                  console.log("[Push] Requesting push permission via Despia native...");
                  await despia("registerpush://");
                  console.log("[Push] Sent despia registerpush://");

                  if (user?.id) {
                    await despia(`setonesignalplayerid://?user_id=${user.id}`);
                    console.log("[Push] Linked OneSignal external_id:", user.id);
                  }

                  toast({
                    title: lang === "zh" ? "已請求推送權限" : "Push permission requested",
                    description: lang === "zh" ? "若沒有跳出視窗，請檢查 iPhone 通知設定。" : "If no popup appeared, check iPhone notification settings.",
                  });
                } catch (e) {
                  console.warn("[Push] Error requesting permission:", e);
                }
              }}
              className="mt-2 ml-8 text-xs font-medium text-primary hover:underline"
            >
              {lang === "zh" ? "📲 啟用推送通知" : "📲 Enable Push Notifications"}
            </button>
          </div>
        )}

        {/* Disable AI Chat toggle */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell size={20} className="text-primary" />
              <span className="font-medium text-foreground">
                {lang === "zh" ? "停用 AI 聊天" : "Disable AI Chat"}
              </span>
            </div>
            <button
              onClick={() => {
                const next = !aiChatDisabled;
                setAiChatDisabled(next);
                if (next) localStorage.setItem("ai_chat_disabled", "true");
                else localStorage.removeItem("ai_chat_disabled");
                window.dispatchEvent(new Event("ai-chat-toggle"));
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiChatDisabled ? "bg-primary" : "bg-input"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${aiChatDisabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-8">
            {lang === "zh" ? "從畫面隱藏浮動 AI 聊天按鈕" : "Hide the floating AI chat button from the screen"}
          </p>
        </div>

        {!adminLoading && isAdmin && (
          <button
            onClick={() => navigate("/admin", { state: { from: currentRoute } })}
            className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Shield size={20} className="text-primary" />
              <span className="font-medium text-foreground">{lang === "zh" ? "管理員" : "Admin Panel"}</span>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        )}

        <button
          onClick={() => navigate("/support", { state: { from: currentRoute } })}
          className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <LifeBuoy size={20} className="text-primary" />
            <span className="font-medium text-foreground">{lang === "zh" ? "支援與幫助" : "Support"}</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        {/* Privacy Policy */}
        <button
          onClick={() => navigate("/privacy", { state: { from: currentRoute } })}
          className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-primary" />
            <span className="font-medium text-foreground">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        {/* Sign Out - at the very bottom */}
        {user && (
          <button
            onClick={signOut}
            className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 text-destructive mt-4"
          >
            <LogOut size={20} />
            <span className="font-medium">{lang === "zh" ? "登出" : "Sign Out"}</span>
          </button>
        )}
      </div>

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

    </div>
  );
};

export default MoreTab;
