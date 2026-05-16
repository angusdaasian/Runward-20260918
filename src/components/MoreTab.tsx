import { ChevronRight, Crown, Globe, BookOpen, Check, ScanEye, Lock, KeyRound, Clock, Shield, Info, LifeBuoy, Mail, ShieldCheck, Smartphone, Moon, Sun, LogOut, Gift, Ticket, Bell, Footprints } from "lucide-react";
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

const startRunningGuide: { en: { title: string; body: string }; zh: { title: string; body: string } }[] = [
  {
    en: { title: "1. Get the right shoes", body: "Visit a specialty running store for a gait analysis and pick a neutral or stability shoe that fits your foot shape. Replace shoes every 500–800 km. Good shoes prevent the most common beginner injuries." },
    zh: { title: "1. 選對跑鞋", body: "到專業跑步店做步態分析，挑選適合腳型的中性或穩定型跑鞋。每跑 500–800 公里就要更換。合腳的鞋是預防新手傷痛最關鍵的一步。" },
  },
  {
    en: { title: "2. Start with run/walk intervals", body: "Don't try to run continuously on day one. A proven beginner pattern: run 1 minute, walk 2 minutes, repeat 8 times — 3 days per week. Each week, add 30 seconds of running and reduce walking. In 8–10 weeks you can comfortably run 30 minutes non-stop." },
    zh: { title: "2. 跑走交替開始", body: "別第一天就硬跑到底。經典新手節奏：跑 1 分鐘、走 2 分鐘，重複 8 次，每週 3 次。每週多跑 30 秒、少走 30 秒。8–10 週後就能輕鬆連續跑 30 分鐘。" },
  },
  {
    en: { title: "3. Slow down — the talk test", body: "You should be able to hold a full conversation while running. If you can only gasp single words, you're going too fast. 80% of all your runs should feel easy; only 20% should be hard. This is the secret most beginners miss." },
    zh: { title: "3. 放慢速度 — 對話測試", body: "跑步時要能順暢說整句話。如果只能蹦出單字，就是太快了。80% 的訓練應該輕鬆愉快，只有 20% 才是高強度。這是大多數新手忽略的秘訣。" },
  },
  {
    en: { title: "4. Follow the 10% rule", body: "Never increase your weekly mileage by more than 10% from one week to the next. Bones, tendons and ligaments adapt much slower than your lungs and muscles. Doing too much too soon is the #1 cause of running injuries." },
    zh: { title: "4. 10% 增量原則", body: "每週總跑量增加不超過 10%。骨骼、肌腱、韌帶適應速度遠慢於心肺與肌肉。過快增量是跑步傷害的頭號原因。" },
  },
  {
    en: { title: "5. Make rest days non-negotiable", body: "Run on alternate days at first. Recovery days are when your body actually gets stronger. Add cross-training (cycling, swimming, easy strength) on rest days to build aerobic base without pounding your joints." },
    zh: { title: "5. 休息日不可省略", body: "初期請隔天跑一次。休息日才是身體真正變強的時候。可在休息日做交叉訓練（單車、游泳、輕量重訓）來建立有氧基礎，又不傷關節。" },
  },
  {
    en: { title: "6. Build your weekly long run", body: "Once you can run 30 minutes, designate one run per week as your 'long run' and slowly extend it. The long run builds endurance, capillaries and mental toughness — the foundation for any 5K, 10K, half or full marathon." },
    zh: { title: "6. 每週安排一次長跑", body: "能連續跑 30 分鐘後，每週固定一次「長跑」並逐步加長。長跑建立耐力、微血管與心理韌性，是 5K、10K、半馬、全馬的共同基礎。" },
  },
  {
    en: { title: "7. Warm up, cool down, stretch", body: "Start every run with 5 minutes of brisk walking or dynamic drills (leg swings, high knees). End with 5 minutes of easy walking and gentle stretches for calves, hamstrings, hip flexors and glutes. This dramatically reduces stiffness and injury risk." },
    zh: { title: "7. 熱身、緩和、伸展", body: "每次跑前 5 分鐘快走或動態熱身（擺腿、高抬腿）。結束後 5 分鐘慢走，並伸展小腿、腿後肌、髖屈肌與臀肌。能大幅減少僵硬與受傷風險。" },
  },
  {
    en: { title: "8. Fuel and hydrate properly", body: "Drink water throughout the day, not just before runs. For runs under 60 minutes, water is enough. Beyond 60 minutes, add electrolytes and easy-to-digest carbs (gels, bananas). Eat a small carb-rich snack 60–90 minutes before running." },
    zh: { title: "8. 補水與營養", body: "每天規律喝水，不要只在跑前才補。60 分鐘以內的跑步喝水即可；超過 60 分鐘就要補充電解質與好消化的碳水（果膠、香蕉）。跑前 60–90 分鐘吃一點碳水點心。" },
  },
  {
    en: { title: "9. Add strength training", body: "Two short strength sessions per week (squats, lunges, planks, glute bridges, calf raises) make you a faster, more injury-resistant runner. Strong hips and core fix most form problems automatically." },
    zh: { title: "9. 加入肌力訓練", body: "每週兩次短時間肌力（深蹲、弓步、棒式、臀橋、提踵）能讓你更快、更不易受傷。強壯的髖部與核心會自動修正大部分跑姿問題。" },
  },
  {
    en: { title: "10. Set a goal — sign up for a 5K", body: "Nothing keeps you consistent like a race on the calendar. A local 5K in 8–12 weeks is the perfect first goal. Track your runs, celebrate small wins, and remember: every runner started exactly where you are now." },
    zh: { title: "10. 設定目標 — 報名 5K", body: "行事曆上有比賽就最能維持規律。8–12 週後的 5K 是完美的第一目標。記錄每次跑步、慶祝小進步，記住：每位跑者都是從你現在這一步開始的。" },
  },
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
  const { isPremium, expiresAt, plan, rcEntitlement } = usePremium();
  const { user, signOut } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const { launchPaywall, redeemOfferCode } = useDespiaPurchases();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showPlanCompare, setShowPlanCompare] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const [profileSubpage, setProfileSubpage] = useState<"main" | "hr-zones" | "personal-bests" | "edit-profile">("main");
  const [aiChatDisabled, setAiChatDisabled] = useState(() => localStorage.getItem("ai_chat_disabled") === "true");

  // Open HR zones subpage when navigated via #hr-zones (e.g. from ActivityDetail).
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
    window.addEventListener("hashchange", onHash);
    window.addEventListener("focus-hr-zones", onCustom);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("focus-hr-zones", onCustom);
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

        {/* Premium */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown size={20} className="text-warning" />
              <div>
                <span className="font-medium text-foreground block">{t("upgradePremium", lang)}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ScanEye size={12} />
                  {t("unlockPosture", lang)}
                </span>
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
                onClick={handleUpgradeClick}
                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-semibold"
              >
                {t("upgrade", lang)}
              </button>
            )}
          </div>
        </div>

        {/* Compare Plans — independent section */}
        <button
          onClick={() => setShowPlanCompare(true)}
          className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Info size={20} className="text-primary" />
            <span className="font-medium text-foreground">
              {lang === "zh" ? "比較免費版與 Premium" : "Compare Free vs Premium"}
            </span>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

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
