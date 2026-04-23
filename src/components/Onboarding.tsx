import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Mail,
  Eye,
  EyeOff,
  Ticket,
  ShieldCheck,
  User,
  UserCircle2,
  Cake,
  CalendarDays,
  Timer,
  Lock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Lang, t } from "@/lib/i18n";
import { calculateRunningScore, predictTime, formatTime } from "@/lib/vdot";
import gingrunLogo from "@/assets/gingrun-logo.png";
import onboardingBg from "@/assets/onboarding-bg.jpg";
import badge5k from "@/assets/badge-5k.png";
import badge10k from "@/assets/badge-10k.png";
import badge21k from "@/assets/badge-21k.png";
import badge42k from "@/assets/badge-42k.png";

const DISTANCE_BADGES: Record<string, string> = {
  "5K": badge5k,
  "10K": badge10k,
  "Half Marathon": badge21k,
  "Full Marathon": badge42k,
};

const EST_DISTANCES = [
  { label: "5K", labelZh: "5公里", meters: 5000 },
  { label: "10K", labelZh: "10公里", meters: 10000 },
  { label: "Half Marathon", labelZh: "半馬拉松", meters: 21097.5 },
  { label: "Full Marathon", labelZh: "全馬拉松", meters: 42195 },
];

const ALL_RACE_DISTS = [
  { label: "5K", labelZh: "5K", meters: 5000, badge: badge5k },
  { label: "10K", labelZh: "10K", meters: 10000, badge: badge10k },
  { label: "21.1K", labelZh: "21.1K", meters: 21097.5, badge: badge21k },
  { label: "42.2K", labelZh: "42.2K", meters: 42195, badge: badge42k },
];

const ONBOARDING_SIGNUP_IN_PROGRESS_KEY = "onboarding_signup_in_progress";

// World record times in total seconds
const WORLD_RECORDS: Record<string, { seconds: number; holder: string; holderZh: string }> = {
  "5K": { seconds: 12 * 60 + 35, holder: "Berihu Aregawi (Ethiopia), 12:35", holderZh: "Berihu Aregawi（埃塞俄比亞），12:35" },
  "10K": { seconds: 26 * 60 + 24, holder: "Rhonex Kipruto (Kenya), 26:24", holderZh: "Rhonex Kipruto（肯尼亞），26:24" },
  "Half Marathon": { seconds: 57 * 60 + 31, holder: "Kibiwott Kandie (Kenya), 57:31", holderZh: "Kibiwott Kandie（肯尼亞），57:31" },
  "Full Marathon": { seconds: 2 * 3600 + 0 * 60 + 35, holder: "Kelvin Kiptum (Kenya), 2:00:35", holderZh: "Kelvin Kiptum（肯尼亞），2:00:35" },
};

const sexLabels = (lang: Lang) => ({
  male: t("onboardingMale", lang),
  female: t("onboardingFemale", lang),
  other: t("onboardingOther", lang),
});

function getImprovementPct(score: number): number {
  if (score >= 60) return 0.04;   // Advanced: 3-5%
  if (score >= 45) return 0.065;  // Intermediate: 5-8%
  return 0.10;                    // Beginner: 8-12%
}

// Steps: 0=first-time?, 1=name, 2=welcome-anim, 3=gender, 4=age, 5=run-freq,
//        6=estimated-time, 7=before-after, 8=email, 9=password, 10=want-plan
type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Welcome-only background: hero photo, darkened to 80%, with bottom gradient.
 * Used exclusively on Step 0.
 */
const WelcomeBgWrapper = ({ children }: { children: ReactNode }) => (
  <div className="dark relative min-h-screen flex flex-col bg-background">
    <img
      src={onboardingBg}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      width={896}
      height={1920}
    />
    <div className="absolute inset-0 bg-background/80" />
    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/60 to-transparent" />
    <div className="relative z-10 flex flex-col min-h-screen">{children}</div>
  </div>
);

/**
 * Solid dark surface for all data-entry steps.
 */
const SolidBgWrapper = ({ children }: { children: ReactNode }) => (
  <div className="dark min-h-screen flex flex-col bg-background text-foreground">
    {children}
  </div>
);

/**
 * Single thin (2px) progress line at the top, fills left-to-right with --primary.
 */
