import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Crown,
  Globe,
  Moon,
  Sun,
  Bell,
  ShieldCheck,
  LifeBuoy,
  LogOut,
  Trash2,
  Shield,
  Plug,
  KeyRound,
  Check,
  Clock,
  BookOpen,
  Footprints,
  Flame,
  Ticket,
  MessageSquareOff,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Lang, t } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { useAdmin } from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";
import ProfileSection from "@/components/ProfileSection";
import PlanComparisonDialog from "@/components/PlanComparisonDialog";
import DesktopPageHeader from "./DesktopPageHeader";

interface Props {
  lang: Lang;
  setLang: (l: Lang) => void;
  onLoginRequest: () => void;
  onNavigateConnectApps: () => void;
}

const definitions = [
  { name: "Easy", nameZh: "輕鬆跑", key: "easyDef" as const },
  { name: "Marathon", nameZh: "馬拉松配速", key: "marathonDef" as const },
  { name: "Threshold", nameZh: "乳酸閾值", key: "thresholdDef" as const },
  { name: "Interval", nameZh: "間歇訓練", key: "intervalDef" as const },
  { name: "Repetition", nameZh: "重複訓練", key: "repetitionDef" as const },
];

function formatCountdown(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

export default function DashboardSettings({
  lang,
  setLang,
  onLoginRequest,
  onNavigateConnectApps,
}: Props) {
  const zh = lang === "zh";
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isPremium, expiresAt, plan, rcEntitlement } = usePremium();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const { redeemOfferCode } = useDespiaPurchases();

  const [darkMode, setDarkMode] = useState(
    () =>
      localStorage.getItem("app_theme") === "dark" ||
      document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("app_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("app_theme", "light");
    }
  }, [darkMode]);

  const [activityNotifications, setActivityNotifications] = useState(true);
  const [notifLoading, setNotifLoading] = useState(false);
  const [aiChatDisabled, setAiChatDisabled] = useState(
    () => localStorage.getItem("ai_chat_disabled") === "true"
  );
  const [countdown, setCountdown] = useState("");
  const [showPlanCompare, setShowPlanCompare] = useState(false);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [offerCode, setOfferCode] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDefs, setShowDefs] = useState(false);
  const [profileSubpage, setProfileSubpage] = useState<
    "main" | "hr-zones" | "personal-bests" | "edit-profile"
  >("main");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("activity_notifications")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setActivityNotifications(data.activity_notifications);
      });
  }, [user]);

  useEffect(() => {
    if (!isPremium || !expiresAt) return;
    setCountdown(formatCountdown(expiresAt));
    const i = setInterval(() => setCountdown(formatCountdown(expiresAt)), 60000);
    return () => clearInterval(i);
  }, [isPremium, expiresAt]);

  const toggleActivityNotifications = async () => {
    if (!user || notifLoading) return;
    setNotifLoading(true);
    const newVal = !activityNotifications;
    setActivityNotifications(newVal);
    await supabase
      .from("profiles")
      .update({ activity_notifications: newVal } as any)
      .eq("user_id", user.id);
    setNotifLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!user || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      toast({
        title: zh ? "帳號已刪除" : "Account deleted",
        description: zh ? "您的帳號及資料已永久刪除。" : "Your account and data have been removed.",
      });
      await signOut();
      navigate("/");
    } catch (e: any) {
      toast({
        title: zh ? "刪除失敗" : "Delete failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Profile subpage (HR zones, PBs, edit) — full-width takeover within settings
  if (user && profileSubpage !== "main") {
    return (
      <div>
        <DesktopPageHeader
          title={zh ? "個人資料" : "Profile"}
          subtitle={zh ? "管理您的跑步資料" : "Manage your runner profile"}
          icon={<SettingsIcon className="h-5 w-5" />}
          actions={
            <Button variant="outline" size="sm" onClick={() => setProfileSubpage("main")}>
              {zh ? "返回設定" : "Back to settings"}
            </Button>
          }
        />
        <div className="max-w-3xl">
          <Card>
            <CardContent className="pt-6">
              <ProfileSection lang={lang} subpage={profileSubpage} onNavigate={setProfileSubpage} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "設定" : "Settings"}
        subtitle={zh ? "個人資料、訂閱與偏好設定" : "Profile, subscription, and preferences"}
        icon={<SettingsIcon className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT — Profile + Subscription (2 cols on xl) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Account / Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{zh ? "帳號" : "Account"}</CardTitle>
              <CardDescription>
                {user
                  ? zh
                    ? "管理個人資料、心率區間與個人最佳成績"
                    : "Manage profile, heart-rate zones and personal bests"
                  : zh
                  ? "登入以同步活動、計劃與成就"
                  : "Sign in to sync activities, plans and achievements"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user ? (
                <ProfileSection
                  lang={lang}
                  subpage="main"
                  onNavigate={setProfileSubpage}
                />
              ) : (
                <Button
                  onClick={onLoginRequest}
                  size="lg"
                  className="w-full sm:w-auto gap-2"
                >
                  <KeyRound className="h-4 w-4" />
                  {zh ? "登入 / 註冊" : "Sign In / Sign Up"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Subscription */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Crown className="h-4 w-4 text-warning" />
                    {t("upgradePremium", lang)}
                  </CardTitle>
                  <CardDescription>
                    {zh ? "解鎖 AI 教練、無限跑姿分析等" : "Unlock AI coach, unlimited posture analysis & more"}
                  </CardDescription>
                </div>
                {isPremium ? (
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 bg-success/15 text-success px-3 py-1 rounded-md text-xs font-semibold">
                      <Check size={12} />
                      {(() => {
                        const isLifetime =
                          expiresAt &&
                          expiresAt.getFullYear() - new Date().getFullYear() > 50;
                        if (isLifetime || plan?.includes("lifetime") || plan === "NON_RENEWING_PURCHASE")
                          return zh ? "終身" : "Lifetime";
                        if (plan === "monthly" || plan?.includes("monthly"))
                          return zh ? "月費" : "Monthly";
                        if (plan === "code_annual") return zh ? "年費（代碼）" : "Annual (Code)";
                        return zh ? "年費" : "Yearly";
                      })()}
                    </span>
                    {expiresAt &&
                      expiresAt.getFullYear() - new Date().getFullYear() <= 50 && (
                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                          <Clock size={10} />
                          {countdown}
                        </div>
                      )}
                  </div>
                ) : (
                  <Button onClick={() => setShowPlanCompare(true)}>
                    {t("upgrade", lang)}
                  </Button>
                )}
              </div>
            </CardHeader>
            {isPremium && rcEntitlement && (
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-4 rounded-lg bg-accent/40 p-4">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground tracking-wide">
                      {zh ? "權益" : "Entitlement"}
                    </div>
                    <div className="font-semibold text-sm capitalize">{rcEntitlement}</div>
                  </div>
                  {plan && (
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide">
                        {zh ? "方案" : "Plan"}
                      </div>
                      <div className="font-semibold text-sm">{plan}</div>
                    </div>
                  )}
                  {expiresAt && (
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide">
                        {zh ? "到期" : "Expires"}
                      </div>
                      <div className="font-semibold text-sm">
                        {expiresAt.toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
            {user && !isPremium && (
              <CardContent className="pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRedeemDialog(true)}
                  className="gap-2"
                >
                  <Ticket className="h-4 w-4" />
                  {zh ? "兌換優惠代碼" : "Redeem Offer Code"}
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Training references */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                {zh ? "學習資源" : "Learning Resources"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                onClick={() => setShowDefs((v) => !v)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent flex items-center justify-between text-sm"
              >
                <span className="font-medium">{t("trainingDefinitions", lang)}</span>
                <span className="text-xs text-muted-foreground">
                  {showDefs ? (zh ? "收起" : "Hide") : (zh ? "展開" : "Show")}
                </span>
              </button>
              {showDefs && (
                <div className="grid sm:grid-cols-2 gap-2 pl-2">
                  {definitions.map((d) => (
                    <div key={d.name} className="bg-accent/40 rounded-md p-3">
                      <div className="font-semibold text-sm">{zh ? d.nameZh : d.name}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed mt-1">
                        {t(d.key, lang)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => window.dispatchEvent(new Event("open-fueling-guide"))}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent flex items-center gap-2 text-sm"
              >
                <Flame className="h-4 w-4 text-orange-500" />
                <span className="font-medium">
                  {zh ? "跑者補給指南" : "Runner Fueling Guide"}
                </span>
              </button>
              <button
                onClick={() => navigate("/?tab=more")}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent flex items-center gap-2 text-sm"
              >
                <Footprints className="h-4 w-4 text-primary" />
                <span className="font-medium">
                  {zh ? "如何開始長距離跑步" : "How to Start Long Distance Running"}
                </span>
              </button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Preferences + support */}
        <div className="space-y-6">
          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{zh ? "偏好設定" : "Preferences"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Dark mode */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {darkMode ? (
                    <Moon className="h-4 w-4 text-primary" />
                  ) : (
                    <Sun className="h-4 w-4 text-primary" />
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      {zh ? "深色模式" : "Dark Mode"}
                    </div>
                  </div>
                </div>
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>

              <Separator />

              {/* Language */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="h-4 w-4 text-primary" />
                  <div className="text-sm font-medium">{t("language", lang)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={lang === "en" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLang("en")}
                  >
                    {t("english", lang)}
                  </Button>
                  <Button
                    variant={lang === "zh" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLang("zh")}
                  >
                    {t("chinese", lang)}
                  </Button>
                </div>
              </div>

              {user && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-sm font-medium">
                          {zh ? "活動推送通知" : "Activity Notifications"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {zh ? "跑步完成後接收 XP" : "Get XP notifications after runs"}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={activityNotifications}
                      disabled={notifLoading}
                      onCheckedChange={toggleActivityNotifications}
                    />
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquareOff className="h-4 w-4 text-primary" />
                  <div>
                    <div className="text-sm font-medium">
                      {zh ? "停用 AI 聊天" : "Disable AI Chat"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {zh ? "隱藏浮動聊天按鈕" : "Hide floating chat button"}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={aiChatDisabled}
                  onCheckedChange={(v) => {
                    setAiChatDisabled(v);
                    if (v) localStorage.setItem("ai_chat_disabled", "true");
                    else localStorage.removeItem("ai_chat_disabled");
                    window.dispatchEvent(new Event("ai-chat-toggle"));
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Connections */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{zh ? "連線" : "Connections"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={onNavigateConnectApps}
                className="w-full justify-start gap-2"
              >
                <Plug className="h-4 w-4" />
                {t("connectFitnessApps", lang)}
              </Button>
            </CardContent>
          </Card>

          {/* Support & legal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{zh ? "支援與法律" : "Support & Legal"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!adminLoading && isAdmin && (
                <Button
                  variant="ghost"
                  onClick={() => navigate("/admin")}
                  className="w-full justify-start gap-2"
                >
                  <Shield className="h-4 w-4 text-primary" />
                  {zh ? "管理員" : "Admin Panel"}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => navigate("/support")}
                className="w-full justify-start gap-2"
              >
                <LifeBuoy className="h-4 w-4" />
                {zh ? "支援與幫助" : "Support"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate("/privacy")}
                className="w-full justify-start gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                {zh ? "隱私權政策" : "Privacy Policy"}
              </Button>
            </CardContent>
          </Card>

          {/* Danger zone */}
          {user && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">
                  {zh ? "帳號操作" : "Account actions"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="w-full justify-start gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {zh ? "登出" : "Sign Out"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(true)}
                  className="w-full justify-start gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {zh ? "刪除帳號" : "Delete Account"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <PlanComparisonDialog
        open={showPlanCompare}
        onOpenChange={setShowPlanCompare}
        lang={lang}
      />

      <Dialog
        open={showRedeemDialog}
        onOpenChange={(o) => {
          setShowRedeemDialog(o);
          if (!o) setOfferCode("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              {zh ? "輸入優惠代碼" : "Enter Offer Code"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={offerCode}
            onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
            placeholder={zh ? "輸入代碼" : "Enter code"}
            className="text-center tracking-widest font-mono"
            autoFocus
          />
          <Button
            disabled={!offerCode.trim()}
            onClick={() => {
              redeemOfferCode(offerCode.trim(), lang);
              setShowRedeemDialog(false);
              setOfferCode("");
            }}
          >
            {zh ? "兌換" : "Redeem"}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(o) => !deleting && setShowDeleteDialog(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              {zh ? "刪除帳號" : "Delete Account"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {zh
                ? "此操作將永久刪除您的帳號、活動、訓練計劃及所有相關資料。此操作無法復原。"
                : "This will permanently delete your account, activities, training plans and all related data. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {zh ? "取消" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? zh
                  ? "刪除中..."
                  : "Deleting..."
                : zh
                ? "永久刪除"
                : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
