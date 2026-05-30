import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Lang } from "@/lib/i18n";
import { Loader2, Mail, Lock, LayoutDashboard } from "lucide-react";

interface Props {
  lang: Lang;
  onSuccess: () => void;
  onGuest: () => void;
  onClose: () => void;
}

const tr = (zh: boolean, en: string, z: string) => (zh ? z : en);

export default function DashboardAuth({ lang, onSuccess, onGuest, onClose }: Props) {
  const zh = lang === "zh";
  const { toast } = useToast();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");

  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: siEmail.trim(),
      password: siPassword,
    });
    setBusy(false);
    if (error) {
      toast({ title: tr(zh, "Sign in failed", "登入失敗"), description: error.message, variant: "destructive" });
      return;
    }
    onSuccess();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (suPassword.length < 6) {
      toast({ title: tr(zh, "Password too short", "密碼太短"), description: tr(zh, "Min 6 characters", "最少 6 個字元"), variant: "destructive" });
      return;
    }
    if (suPassword !== suConfirm) {
      toast({ title: tr(zh, "Passwords do not match", "密碼不一致"), variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: suEmail.trim(),
      password: suPassword,
      options: { emailRedirectTo: window.location.origin + "/dashboard" },
    });
    setBusy(false);
    if (error) {
      toast({ title: tr(zh, "Sign up failed", "註冊失敗"), description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: tr(zh, "Check your inbox", "請檢查信箱"),
      description: tr(zh, "We sent you a confirmation email.", "我們已寄出確認郵件。"),
    });
  };

  const oauth = async (provider: "google" | "apple") => {
    if (provider === "google") {
      const { startDespiaOAuth } = await import("@/lib/despiaOAuth");
      if (startDespiaOAuth("google")) return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + "/dashboard" },
    });
    if (error) {
      toast({ title: tr(zh, "Sign in failed", "登入失敗"), description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Left brand panel */}
        <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/15 via-primary/5 to-background border-r border-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <span className="font-display font-bold text-lg">Runward Dashboard</span>
          </div>

          <div className="space-y-6 max-w-md">
            <h1 className="text-4xl xl:text-5xl font-display font-bold leading-tight tracking-tight">
              {tr(zh, "Train smarter on the big screen.", "在大螢幕上更聰明地訓練。")}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {tr(
                zh,
                "A desktop control center for your runs — sync activities, review training load, and plan the next race in one place.",
                "您跑步的桌面控制中心 — 同步活動、檢視訓練負荷，並在同一位置規劃下一場比賽。"
              )}
            </p>
            <ul className="space-y-3 text-sm">
              {[
                tr(zh, "Multi-column analytics & training load", "多欄分析與訓練負荷"),
                tr(zh, "Calendar-first activity browser", "以日曆為主的活動瀏覽"),
                tr(zh, "Connect Garmin, Strava, Apple Health & more", "連接 Garmin、Strava、Apple Health 等"),
              ].map((it) => (
                <li key={it} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Runward
          </p>
        </div>

        {/* Right form panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-6 lg:px-12 py-4 border-b border-border">
            <span className="lg:hidden font-display font-semibold text-sm">Runward Dashboard</span>
            <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
              {tr(zh, "Close", "關閉")}
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center px-6 lg:px-12 py-10">
            <div className="w-full max-w-md space-y-6">
              <div>
                <h2 className="text-2xl font-display font-bold tracking-tight">
                  {tab === "signin"
                    ? tr(zh, "Welcome back", "歡迎回來")
                    : tr(zh, "Create your account", "建立您的帳號")}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {tab === "signin"
                    ? tr(zh, "Sign in to access your desktop dashboard.", "登入以使用您的桌面控制台。")
                    : tr(zh, "Get started in seconds — it's free.", "幾秒內開始 — 完全免費。")}
                </p>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="signin">{tr(zh, "Sign In", "登入")}</TabsTrigger>
                  <TabsTrigger value="signup">{tr(zh, "Register", "註冊")}</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-6">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="si-email">{tr(zh, "Email", "電郵")}</Label>
                      <div className="relative">
                        <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="si-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={siEmail}
                          onChange={(e) => setSiEmail(e.target.value)}
                          className="pl-9"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="si-password">{tr(zh, "Password", "密碼")}</Label>
                      <div className="relative">
                        <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="si-password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={siPassword}
                          onChange={(e) => setSiPassword(e.target.value)}
                          className="pl-9"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {tr(zh, "Sign In", "登入")}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-6">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="su-email">{tr(zh, "Email", "電郵")}</Label>
                      <div className="relative">
                        <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="su-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={suEmail}
                          onChange={(e) => setSuEmail(e.target.value)}
                          className="pl-9"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="su-password">{tr(zh, "Password", "密碼")}</Label>
                        <Input
                          id="su-password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={suPassword}
                          onChange={(e) => setSuPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="su-confirm">{tr(zh, "Confirm", "確認")}</Label>
                        <Input
                          id="su-confirm"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={suConfirm}
                          onChange={(e) => setSuConfirm(e.target.value)}
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {tr(zh, "Create Account", "建立帳號")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground tracking-wider">
                    {tr(zh, "or continue with", "或使用")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" type="button" onClick={() => oauth("google")}>
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.44.36-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.29 9.14 5.38 12 5.38z"/>
                  </svg>
                  Google
                </Button>
                <Button variant="outline" type="button" onClick={() => oauth("apple")}>
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </Button>
              </div>

              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                type="button"
                onClick={onGuest}
              >
                {tr(zh, "Continue as guest", "以訪客繼續")}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                {tr(
                  zh,
                  "By continuing you agree to our Terms and Privacy Policy.",
                  "繼續即表示您同意我們的條款與隱私政策。"
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