const ProgressLine = ({ current, total }: { current: number; total: number }) => {
  const pct = Math.max(0, Math.min(100, ((current + 1) / total) * 100));
  return (
    <div className="h-[2px] w-full bg-border/40">
      <div
        className="h-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

/**
 * Reusable header for data steps: small monochrome icon + display headline + optional helper.
 */
const StepHeader = ({
  icon: Icon,
  title,
  helper,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  helper?: string;
}) => (
  <div className="space-y-3">
    <Icon size={24} className="text-muted-foreground" />
    <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-foreground">
      {title}
    </h2>
    {helper && <p className="text-sm text-muted-foreground">{helper}</p>}
  </div>
);

/**
 * Underline-style input class: borderless, single bottom border, primary on focus.
 */
const underlineInput =
  "h-14 rounded-none border-0 border-b border-border/50 bg-transparent px-0 text-lg font-medium placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary transition-colors";

const Onboarding = ({
  onComplete,
  onGuest,
  lang,
  setLang,
}: {
  onComplete: () => void;
  onGuest: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { launchPaywall, redeemOfferCode } = useDespiaPurchases();
  const [step, setStep] = useState<OnboardingStep>(() => {
    if (sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true") return 11;
    if (localStorage.getItem("onboarding_show_plan_prompt") === "true") return 10;
    return 0;
  });
  const [isSignInMode, setIsSignInMode] = useState(false);
  const [switchingLang, setSwitchingLang] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAccountCreationInFlight, setIsAccountCreationInFlight] = useState(
    () => sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true"
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [onboardingUserId, setOnboardingUserId] = useState<string | null>(user?.id ?? null);

  // Form data
  const [displayName, setDisplayName] = useState("");
  const [sex, setSex] = useState("");
  const [age, setAge] = useState("");
  const [runsPerWeek, setRunsPerWeek] = useState<number | null>(null);
  const [estDistance, setEstDistance] = useState("");
  const [estHours, setEstHours] = useState("");
  const [estMinutes, setEstMinutes] = useState("");
  const [estSeconds, setEstSeconds] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Welcome animation state
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // Before/After expanded
  const [showAllRaces, setShowAllRaces] = useState(false);

  // Redemption code in plan prompt
  const [showRedeemInput, setShowRedeemInput] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");

  // Sign-in mode fields
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState<"idle" | "email" | "code" | "newpass">("idle");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");

  // Loading microcopy rotation (Step 11)
  const loadingPhrases = lang === "zh"
    ? ["校準配速區間…", "讀取你的 VDOT…", "整理訓練計劃…", "差不多好了…"]
    : ["Calibrating pace zones…", "Reading your VDOT…", "Shaping your plan…", "Almost there…"];
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
  useEffect(() => {
    if (step !== 11) return;
    const id = setInterval(() => {
      setLoadingPhraseIdx((i) => (i + 1) % loadingPhrases.length);
    }, 1800);
    return () => clearInterval(id);
  }, [step, loadingPhrases.length]);

  // Persist onboarding "ideal time" so the suggested-workout feature can fall back to it
  useEffect(() => {
    if (!estDistance) return;
    const seconds =
      (parseInt(estHours) || 0) * 3600 +
      (parseInt(estMinutes) || 0) * 60 +
      (parseInt(estSeconds) || 0);
    if (seconds <= 0) return;
    try {
      localStorage.setItem(
        "onboarding_ideal_time",
        JSON.stringify({ distance: estDistance, seconds }),
      );
    } catch {
      // ignore quota errors
    }
  }, [estDistance, estHours, estMinutes, estSeconds]);

  const setSignupInProgress = (active: boolean) => {
    if (active) {
      sessionStorage.setItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY, "true");
    } else {
      sessionStorage.removeItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY);
    }
  };

  // Welcome animation trigger
  useEffect(() => {
    if (step === 2) {
      setWelcomeVisible(false);
      const timer = setTimeout(() => setWelcomeVisible(true), 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Auto-advance welcome step after animation
  useEffect(() => {
    if (step === 2 && welcomeVisible) {
      const timer = setTimeout(() => setStep(3), 2500);
      return () => clearTimeout(timer);
    }
  }, [step, welcomeVisible]);

  const saveOnboardingDataToStorage = () => {
    const onboardingData = { displayName, sex, age, runsPerWeek, estDistance, estHours, estMinutes, estSeconds };
    localStorage.setItem("pending_onboarding_data", JSON.stringify(onboardingData));
    localStorage.setItem("onboarding_show_plan_prompt", "true");
  };

  useEffect(() => {
    if (user?.id) {
      setOnboardingUserId(user.id);
    }
  }, [user?.id]);

  // When account creation finishes and user is available, advance to step 10
  useEffect(() => {
    if (!user || step !== 11 || !isAccountCreationInFlight) return;

    let cancelled = false;

    const advanceToPlanPrompt = async () => {
      try {
        await new Promise((r) => setTimeout(r, 500));
        if (cancelled) return;

        await supabase.from("profiles").update({
          display_name: displayName || null,
          age: age ? parseInt(age) : null,
          sex: sex || null,
          runs_per_week: runsPerWeek,
          onboarding_completed: false,
        }).eq("user_id", user.id);

        if (!cancelled) {
          setStep(10);
        }
      } finally {
        if (!cancelled) {
          setSaving(false);
          setIsAccountCreationInFlight(false);
        }
      }
    };

    void advanceToPlanPrompt();

    return () => {
      cancelled = true;
    };
  }, [user, step, isAccountCreationInFlight, displayName, age, sex, runsPerWeek]);

  useEffect(() => {
    if (user && !isSignInMode) {
      const signupInProgress = sessionStorage.getItem(ONBOARDING_SIGNUP_IN_PROGRESS_KEY) === "true";
      // If on step 12 (email verification) and user just confirmed, advance to profile save flow
      if (step === 12) {
        setOnboardingUserId(user.id);
        setSignupInProgress(true);
        setIsAccountCreationInFlight(true);
        setStep(11);
        return;
      }
      if (signupInProgress || isAccountCreationInFlight || (step >= 8 && step <= 11) || !!onboardingUserId) return;

      if (localStorage.getItem("onboarding_show_plan_prompt") === "true") {
        setStep(10);
        const pendingData = localStorage.getItem("pending_onboarding_data");
        if (pendingData) {
          const parsed = JSON.parse(pendingData);
          localStorage.removeItem("pending_onboarding_data");
          (async () => {
            await new Promise((r) => setTimeout(r, 500));
            await supabase.from("profiles").update({
              display_name: parsed.displayName || null,
              age: parsed.age ? parseInt(parsed.age) : null,
              sex: parsed.sex || null,
              runs_per_week: parsed.runsPerWeek,
              onboarding_completed: false,
            }).eq("user_id", user.id);
          })();
        }
        return;
      }
      if (step === 0) {
        supabase.from("profiles").select("onboarding_completed").eq("user_id", user.id).single()
          .then(({ data }) => {
            if (data?.onboarding_completed) {
              onComplete();
            } else {
              setStep(1);
            }
          });
      }
    }
  }, [user, isSignInMode, isAccountCreationInFlight, onboardingUserId, step, onComplete]);

  const handleSignIn = async () => {
    setSaving(true);
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: signInPassword,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    if (authData.user) {
      onComplete();
    }
    setSaving(false);
  };

  const handleAppleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      console.error("[AppleSignIn] Error:", error);
      toast({ title: "Apple Sign-In failed", description: error.message, variant: "destructive" });
    }
  };

  const handleAppleSignUp = () => {
    saveOnboardingDataToStorage();
    handleAppleSignIn();
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleGoogleSignUp = () => {
    saveOnboardingDataToStorage();
    handleGoogleSignIn();
  };

  const handleCreateAccount = async () => {
    if (password.length < 6) {
      toast({ title: "Error", description: t("passwordMinLength", lang), variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Error", description: t("passwordsDoNotMatch", lang), variant: "destructive" });
      return;
    }

    setSaving(true);
    setSignupInProgress(true);
    setIsAccountCreationInFlight(true);
    setStep(11); // Show "creating account" loading screen immediately

    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSignupInProgress(false);
      setSaving(false);
      setIsAccountCreationInFlight(false);
      setStep(9);
      return;
    }

    // If email confirmation is required, session will be null
    if (authData.user && !authData.session) {
      setSignupInProgress(false);
      setSaving(false);
      setIsAccountCreationInFlight(false);
      setOnboardingUserId(authData.user.id);
      localStorage.setItem("onboarding_show_plan_prompt", "true");
      saveOnboardingDataToStorage();
      setStep(12); // Show "check your email" screen
      return;
    }

    if (authData.user) {
      setOnboardingUserId(authData.user.id);
      localStorage.setItem("onboarding_show_plan_prompt", "true");
      // The useEffect watching user+step===11 will handle profile save and advance to step 10
    }
  };

  const finalizeOnboarding = async (launchPlanPaywall = false) => {
    setSignupInProgress(false);
    localStorage.removeItem("onboarding_show_plan_prompt");
    const targetUserId = onboardingUserId ?? user?.id;

    if (targetUserId) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", targetUserId);
    }

    if (launchPlanPaywall) {
      const locale = lang === "zh" ? "zh_Hant" : "en";
      launchPaywall("default", locale);
    }

    onComplete();
  };

  // Compute estimated race times for Before/After
  const getEstimatedTimes = () => {
    const dist = EST_DISTANCES.find((d) => d.label === estDistance);
    if (!dist) return null;
    const totalSeconds = (parseInt(estHours) || 0) * 3600 + (parseInt(estMinutes) || 0) * 60 + (parseInt(estSeconds) || 0);
    if (totalSeconds <= 0) return null;

    const score = calculateRunningScore(dist.meters, totalSeconds);
    if (!score || !isFinite(score) || score <= 0) return null;

    const improvePct = getImprovementPct(score);

    return ALL_RACE_DISTS.map((race) => {
      const currentTime = predictTime(score, race.meters);
      const improvedScore = score * (1 + improvePct);
      const improvedTime = predictTime(improvedScore, race.meters);
      const diff = currentTime - improvedTime;
      return {
        ...race,
        currentTime,
        improvedTime,
        diff,
        isChosen: race.meters === dist.meters,
      };
    });
  };

  const handleForgotPasswordSendCode = async () => {
    if (!resetEmail) return;
    setSaving(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setForgotPasswordMode("code");
  };

  const handleResetPasswordVerify = async () => {
    if (resetNewPassword.length < 6) {
      toast({ title: "Error", description: t("passwordMinLength", lang), variant: "destructive" });
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast({ title: "Error", description: t("passwordsDoNotMatch", lang), variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: resetEmail,
      token: resetOtp,
      type: "recovery",
    });
    if (otpError) {
      toast({ title: "Error", description: otpError.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: resetNewPassword });
    setSaving(false);
    if (updateError) {
      toast({ title: "Error", description: updateError.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅", description: t("resetPasswordSuccess", lang) });
    await supabase.auth.signOut();
    setForgotPasswordMode("idle");
    setResetEmail("");
    setResetOtp("");
    setResetNewPassword("");
    setResetConfirmPassword("");
  };

  const labels = sexLabels(lang);

  // Password strength: 0-3 (length + character variety)
  const passwordStrength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    return Math.min(3, score);
  })();

  // ---- LANGUAGE SWITCHER (shared) ----
  const LangSwitcher = () => (
    <div className="flex gap-1.5 mb-10">
      <button
        onClick={() => { if (lang !== "en") { setSwitchingLang(true); setLang("en"); setTimeout(() => setSwitchingLang(false), 4000); } }}
        className={`flex-1 py-2 rounded-md text-xs font-medium tracking-wide uppercase transition-colors ${lang === "en" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground border border-border/50 hover:text-foreground"}`}
      >English</button>
      <button
        onClick={() => { if (lang !== "zh") { setSwitchingLang(true); setLang("zh"); setTimeout(() => setSwitchingLang(false), 4000); } }}
        className={`flex-1 py-2 rounded-md text-xs font-medium tracking-wide uppercase transition-colors ${lang === "zh" ? "bg-foreground text-background" : "bg-transparent text-muted-foreground border border-border/50 hover:text-foreground"}`}
      >中文 (HK)</button>
    </div>
  );

  // ---- SIGN IN MODE ----
  if (isSignInMode) {
    // Forgot password sub-flow
    if (forgotPasswordMode !== "idle") {
      return (
        <SolidBgWrapper>
          <div className="flex-1 flex flex-col px-6 pt-16 pb-8 max-w-md mx-auto w-full">
            <div className="mb-10">
              <img src={gingrunLogo} alt="RunWard" width={56} height={56} className="mb-6" />
              <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-foreground">
                {t("resetPassword", lang)}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                {forgotPasswordMode === "email" && t("resetPasswordDesc", lang)}
                {forgotPasswordMode === "code" && t("resetCodeSent", lang)}
                {forgotPasswordMode === "newpass" && t("enterResetCode", lang)}
              </p>
            </div>

            <div className="space-y-5">
              {forgotPasswordMode === "email" && (
                <>
                  <Input
                    type="email"
                    placeholder={t("email", lang)}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={underlineInput}
                  />
                  <Button
                    onClick={handleForgotPasswordSendCode}
                    disabled={saving || !resetEmail}
                    className="w-full h-12 rounded-lg"
                  >
                    {saving ? t("onboardingSaving", lang) : t("sendResetCode", lang)}
                  </Button>
                </>
              )}

              {forgotPasswordMode === "code" && (
                <>
                  <div className="flex justify-center py-2">
                    <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp}>
                      <InputOTPGroup className="gap-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className="h-12 w-10 rounded-md border border-border/50 bg-transparent text-foreground text-lg first:rounded-l-md last:rounded-r-md"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button
                    onClick={() => setForgotPasswordMode("newpass")}
                    disabled={resetOtp.length !== 6}
                    className="w-full h-12 rounded-lg"
                  >
                    {t("onboardingNext", lang)}
                  </Button>
                  <button
                    onClick={handleForgotPasswordSendCode}
                    className="text-muted-foreground text-sm hover:text-foreground transition-colors w-full text-center"
                  >
                    {lang === "zh" ? "重新發送驗證碼" : "Resend code"}
                  </button>
                </>
              )}

              {forgotPasswordMode === "newpass" && (
                <>
                  <Input
                    type="password"
                    placeholder={t("newPassword", lang)}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className={underlineInput}
                  />
                  <Input
                    type="password"
                    placeholder={t("confirmNewPassword", lang)}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    className={underlineInput}
                  />
                  <Button
                    onClick={handleResetPasswordVerify}
                    disabled={saving || resetNewPassword.length < 6}
                    className="w-full h-12 rounded-lg"
                  >
                    {saving ? t("onboardingSaving", lang) : t("resetPassword", lang)}
                  </Button>
                </>
              )}
            </div>

            <div className="mt-8">
              <button
                onClick={() => {
                  setForgotPasswordMode("idle");
                  setResetOtp("");
                  setResetNewPassword("");
                  setResetConfirmPassword("");
                }}
                className="text-muted-foreground text-sm hover:text-foreground transition-colors inline-flex items-center"
              >
                <ChevronLeft size={14} className="mr-1" />
                {t("onboardingBack", lang)}
              </button>
            </div>
          </div>
        </SolidBgWrapper>
      );
    }

    return (
      <SolidBgWrapper>
        <div className="flex-1 flex flex-col px-6 pt-16 pb-8 max-w-md mx-auto w-full">
          <LangSwitcher />

          {switchingLang && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90">
              <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">{lang === "zh" ? "切換語言中..." : "Switching language..."}</p>
            </div>
          )}

          <div className="mb-8">
            <img src={gingrunLogo} alt="RunWard" width={56} height={56} className="mb-6" />
            <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-foreground">
              {t("onboardingWelcomeBack", lang)}
            </h1>
            <p className="text-muted-foreground text-sm mt-2">{t("onboardingSignInDesc", lang)}</p>
          </div>

          {/* Migration notice */}
          <div className="mb-6 p-3 rounded-md border border-warning/30 bg-warning/5">
            <p className="text-warning text-xs leading-relaxed">
              {lang === "zh"
                ? "我們已遷移至新伺服器。如果你是現有用戶，請使用「忘記密碼」重設密碼，或重新註冊帳號。"
                : "We've migrated to a new server. If you're a returning user, please use \"Forgot Password\" to reset your password, or re-register your account."}
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleAppleSignIn}
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background h-12 rounded-lg font-medium text-sm transition-opacity hover:opacity-90"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              {t("signInWithApple", lang)}
            </button>

            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2 bg-transparent text-foreground border border-border/50 h-12 rounded-lg font-medium text-sm transition-colors hover:bg-accent"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {lang === "zh" ? "使用 Google 登入" : "Sign in with Google"}
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("orContinueWith", lang)}</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            <Input
              type="email"
              placeholder={t("email", lang)}
              value={signInEmail}
              onChange={(e) => setSignInEmail(e.target.value)}
              className={underlineInput}
            />
            <Input
              type="password"
              placeholder={t("password", lang)}
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              className={underlineInput}
            />

            <div className="text-right pt-1">
              <button
                onClick={() => {
                  setForgotPasswordMode("email");
                  setResetEmail(signInEmail);
                }}
                className="text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                {t("forgotPassword", lang)}
              </button>
            </div>

            <Button
              onClick={handleSignIn}
              disabled={saving || !signInEmail || !signInPassword}
              className="w-full h-12 rounded-lg mt-2"
            >
              <Mail size={16} />
              {saving ? t("onboardingSaving", lang) : t("signIn", lang)}
            </Button>
          </div>

          <div className="mt-8">
            <button
              onClick={() => setIsSignInMode(false)}
              className="text-muted-foreground text-sm hover:text-foreground transition-colors inline-flex items-center"
            >
              <ChevronLeft size={14} className="mr-1" />
              {t("onboardingBack", lang)}
            </button>
          </div>

          <div className="mt-auto pt-8">
            <p className="text-center text-xs text-muted-foreground/80">
              {lang === "zh" ? "登入即表示您同意我們的" : "By signing in, you agree to our "}
              <a href="/privacy" className="text-foreground/80 underline">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</a>
              {lang === "zh" ? "及" : " and "}
              <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-foreground/80 underline">
                {lang === "zh" ? "使用條款" : "Terms of Use"}
              </a>
            </p>
          </div>
        </div>
      </SolidBgWrapper>
    );
  }

  // ---- STEP 0: Welcome (hero photo) ----
  if (step === 0) {
    return (
      <WelcomeBgWrapper>
        <div className="flex-1 flex flex-col px-6 pt-16 pb-10 max-w-md mx-auto w-full">
          <LangSwitcher />

          {switchingLang && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90">
              <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">{lang === "zh" ? "切換語言中..." : "Switching language..."}</p>
            </div>
          )}

          <div className="flex-1 flex flex-col justify-end">
            <img src={gingrunLogo} alt="RunWard" width={64} height={64} className="mb-8" />
            <h1 className="font-display text-[44px] leading-[1.05] font-semibold tracking-tight text-foreground mb-4">
              {lang === "zh" ? "用心而跑。" : "Run with intention."}
            </h1>
            <p className="text-muted-foreground text-base mb-10 max-w-sm">
              {lang === "zh"
                ? "由 AI 教練、跑姿分析與真實訓練數據驅動。"
                : "AI coaching, posture analysis and real training data."}
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => setStep(1)}
                className="w-full h-12 rounded-lg text-base font-medium"
              >
                {lang === "zh" ? "開始" : "Get started"}
                <ArrowRight size={16} />
              </Button>
              <Button
                onClick={() => setIsSignInMode(true)}
                variant="outline"
                className="w-full h-12 rounded-lg border-border/50 bg-transparent text-foreground text-base font-medium hover:bg-accent"
              >
                {lang === "zh" ? "我已有帳號" : "I have an account"}
              </Button>
              <button
                onClick={onGuest}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                {t("continueAsGuest", lang)}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground/80 mt-8">
            {lang === "zh" ? "繼續即表示您同意我們的" : "By continuing, you agree to our "}
            <a href="/privacy" className="text-foreground/80 underline">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</a>
            {lang === "zh" ? "及" : " and "}
            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-foreground/80 underline">
              {lang === "zh" ? "使用條款" : "Terms of Use"}
            </a>
          </p>
        </div>
      </WelcomeBgWrapper>
    );
  }

  // ---- STEPS 1-12: Signup flow ----
  const goBack = () => {
    if (step === 1) setStep(0);
    else if (step === 3) setStep(1); // skip welcome anim going back
    else setStep((step - 1) as OnboardingStep);
  };

  const goNext = () => {
    if (step === 1) {
      setStep(2); // go to welcome animation
    } else if (step === 9) {
      handleCreateAccount();
    } else if (step < 10) {
      setStep((step + 1) as OnboardingStep);
    }
  };

  const getEnteredSeconds = () => {
    return (parseInt(estHours) || 0) * 3600 + (parseInt(estMinutes) || 0) * 60 + (parseInt(estSeconds) || 0);
  };

  const isFasterThanWorldRecord = () => {
    if (!estDistance) return false;
    const wr = WORLD_RECORDS[estDistance];
    if (!wr) return false;
    const entered = getEnteredSeconds();
    return entered > 0 && entered < wr.seconds;
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!displayName.trim();
      case 3: return !!sex;
      case 4: return !!age && parseInt(age) >= 10 && parseInt(age) <= 100;
      case 5: return runsPerWeek !== null;
      case 6: return !!estDistance && getEnteredSeconds() > 0 && !isFasterThanWorldRecord();
      case 7: return true;
      case 8: return !!email && email.includes("@");
      case 9: return password.length >= 6 && password === confirmPassword;
      default: return true;
    }
  };

  const estimatedTimes = getEstimatedTimes();
  const chosenDist = EST_DISTANCES.find((d) => d.label === estDistance);
  const chosenRaceForHeader = estimatedTimes?.find((r) => r.isChosen);

  const signupPanels = (
    <>
      {/* Step 1: Name */}
      <div hidden={step !== 1} className="space-y-8">
        <StepHeader
          icon={User}
          title={lang === "zh" ? "你叫什麼名字？" : "What's your name?"}
          helper={lang === "zh" ? "我們會用它來個人化你的計劃。" : "We'll use this to personalize your plan."}
        />
        <Input
          type="text"
          placeholder={lang === "zh" ? "輸入你的名字" : "Your name"}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoFocus={step === 1}
          className={underlineInput}
        />
      </div>

      {/* Step 2: Welcome Animation */}
      <div hidden={step !== 2} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[320px]">
          <div
            className={`transition-all duration-1000 ease-out ${
              welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground text-center mb-6">
              {lang === "zh" ? "歡迎" : "Welcome"}
            </p>
          </div>
          <div
            className={`transition-all duration-1000 ease-out delay-500 ${
              welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground text-center">
              {displayName}
            </h1>
          </div>
          <div
            className={`transition-all duration-1000 ease-out delay-1000 ${
              welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-sm text-muted-foreground text-center mt-6">
              {lang === "zh" ? "讓我們開始設定你的個人檔案" : "Let's set up your profile"}
            </p>
          </div>
        </div>
      </div>

      {/* Step 3: Gender */}
      <div hidden={step !== 3} className="space-y-8">
        <StepHeader icon={UserCircle2} title={t("onboardingGender", lang)} />
        <div className="space-y-2">
          {(["male", "female", "other"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSex(s)}
              className={`w-full text-left px-5 h-14 rounded-lg border transition-colors ${
                sex === s
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/50 bg-transparent text-foreground hover:border-border"
              }`}
            >
              <span className="text-base font-medium">{labels[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 4: Age */}
      <div hidden={step !== 4} className="space-y-8">
        <StepHeader
          icon={Cake}
          title={t("onboardingAgeQuestion", lang)}
          helper={lang === "zh" ? "用於校準訓練強度。" : "Used to calibrate training intensity."}
        />
        <Input
          type="number"
          placeholder={t("onboardingAge", lang)}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          min={10}
          max={100}
          autoFocus={step === 4}
          className={underlineInput}
        />
      </div>

      {/* Step 5: Run frequency */}
      <div hidden={step !== 5} className="space-y-8">
        <StepHeader
          icon={CalendarDays}
          title={t("onboardingRunFreqQuestion", lang)}
          helper={t("onboardingDaysPerWeek", lang)}
        />
        <div className="grid grid-cols-8 gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              onClick={() => setRunsPerWeek(n)}
              className={`h-12 rounded-md text-base font-semibold transition-colors border ${
                runsPerWeek === n
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-foreground border-border/50 hover:border-border"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Step 6: Estimated Race Time */}
      <div hidden={step !== 6} className="space-y-8">
        <StepHeader
          icon={Timer}
          title={lang === "zh" ? "輸入你的預估比賽時間" : "Your estimated race time"}
          helper={
            lang === "zh"
              ? "這是你認為如果現在比賽可以跑出的時間。"
              : "What you think you could run if you raced today."
          }
        />
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">{t("distance", lang)}</label>
          <div className="grid grid-cols-2 gap-2">
            {EST_DISTANCES.map((d) => (
              <button
                key={d.label}
                onClick={() => setEstDistance(d.label)}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors border ${
                  estDistance === d.label
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-transparent hover:border-border"
                }`}
              >
                <img src={DISTANCE_BADGES[d.label]} alt={d.label} className="w-10 h-10 object-contain" />
                <span className="font-display text-base font-semibold text-foreground">{lang === "zh" ? d.labelZh : d.label}</span>
              </button>
            ))}
          </div>
        </div>
        {estDistance && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">{t("time", lang)}</label>
            <div className="flex items-center gap-2">
              <Input placeholder="HH" type="number" min={0} value={estHours} onChange={(e) => setEstHours(e.target.value)} className={`${underlineInput} text-center font-mono tabular-nums`} />
              <span className="text-2xl font-mono text-muted-foreground">:</span>
              <Input placeholder="MM" type="number" min={0} max={59} value={estMinutes} onChange={(e) => setEstMinutes(e.target.value)} className={`${underlineInput} text-center font-mono tabular-nums`} />
              <span className="text-2xl font-mono text-muted-foreground">:</span>
              <Input placeholder="SS" type="number" min={0} max={59} value={estSeconds} onChange={(e) => setEstSeconds(e.target.value)} className={`${underlineInput} text-center font-mono tabular-nums`} />
            </div>
            {isFasterThanWorldRecord() && (
              <p className="text-warning text-sm mt-3">
                {lang === "zh"
                  ? "這個時間比目前世界紀錄還快。"
                  : "That's faster than the current world record."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Step 7: Before/After Comparison */}
      <div hidden={step !== 7} className="space-y-5">
        {estimatedTimes && chosenRaceForHeader ? (
          <>
            {/* Header card with primary left bar */}
            <div className="relative rounded-lg border border-border/50 bg-card overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              <div className="p-5 pl-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  {lang === "zh"
                    ? `預估 ${chosenDist?.labelZh || ""} 時間`
                    : `Projected ${chosenDist?.label || ""} time`}
                </p>
                <div className="flex items-center gap-3">
                  <img src={chosenRaceForHeader.badge} alt={chosenRaceForHeader.label} className="w-10 h-10 object-contain" />
                  <span className="font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                    {formatTime(chosenRaceForHeader.improvedTime)} – {formatTime(chosenRaceForHeader.currentTime)}
                  </span>
                </div>
              </div>
            </div>

            {/* Column headers */}
            <div className="flex justify-between px-1 text-xs text-muted-foreground uppercase tracking-wider">
              <span>{lang === "zh" ? "目前" : "Today"}</span>
              <span>{lang === "zh" ? "12 週後" : "In 12 weeks"}</span>
            </div>

            {/* Race rows */}
            <div className="space-y-2">
              {(showAllRaces ? estimatedTimes : estimatedTimes.filter((r) => r.isChosen)).map((race) => (
                <div key={race.label} className="flex items-center justify-between border border-border/50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3 w-[40%]">
                    <img src={race.badge} alt={race.label} className="w-8 h-8 object-contain" />
                    <span className="text-foreground font-medium tabular-nums">{formatTime(race.currentTime)}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <div className="h-px flex-1 bg-border/50" />
                    <ArrowRight size={14} className="text-primary" />
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <div className="text-right w-[40%]">
                    <span className="text-foreground font-semibold tabular-nums">{formatTime(race.improvedTime)}</span>
                    <p className="text-xs text-success mt-0.5">
                      −{Math.floor(race.diff / 60)}m {Math.round(race.diff % 60)}s
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Toggle */}
            <button
              onClick={() => setShowAllRaces(!showAllRaces)}
              className="w-full flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllRaces
                ? (lang === "zh" ? "收起" : "Show less")
                : (lang === "zh" ? "查看所有距離" : "Show all distances")}
              {showAllRaces ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <p className="text-xs text-muted-foreground/80">
              {lang === "zh"
                ? "預估值基於 12 週 AI 訓練計劃。"
                : "Projected after a 12-week training block."}
            </p>
          </>
        ) : (
          <div className="text-muted-foreground text-sm py-12">
            {lang === "zh" ? "請先輸入你的預估比賽時間" : "Please enter your estimated race time first"}
          </div>
        )}
      </div>

      {/* Step 8: Email / Account creation */}
      <div hidden={step !== 8} className="space-y-6">
        <StepHeader
          icon={Mail}
          title={t("createAccount", lang)}
          helper={t("createAccountDesc", lang)}
        />

        <div className="space-y-3">
          <button
            onClick={handleAppleSignUp}
            className="w-full flex items-center justify-center gap-2 bg-foreground text-background h-12 rounded-lg font-medium text-sm transition-opacity hover:opacity-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            {t("signInWithApple", lang)}
          </button>

          <button
            onClick={handleGoogleSignUp}
            className="w-full flex items-center justify-center gap-2 bg-transparent text-foreground border border-border/50 h-12 rounded-lg font-medium text-sm transition-colors hover:bg-accent"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {lang === "zh" ? "使用 Google 註冊" : "Sign up with Google"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("orContinueWith", lang)}</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <Input
          type="email"
          placeholder={t("email", lang)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus={step === 8}
          className={underlineInput}
        />
      </div>

      {/* Step 9: Password */}
      <div hidden={step !== 9} className="space-y-8">
        <StepHeader icon={Lock} title={t("onboardingSetPassword", lang)} />
        <div className="space-y-6">
          <div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={t("password", lang)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                autoFocus={step === 9}
                className={`${underlineInput} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {/* Strength meter */}
            <div className="flex gap-1.5 mt-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < passwordStrength
                      ? passwordStrength === 1
                        ? "bg-destructive"
                        : passwordStrength === 2
                        ? "bg-warning"
                        : "bg-success"
                      : "bg-border/50"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {password.length === 0
                ? (lang === "zh" ? "至少 6 個字元" : "At least 6 characters")
                : password.length < 6
                ? t("passwordMinLength", lang)
                : passwordStrength === 1
                ? (lang === "zh" ? "弱" : "Weak")
                : passwordStrength === 2
                ? (lang === "zh" ? "中等" : "Okay")
                : (lang === "zh" ? "強" : "Strong")}
            </p>
          </div>

          <div>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder={t("confirmPassword", lang)}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                className={`${underlineInput} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-destructive text-xs mt-2">{t("passwordsDoNotMatch", lang)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Step 12: Email OTP verification */}
      <div hidden={step !== 12} className="space-y-6">
        <div className="flex flex-col items-start min-h-[300px]">
          <ShieldCheck size={24} className="text-muted-foreground mb-3" />
          <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-foreground">
            {lang === "zh" ? "輸入驗證碼" : "Enter verification code"}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {lang === "zh"
              ? `我們已發送 6 位數驗證碼到 ${email}`
              : `We've sent a 6-digit code to ${email}`}
          </p>
          <div className="mt-8 w-full flex justify-center">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-14 w-12 rounded-md border border-border/50 bg-transparent text-foreground text-lg font-mono first:rounded-l-md last:rounded-r-md"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            onClick={async () => {
              if (otpCode.length !== 6) return;
              setVerifyingOtp(true);
              const { data, error } = await supabase.auth.verifyOtp({
                email,
                token: otpCode,
                type: "signup",
              });
              setVerifyingOtp(false);
              if (error) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
                setOtpCode("");
                return;
              }
              if (data.user) {
                setOnboardingUserId(data.user.id);
                setSignupInProgress(true);
                setIsAccountCreationInFlight(true);
                setStep(11);
              }
            }}
            disabled={otpCode.length !== 6 || verifyingOtp}
            className="mt-6 w-full h-12 rounded-lg"
          >
            {verifyingOtp
              ? (lang === "zh" ? "驗證中..." : "Verifying...")
              : (lang === "zh" ? "驗證" : "Verify")}
          </Button>
          <button
            onClick={() => {
              supabase.auth.resend({ type: "signup", email });
              toast({ title: lang === "zh" ? "已重新發送" : "Resent", description: lang === "zh" ? "驗證碼已重新寄出" : "Verification code resent" });
            }}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            {lang === "zh" ? "重新發送驗證碼" : "Resend code"}
          </button>
        </div>
      </div>

      {/* Step 11: Creating account loading */}
      <div hidden={step !== 11} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[320px]">
          <div className="flex gap-1.5 mb-8">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary animate-pulse"
                style={{ animationDelay: `${i * 200}ms`, animationDuration: "1.2s" }}
              />
            ))}
          </div>
          <h2 className="font-display text-[24px] leading-tight font-semibold tracking-tight text-foreground text-center">
            {lang === "zh" ? "正在建立你的帳號" : "Creating your account"}
          </h2>
          <p className="text-sm text-muted-foreground text-center mt-3 transition-opacity duration-300 min-h-[1.5rem]">
            {loadingPhrases[loadingPhraseIdx]}
          </p>
        </div>
      </div>

      {/* Step 10: Plan prompt */}
      <div hidden={step !== 10} className="space-y-8">
        <div>
          <h2 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-foreground">
            {lang === "zh" ? "你的計劃已準備好。" : "Your plan is ready."}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {lang === "zh" ? "由 AI 教練根據你的資料生成。" : "Built by your AI coach from your data."}
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => void finalizeOnboarding(true)}
            className="w-full text-left p-5 rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <p className="font-display text-base font-semibold leading-tight">
              {lang === "zh" ? "開始 7 天免費體驗" : "Start 7-day free trial"}
            </p>
            <p className="text-sm text-primary-foreground/80 mt-1">
              {lang === "zh" ? "立即生成我的 AI 訓練計劃" : "Generate my AI training plan"}
            </p>
          </button>
          <button
            onClick={() => void finalizeOnboarding(false)}
            className="w-full text-left p-5 rounded-lg border border-border/50 bg-transparent text-foreground transition-colors hover:bg-accent"
          >
            <p className="font-medium text-base">
              {lang === "zh" ? "暫時略過" : "Skip for now"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "zh" ? "之後可隨時在設定中啟用。" : "You can enable it later from settings."}
            </p>
          </button>

          {/* Redemption code option */}
          {!showRedeemInput ? (
            <button
              onClick={() => setShowRedeemInput(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Ticket size={14} />
              {lang === "zh" ? "我有兌換代碼" : "I have a redemption code"}
            </button>
          ) : (
            <div className="space-y-3 pt-2">
              <Input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder={lang === "zh" ? "輸入代碼" : "Enter code"}
                className={`${underlineInput} text-center tracking-widest font-mono`}
                autoFocus
              />
              <Button
                onClick={() => {
                  if (redeemCode.trim()) {
                    redeemOfferCode(redeemCode.trim(), lang);
                    void finalizeOnboarding(false);
                  }
                }}
                disabled={!redeemCode.trim()}
                className="w-full h-12 rounded-lg"
              >
                <Ticket size={16} />
                {lang === "zh" ? "兌換" : "Redeem"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Progress: steps 1, 3-9 visible (step 2 = welcome anim, 10-12 = post-flow)
  const progressStep = step <= 1 ? 0 : step === 2 ? 0 : step - 2;
  const TOTAL_PROGRESS_STEPS = 9;

  return (
    <SolidBgWrapper>
      {step >= 1 && step <= 10 && step !== 2 && (
        <ProgressLine current={progressStep} total={TOTAL_PROGRESS_STEPS} />
      )}

      <div className="flex-1 flex items-start justify-center px-6 pt-12 pb-6">
        <div className="w-full max-w-md">{signupPanels}</div>
      </div>

      {/* Bottom nav for steps 1, 3-9 */}
      {step >= 1 && step <= 9 && step !== 2 && (
        <div className="flex items-center gap-3 px-6 pb-8 pt-4 max-w-md mx-auto w-full">
          <Button
            variant="outline"
            onClick={goBack}
            className="h-12 px-5 rounded-lg border-border/50 bg-transparent text-foreground hover:bg-accent"
          >
            <ChevronLeft size={16} /> {t("onboardingBack", lang)}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={goNext}
            disabled={!canProceed() || saving}
            className="h-12 px-6 rounded-lg"
          >
            {step === 9
              ? (saving ? t("onboardingCreatingAccount", lang) : t("onboardingStart", lang))
              : (<>{t("onboardingNext", lang)} <ChevronRight size={16} /></>)
            }
          </Button>
        </div>
      )}
    </SolidBgWrapper>
  );
};

export default Onboarding;
