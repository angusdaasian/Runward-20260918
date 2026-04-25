import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
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
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Lang, t } from "@/lib/i18n";
import { calculateRunningScore, predictTime, formatTime } from "@/lib/vdot";
import gingrunLogo from "@/assets/gingrun-logo.png";
import onboardingHero from "@/assets/onboarding-hero.jpg";
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
  if (score >= 60) return 0.04;
  if (score >= 45) return 0.065;
  return 0.10;
}

type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Scoped "Quiet Mint" palette — overrides design tokens for the onboarding flow only,
 * leaving the rest of the app untouched. Soft mint surface, deep teal ink, primary green accent.
 */
const ONBOARDING_THEME: CSSProperties = {
  // Page surface – soft mint cream
  ["--background" as string]: "150 30% 94%",
  ["--foreground" as string]: "175 35% 15%",

  // Cards – slightly lighter mint
  ["--card" as string]: "150 35% 90%",
  ["--card-foreground" as string]: "175 35% 15%",

  ["--popover" as string]: "0 0% 100%",
  ["--popover-foreground" as string]: "175 35% 15%",

  // Primary – deep teal-green
  ["--primary" as string]: "175 40% 22%",
  ["--primary-foreground" as string]: "150 30% 96%",

  ["--secondary" as string]: "150 30% 88%",
  ["--secondary-foreground" as string]: "175 35% 20%",

  ["--muted" as string]: "150 25% 88%",
  ["--muted-foreground" as string]: "175 12% 45%",

  ["--accent" as string]: "150 35% 88%",
  ["--accent-foreground" as string]: "175 35% 20%",

  ["--border" as string]: "150 20% 80%",
  ["--input" as string]: "150 20% 80%",
  ["--ring" as string]: "175 40% 22%",

  ["--success" as string]: "142 64% 32%",
  ["--warning" as string]: "28 80% 45%",

  ["--radius" as string]: "1.25rem",

  backgroundColor: "hsl(150 30% 94%)",
  color: "hsl(175 35% 15%)",
};

/**
 * The shared themed wrapper — all onboarding steps render inside this.
 */
const OnboardingShell = ({ children }: { children: ReactNode }) => (
  <div
    className="min-h-screen flex flex-col font-body"
    style={ONBOARDING_THEME}
  >
    {children}
  </div>
);

/**
 * Top bar: round back button (optional) + centered title + small step counter.
 * Renders the thin progress line beneath itself.
 */
const TopBar = ({
  onBack,
  title,
  current,
  total,
  showProgress = true,
}: {
  onBack?: () => void;
  title?: string;
  current?: number;
  total?: number;
  showProgress?: boolean;
}) => {
  const pct =
    typeof current === "number" && typeof total === "number"
      ? Math.max(0, Math.min(100, ((current + 1) / total) * 100))
      : 0;
  return (
    <div className="px-5 pt-6">
      <div className="relative flex items-center justify-center h-10">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back"
            className="absolute left-0 w-10 h-10 rounded-full bg-card/70 border border-border/40 flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-card transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {title && (
          <h3 className="font-display text-base font-medium text-foreground/80">
            {title}
          </h3>
        )}
        {typeof current === "number" && typeof total === "number" && (
          <span className="absolute right-0 text-xs font-medium text-foreground/60 tabular-nums">
            {current + 1}/{total}
          </span>
        )}
      </div>
      {showProgress && typeof current === "number" && typeof total === "number" && (
        <div className="mt-4 h-[3px] w-full bg-foreground/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Page title block: bold display headline + helper line. Centered.
 */
const QuestionHeader = ({
  title,
  helper,
}: {
  title: string;
  helper?: string;
}) => (
  <div className="space-y-2 text-center px-2">
    <h2 className="font-display text-[26px] leading-[1.2] font-bold tracking-tight text-foreground">
      {title}
    </h2>
    {helper && (
      <p className="text-sm text-foreground/60 leading-relaxed max-w-[320px] mx-auto">
        {helper}
      </p>
    )}
  </div>
);

/**
 * Large rounded card container used for option groups / inputs.
 */
const SoftCard = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-3xl bg-card/80 border border-border/30 p-4 ${className}`}
  >
    {children}
  </div>
);

/**
 * Pill-shaped primary CTA used at the bottom of every step.
 */
const PrimaryPill = ({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className="w-full h-14 rounded-full bg-primary text-primary-foreground text-base font-semibold tracking-wide transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_14px_-4px_hsl(175_40%_22%/0.4)]"
  >
    {children}
  </button>
);

/**
 * Underline-style input — borderless, single bottom border.
 */
const underlineInput =
  "h-14 rounded-none border-0 border-b-2 border-foreground/15 bg-transparent px-1 text-lg font-medium text-foreground placeholder:text-foreground/35 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary transition-colors";

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
    // Only honor the persisted plan-prompt flag if we actually have an authed
    // user. Otherwise (e.g. user bailed mid Apple/Google OAuth and reopened
    // the app) we'd show the plan prompt to a null-user, who then taps
    // through and lands inside the app with no auth and no guest mode.
    if (localStorage.getItem("onboarding_show_plan_prompt") === "true" && user?.id) return 10;
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

  // Persist onboarding "ideal time"
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

  // Safety net: if we ever land on step 10 (plan prompt) without an authed
  // user (e.g. abandoned OAuth flow restored a stale flag), bounce back to
  // step 0. Without this, tapping through step 10 would send the user into
  // the app with no auth.
  useEffect(() => {
    if (step !== 10) return;
    if (user?.id || onboardingUserId) return;
    localStorage.removeItem("onboarding_show_plan_prompt");
    localStorage.removeItem("pending_onboarding_data");
    setStep(0);
  }, [step, user?.id, onboardingUserId]);

  // Auto-advance welcome step
  useEffect(() => {
    if (step === 2 && welcomeVisible) {
      const timer = setTimeout(() => setStep(3), 2500);
      return () => clearTimeout(timer);
    }
  }, [step, welcomeVisible]);

  // Persist just the form data — DO NOT set the plan-prompt flag here.
  // The flag must only be set once we have a confirmed authenticated user,
  // otherwise an abandoned OAuth flow would leave the flag set and trick a
  // future cold-start into showing the plan prompt with no real user.
  const saveOnboardingDataToStorage = () => {
    const onboardingData = { displayName, sex, age, runsPerWeek, estDistance, estHours, estMinutes, estSeconds };
    localStorage.setItem("pending_onboarding_data", JSON.stringify(onboardingData));
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
      if (step === 12) {
        setOnboardingUserId(user.id);
        setSignupInProgress(true);
        setIsAccountCreationInFlight(true);
        setStep(11);
        return;
      }
      if (signupInProgress || isAccountCreationInFlight || (step >= 8 && step <= 11) || !!onboardingUserId) return;

      // Returning from an OAuth (Apple/Google) signup: pending_onboarding_data
      // was stashed before the redirect. Now that we have a real authed user,
      // hydrate the profile and show the plan prompt (step 10).
      const pendingData = localStorage.getItem("pending_onboarding_data");
      if (pendingData) {
        try {
          const parsed = JSON.parse(pendingData);
          localStorage.removeItem("pending_onboarding_data");
          localStorage.setItem("onboarding_show_plan_prompt", "true");
          setStep(10);
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
          return;
        } catch {
          localStorage.removeItem("pending_onboarding_data");
        }
      }

      // Plan-prompt flag is already set (e.g. user reloaded mid-step-10) AND
      // we have a real user → safe to resume on step 10.
      if (localStorage.getItem("onboarding_show_plan_prompt") === "true") {
        setStep(10);
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
      options: { redirectTo: window.location.origin },
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
      options: { redirectTo: window.location.origin },
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
    setStep(11);

    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      // Signup failed — clear all in-progress state and bounce the user
      // back to the welcome/main page so they can restart cleanly instead
      // of being stranded inside the partially-completed signup flow.
      setSignupInProgress(false);
      setSaving(false);
      setIsAccountCreationInFlight(false);
      localStorage.removeItem("onboarding_show_plan_prompt");
      localStorage.removeItem("pending_onboarding_data");
      setOtpCode("");
      setPassword("");
      setConfirmPassword("");
      setStep(0);
      return;
    }

    if (authData.user && !authData.session) {
      setSignupInProgress(false);
      setSaving(false);
      setIsAccountCreationInFlight(false);
      setOnboardingUserId(authData.user.id);
      localStorage.setItem("onboarding_show_plan_prompt", "true");
      saveOnboardingDataToStorage();
      setStep(12);
      return;
    }

    if (authData.user) {
      setOnboardingUserId(authData.user.id);
      localStorage.setItem("onboarding_show_plan_prompt", "true");
    }
  };

  const finalizeOnboarding = async (launchPlanPaywall = false) => {
    const targetUserId = onboardingUserId ?? user?.id;

    // Hard guard: never let the user "finish" onboarding with no auth.
    // This used to slip through if e.g. they bailed out of Apple OAuth and
    // then tapped Skip on the plan prompt — landing them in the app with
    // null user info. Bounce them back to the welcome screen instead.
    if (!targetUserId) {
      setSignupInProgress(false);
      localStorage.removeItem("onboarding_show_plan_prompt");
      localStorage.removeItem("pending_onboarding_data");
      toast({
        title: lang === "zh" ? "請先登入" : "Please sign in",
        description: lang === "zh" ? "完成註冊後再繼續。" : "Finish creating your account to continue.",
        variant: "destructive",
      });
      setStep(0);
      return;
    }

    setSignupInProgress(false);
    localStorage.removeItem("onboarding_show_plan_prompt");

    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("user_id", targetUserId);

    if (launchPlanPaywall) {
      const locale = lang === "zh" ? "zh_Hant" : "en";
      launchPaywall("default", locale);
    }

    onComplete();
  };

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

  // Password strength: 0-3
  const passwordStrength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    return Math.min(3, score);
  })();

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "zh" : "en";
    setSwitchingLang(true);
    setLang(next);
    setTimeout(() => setSwitchingLang(false), 4000);
  };

  /** Small circular language toggle — shows the OPPOSITE language as its label. */
  const LangToggleButton = ({ variant = "light" }: { variant?: "light" | "dark" }) => (
    <button
      onClick={toggleLang}
      aria-label="Switch language"
      className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors backdrop-blur-md ${
        variant === "dark"
          ? "bg-white/15 text-white border border-white/25 hover:bg-white/25"
          : "bg-card/70 text-foreground border border-border/40 hover:bg-card"
      }`}
    >
      {lang === "en" ? "中" : "EN"}
    </button>
  );

  // ---- SIGN IN MODE ----
  if (isSignInMode) {
    if (forgotPasswordMode !== "idle") {
      return (
        <OnboardingShell>
          <TopBar onBack={() => {
            setForgotPasswordMode("idle");
            setResetOtp("");
            setResetNewPassword("");
            setResetConfirmPassword("");
          }} title={t("resetPassword", lang)} showProgress={false} />

          <div className="flex-1 flex flex-col px-6 pt-10 pb-8 max-w-md mx-auto w-full">
            <QuestionHeader
              title={t("resetPassword", lang)}
              helper={
                forgotPasswordMode === "email" ? t("resetPasswordDesc", lang) :
                forgotPasswordMode === "code" ? t("resetCodeSent", lang) :
                t("enterResetCode", lang)
              }
            />

            <div className="mt-10 space-y-5">
              {forgotPasswordMode === "email" && (
                <SoftCard>
                  <Input
                    type="email"
                    placeholder={t("email", lang)}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={underlineInput}
                  />
                </SoftCard>
              )}

              {forgotPasswordMode === "code" && (
                <SoftCard className="flex justify-center py-6">
                  <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp}>
                    <InputOTPGroup className="gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-12 w-10 rounded-xl border border-border/40 bg-background/60 text-foreground text-lg first:rounded-l-xl last:rounded-r-xl"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </SoftCard>
              )}

              {forgotPasswordMode === "newpass" && (
                <SoftCard className="space-y-4">
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
                </SoftCard>
              )}
            </div>

            <div className="mt-auto pt-8 space-y-3">
              {forgotPasswordMode === "email" && (
                <PrimaryPill onClick={handleForgotPasswordSendCode} disabled={saving || !resetEmail}>
                  {saving ? t("onboardingSaving", lang) : t("sendResetCode", lang)}
                </PrimaryPill>
              )}
              {forgotPasswordMode === "code" && (
                <>
                  <PrimaryPill onClick={() => setForgotPasswordMode("newpass")} disabled={resetOtp.length !== 6}>
                    {t("onboardingNext", lang)}
                  </PrimaryPill>
                  <button
                    onClick={handleForgotPasswordSendCode}
                    className="text-foreground/60 text-sm hover:text-foreground transition-colors w-full text-center py-2"
                  >
                    {lang === "zh" ? "重新發送驗證碼" : "Resend code"}
                  </button>
                </>
              )}
              {forgotPasswordMode === "newpass" && (
                <PrimaryPill onClick={handleResetPasswordVerify} disabled={saving || resetNewPassword.length < 6}>
                  {saving ? t("onboardingSaving", lang) : t("resetPassword", lang)}
                </PrimaryPill>
              )}
            </div>
          </div>
        </OnboardingShell>
      );
    }

    return (
      <OnboardingShell>
        <div className="relative">
          <TopBar onBack={() => setIsSignInMode(false)} title={t("signIn", lang)} showProgress={false} />
          <div className="absolute top-6 right-5"><LangToggleButton /></div>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8 max-w-md mx-auto w-full">


          {switchingLang && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-foreground/60">{lang === "zh" ? "切換語言中..." : "Switching language..."}</p>
            </div>
          )}

          <div className="flex flex-col items-center mb-8">
            <img src={gingrunLogo} alt="RunWard" width={56} height={56} className="mb-5" />
            <QuestionHeader
              title={t("onboardingWelcomeBack", lang)}
              helper={t("onboardingSignInDesc", lang)}
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={handleAppleSignIn}
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background h-13 py-3.5 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              {t("signInWithApple", lang)}
            </button>

            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2 bg-card/60 text-foreground border border-border/40 py-3.5 rounded-full font-semibold text-sm transition-colors hover:bg-card"
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
              <div className="flex-1 h-px bg-foreground/10" />
              <span className="text-xs text-foreground/50 uppercase tracking-wider">{t("orContinueWith", lang)}</span>
              <div className="flex-1 h-px bg-foreground/10" />
            </div>

            <SoftCard className="space-y-2">
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
            </SoftCard>

            <div className="text-right pt-1">
              <button
                onClick={() => {
                  setForgotPasswordMode("email");
                  setResetEmail(signInEmail);
                }}
                className="text-foreground/60 text-xs hover:text-foreground transition-colors"
              >
                {t("forgotPassword", lang)}
              </button>
            </div>
          </div>

          <div className="mt-auto pt-8">
            <PrimaryPill onClick={handleSignIn} disabled={saving || !signInEmail || !signInPassword}>
              {saving ? t("onboardingSaving", lang) : t("signIn", lang)}
            </PrimaryPill>
            <p className="text-center text-xs text-foreground/50 mt-5">
              {lang === "zh" ? "登入即表示您同意我們的" : "By signing in, you agree to our "}
              <a href="/privacy" className="text-foreground/70 underline">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</a>
              {lang === "zh" ? "及" : " and "}
              <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-foreground/70 underline">
                {lang === "zh" ? "使用條款" : "Terms of Use"}
              </a>
            </p>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  // ---- STEP 0: Welcome ----
  if (step === 0) {
    return (
      <OnboardingShell>
        <div className="relative flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Hero photo */}
          <img
            src={onboardingHero}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Darkening + bottom gradient for legibility */}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />

          {/* Top bar — language toggle only, top right */}
          <div className="relative z-10 flex justify-end px-5 pt-5">
            <LangToggleButton variant="dark" />
          </div>

          {switchingLang && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-white/80">{lang === "zh" ? "切換語言中..." : "Switching language..."}</p>
            </div>
          )}

          {/* Big editorial headline — fills container width */}
          <div className="relative z-10 flex-1 flex flex-col justify-end px-5 pb-8 max-w-md mx-auto w-full">
            <h1
              className="font-display font-black tracking-[-0.04em] leading-[0.88] mb-6 text-center"
              style={{
                color: "hsl(75 95% 62%)",
                fontSize: "clamp(64px, 26vw, 132px)",
                textShadow: "0 2px 24px rgba(0,0,0,0.25)",
              }}
            >
              {lang === "zh" ? (
                <span
                  className="block"
                  style={{
                    fontSize: "clamp(56px, 19vw, 96px)",
                    letterSpacing: "0.04em",
                    lineHeight: 0.95,
                  }}
                >
                  每一步<br />都是勝利
                </span>
              ) : (
                <>
                  Every<br />Step Is<br />Victory
                </>
              )}
            </h1>

            <div className="text-center mb-5">
              <p className="text-white text-base font-semibold mb-1">
                {lang === "zh" ? "歡迎使用 RunWard" : "Welcome to RunWard"}
              </p>
              <p className="text-white/70 text-sm">
                {lang === "zh"
                  ? "追蹤配速、距離與訓練進度，輕鬆掌握。"
                  : "Monitor your pace, distance, and progress with ease."}
              </p>
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full h-14 rounded-full bg-primary text-primary-foreground text-base font-semibold transition-transform active:scale-[0.98] shadow-lg shadow-black/30"
            >
              {lang === "zh" ? "開始你的旅程" : "Start Your Journey"}
            </button>

            <button
              onClick={() => setIsSignInMode(true)}
              className="w-full text-center text-sm text-white/80 hover:text-white transition-colors py-3 mt-1"
            >
              {lang === "zh" ? "已有帳號？" : "Already have an account? "}
              <span className="font-semibold text-white underline-offset-4 underline decoration-white/50">
                {lang === "zh" ? "登入" : "Login"}
              </span>
            </button>

            <button
              onClick={onGuest}
              className="w-full text-center text-xs text-white/55 hover:text-white/80 transition-colors py-1"
            >
              {t("continueAsGuest", lang)}
            </button>

            <p className="text-center text-[11px] text-white/45 mt-4 leading-relaxed">
              {lang === "zh" ? "繼續即表示您同意我們的" : "By continuing, you agree to our "}
              <a href="/privacy" className="text-white/70 underline">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</a>
              {lang === "zh" ? "及" : " and "}
              <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-white/70 underline">
                {lang === "zh" ? "使用條款" : "Terms of Use"}
              </a>
            </p>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  // ---- STEPS 1-12: Signup flow ----
  const goBack = () => {
    if (step === 1) setStep(0);
    else if (step === 3) setStep(1);
    else setStep((step - 1) as OnboardingStep);
  };

  const goNext = () => {
    if (step === 1) {
      setStep(2);
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

  // Map step → top-bar title + step number for the user
  const STEP_META: Record<number, { title: string; titleZh: string }> = {
    1: { title: "Name", titleZh: "稱呼" },
    3: { title: "Gender", titleZh: "性別" },
    4: { title: "Age", titleZh: "年齡" },
    5: { title: "Frequency", titleZh: "頻率" },
    6: { title: "Race time", titleZh: "比賽時間" },
    7: { title: "Projection", titleZh: "預估" },
    8: { title: "Account", titleZh: "帳號" },
    9: { title: "Password", titleZh: "密碼" },
  };

  // Visible step counter: name=1, gender=2, age=3, freq=4, race=5, proj=6, account=7, password=8
  const stepCounterMap: Record<number, number> = { 1: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7 };
  const TOTAL_VISIBLE_STEPS = 8;

  const currentMeta = STEP_META[step];
  const currentCounter = stepCounterMap[step];
  const showTopBar = currentMeta !== undefined;

  const signupPanels = (
    <>
      {/* Step 1: Name */}
      <div hidden={step !== 1} className="space-y-10">
        <QuestionHeader
          title={lang === "zh" ? "你叫什麼名字？" : "What's your name?"}
          helper={lang === "zh" ? "我們會用它來個人化你的計劃。" : "We'll use this to personalize your plan."}
        />
        <SoftCard className="px-5 py-3">
          <div className="flex items-center gap-3">
            <User size={20} className="text-foreground/40" />
            <Input
              type="text"
              placeholder={lang === "zh" ? "輸入你的名字" : "Your name"}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus={step === 1}
              className={underlineInput}
            />
          </div>
        </SoftCard>
      </div>

      {/* Step 2: Welcome Animation */}
      <div hidden={step !== 2} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[360px]">
          <div className={`transition-all duration-1000 ease-out ${welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <p className="text-sm uppercase tracking-[0.3em] text-foreground/50 text-center mb-6">
              {lang === "zh" ? "歡迎" : "Welcome"}
            </p>
          </div>
          <div className={`transition-all duration-1000 ease-out delay-500 ${welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <h1 className="font-display text-5xl font-bold tracking-tight text-foreground text-center">
              {displayName}
            </h1>
          </div>
          <div className={`transition-all duration-1000 ease-out delay-1000 ${welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <p className="text-sm text-foreground/60 text-center mt-6">
              {lang === "zh" ? "讓我們開始設定你的個人檔案" : "Let's set up your profile"}
            </p>
          </div>
        </div>
      </div>

      {/* Step 3: Gender */}
      <div hidden={step !== 3} className="space-y-10">
        <QuestionHeader
          title={lang === "zh" ? "介紹一下你自己" : "Introduce yourself"}
          helper={lang === "zh" ? "為了給你更好的體驗與結果，我們需要知道你的性別。" : "To give you a better experience and results, we need to know your gender."}
        />
        <SoftCard className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {(["male", "female", "other"] as const).map((s) => {
              const isActive = sex === s;
              return (
                <button
                  key={s}
                  onClick={() => setSex(s)}
                  className={`relative flex flex-col items-center justify-center gap-3 p-4 h-32 rounded-2xl transition-all ${
                    isActive
                      ? "bg-primary/10 ring-2 ring-primary"
                      : "bg-background/50 ring-1 ring-border/30 hover:ring-border/60"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isActive ? "bg-primary/20" : "bg-foreground/5"}`}>
                    <UserCircle2 size={28} className={isActive ? "text-primary" : "text-foreground/50"} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{labels[s]}</span>
                  {isActive && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </SoftCard>
      </div>

      {/* Step 4: Age */}
      <div hidden={step !== 4} className="space-y-10">
        <QuestionHeader
          title={lang === "zh" ? "你的年齡是？" : "What's your age?"}
          helper={lang === "zh" ? "用於校準訓練強度。" : "Used to calibrate training intensity."}
        />
        <SoftCard className="px-5 py-3">
          <div className="flex items-center gap-3">
            <Cake size={20} className="text-foreground/40" />
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
        </SoftCard>
      </div>

      {/* Step 5: Run frequency */}
      <div hidden={step !== 5} className="space-y-10">
        <QuestionHeader
          title={lang === "zh" ? "每週跑幾次？" : "How often do you run?"}
          helper={t("onboardingDaysPerWeek", lang)}
        />
        <SoftCard className="p-4">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
              const isActive = runsPerWeek === n;
              return (
                <button
                  key={n}
                  onClick={() => setRunsPerWeek(n)}
                  className={`h-16 rounded-2xl text-xl font-display font-bold transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_hsl(175_40%_22%/0.4)]"
                      : "bg-background/50 text-foreground ring-1 ring-border/30 hover:ring-border/60"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-foreground/50 text-center mt-4">
            {lang === "zh" ? "選擇你目前的訓練頻率" : "Pick your current training frequency"}
          </p>
        </SoftCard>
      </div>

      {/* Step 6: Estimated Race Time */}
      <div hidden={step !== 6} className="space-y-8">
        <QuestionHeader
          title={lang === "zh" ? "你的預估比賽時間" : "Your estimated race time"}
          helper={lang === "zh" ? "這是你認為如果現在比賽可以跑出的時間。" : "What you think you could run if you raced today."}
        />
        <SoftCard className="space-y-5">
          <div>
            <label className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider mb-3 block px-1">{t("distance", lang)}</label>
            <div className="grid grid-cols-2 gap-2">
              {EST_DISTANCES.map((d) => {
                const isActive = estDistance === d.label;
                return (
                  <button
                    key={d.label}
                    onClick={() => setEstDistance(d.label)}
                    className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${
                      isActive
                        ? "bg-primary/10 ring-2 ring-primary"
                        : "bg-background/50 ring-1 ring-border/30 hover:ring-border/60"
                    }`}
                  >
                    <img src={DISTANCE_BADGES[d.label]} alt={d.label} className="w-9 h-9 object-contain" />
                    <span className="font-display text-sm font-bold text-foreground">{lang === "zh" ? d.labelZh : d.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {estDistance && (
            <div>
              <label className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider mb-3 block px-1">{t("time", lang)}</label>
              <div className="flex items-center gap-2 bg-background/50 rounded-2xl px-4 py-2">
                <Input placeholder="HH" type="number" min={0} value={estHours} onChange={(e) => setEstHours(e.target.value)} className={`${underlineInput} text-center font-mono tabular-nums text-2xl border-b-0`} />
                <span className="text-2xl font-mono text-foreground/40">:</span>
                <Input placeholder="MM" type="number" min={0} max={59} value={estMinutes} onChange={(e) => setEstMinutes(e.target.value)} className={`${underlineInput} text-center font-mono tabular-nums text-2xl border-b-0`} />
                <span className="text-2xl font-mono text-foreground/40">:</span>
                <Input placeholder="SS" type="number" min={0} max={59} value={estSeconds} onChange={(e) => setEstSeconds(e.target.value)} className={`${underlineInput} text-center font-mono tabular-nums text-2xl border-b-0`} />
              </div>
              {isFasterThanWorldRecord() && (
                <p className="text-warning text-sm mt-3">
                  {lang === "zh" ? "這個時間比目前世界紀錄還快。" : "That's faster than the current world record."}
                </p>
              )}
            </div>
          )}
        </SoftCard>
      </div>

      {/* Step 7: Before/After Comparison */}
      <div hidden={step !== 7} className="space-y-5">
        <QuestionHeader
          title={lang === "zh" ? "你的潛力預估" : "Your potential"}
          helper={lang === "zh" ? "12 週訓練計劃後的預估時間。" : "Projected after a 12-week training block."}
        />

        {estimatedTimes && chosenRaceForHeader ? (
          <>
            <SoftCard className="px-5 py-5">
              <p className="text-[11px] uppercase tracking-wider text-foreground/50 mb-2 font-semibold">
                {lang === "zh"
                  ? `預估 ${chosenDist?.labelZh || ""} 時間`
                  : `Projected ${chosenDist?.label || ""} time`}
              </p>
              <div className="flex items-center gap-3">
                <img src={chosenRaceForHeader.badge} alt={chosenRaceForHeader.label} className="w-12 h-12 object-contain" />
                <span className="font-display text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  {formatTime(chosenRaceForHeader.improvedTime)} – {formatTime(chosenRaceForHeader.currentTime)}
                </span>
              </div>
            </SoftCard>

            <div className="flex justify-between px-2 text-[11px] text-foreground/50 uppercase tracking-wider font-semibold">
              <span>{lang === "zh" ? "目前" : "Today"}</span>
              <span>{lang === "zh" ? "12 週後" : "In 12 weeks"}</span>
            </div>

            <div className="space-y-2">
              {(showAllRaces ? estimatedTimes : estimatedTimes.filter((r) => r.isChosen)).map((race) => (
                <SoftCard key={race.label} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 w-[40%]">
                    <img src={race.badge} alt={race.label} className="w-8 h-8 object-contain" />
                    <span className="text-foreground font-medium tabular-nums">{formatTime(race.currentTime)}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <div className="h-px flex-1 bg-foreground/15" />
                    <ArrowRight size={14} className="text-primary" />
                    <div className="h-px flex-1 bg-foreground/15" />
                  </div>
                  <div className="text-right w-[40%]">
                    <span className="text-foreground font-bold tabular-nums">{formatTime(race.improvedTime)}</span>
                    <p className="text-xs text-success mt-0.5 font-semibold">
                      −{Math.floor(race.diff / 60)}m {Math.round(race.diff % 60)}s
                    </p>
                  </div>
                </SoftCard>
              ))}
            </div>

            <button
              onClick={() => setShowAllRaces(!showAllRaces)}
              className="w-full flex items-center justify-center gap-1 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              {showAllRaces
                ? (lang === "zh" ? "收起" : "Show less")
                : (lang === "zh" ? "查看所有距離" : "Show all distances")}
              {showAllRaces ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </>
        ) : (
          <div className="text-foreground/60 text-sm text-center py-12">
            {lang === "zh" ? "請先輸入你的預估比賽時間" : "Please enter your estimated race time first"}
          </div>
        )}
      </div>

      {/* Step 8: Email / Account creation */}
      <div hidden={step !== 8} className="space-y-6">
        <QuestionHeader
          title={t("createAccount", lang)}
          helper={t("createAccountDesc", lang)}
        />

        <div className="space-y-3">
          <button
            onClick={handleAppleSignUp}
            className="w-full flex items-center justify-center gap-2 bg-foreground text-background h-13 py-3.5 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            {t("signInWithApple", lang)}
          </button>

          <button
            onClick={handleGoogleSignUp}
            className="w-full flex items-center justify-center gap-2 bg-card/60 text-foreground border border-border/40 py-3.5 rounded-full font-semibold text-sm transition-colors hover:bg-card"
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
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="text-xs text-foreground/50 uppercase tracking-wider">{t("orContinueWith", lang)}</span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <SoftCard className="px-5 py-3">
          <div className="flex items-center gap-3">
            <Mail size={20} className="text-foreground/40" />
            <Input
              type="email"
              placeholder={t("email", lang)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={step === 8}
              className={underlineInput}
            />
          </div>
        </SoftCard>
      </div>

      {/* Step 9: Password */}
      <div hidden={step !== 9} className="space-y-8">
        <QuestionHeader title={t("onboardingSetPassword", lang)} />
        <SoftCard className="space-y-5 px-5 py-4">
          <div>
            <div className="relative flex items-center gap-3">
              <Lock size={20} className="text-foreground/40" />
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
                className="absolute right-0 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
                      : "bg-foreground/10"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-foreground/50 mt-2">
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
            <div className="relative flex items-center gap-3">
              <Lock size={20} className="text-foreground/40" />
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
                className="absolute right-0 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-destructive text-xs mt-2">{t("passwordsDoNotMatch", lang)}</p>
            )}
          </div>
        </SoftCard>
      </div>

      {/* Step 12: Email OTP verification */}
      <div hidden={step !== 12} className="space-y-6">
        <div className="flex flex-col items-center min-h-[300px] text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ShieldCheck size={28} className="text-primary" />
          </div>
          <QuestionHeader
            title={lang === "zh" ? "輸入驗證碼" : "Enter verification code"}
            helper={lang === "zh" ? `我們已發送 6 位數驗證碼到 ${email}` : `We've sent a 6-digit code to ${email}`}
          />
          <SoftCard className="mt-8 w-full flex justify-center py-6">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-14 w-12 rounded-xl border border-border/40 bg-background/60 text-foreground text-lg font-mono first:rounded-l-xl last:rounded-r-xl"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </SoftCard>
          <PrimaryPill
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
                // OTP verification failed — wipe the half-finished signup
                // state and send the user back to the welcome screen so they
                // can start over (or sign in) instead of being stuck on a
                // dead-end verify screen.
                setOtpCode("");
                setSignupInProgress(false);
                setIsAccountCreationInFlight(false);
                localStorage.removeItem("onboarding_show_plan_prompt");
                localStorage.removeItem("pending_onboarding_data");
                setOnboardingUserId(null);
                setPassword("");
                setConfirmPassword("");
                setStep(0);
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
          >
            {verifyingOtp
              ? (lang === "zh" ? "驗證中..." : "Verifying...")
              : (lang === "zh" ? "驗證" : "Verify")}
          </PrimaryPill>
          <button
            onClick={() => {
              supabase.auth.resend({ type: "signup", email });
              toast({ title: lang === "zh" ? "已重新發送" : "Resent", description: lang === "zh" ? "驗證碼已重新寄出" : "Verification code resent" });
            }}
            className="mt-4 text-sm text-foreground/60 hover:text-foreground transition-colors w-full text-center"
          >
            {lang === "zh" ? "重新發送驗證碼" : "Resend code"}
          </button>
        </div>
      </div>

      {/* Step 11: Creating account loading */}
      <div hidden={step !== 11} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[360px]">
          <div className="flex gap-2 mb-8">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"
                style={{ animationDelay: `${i * 200}ms`, animationDuration: "1.2s" }}
              />
            ))}
          </div>
          <h2 className="font-display text-[24px] leading-tight font-bold tracking-tight text-foreground text-center">
            {lang === "zh" ? "正在建立你的帳號" : "Creating your account"}
          </h2>
          <p className="text-sm text-foreground/60 text-center mt-3 transition-opacity duration-300 min-h-[1.5rem]">
            {loadingPhrases[loadingPhraseIdx]}
          </p>
        </div>
      </div>

      {/* Step 10: Plan prompt */}
      <div hidden={step !== 10} className="space-y-6">
        <div className="text-center pt-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-primary" />
          </div>
          <QuestionHeader
            title={lang === "zh" ? "你的計劃已準備好" : "Your plan is ready"}
            helper={lang === "zh" ? "由 AI 教練根據你的資料生成。" : "Built by your AI coach from your data."}
          />
        </div>
        <div className="space-y-3 pt-2">
          <button
            onClick={() => void finalizeOnboarding(true)}
            className="w-full text-left p-5 rounded-3xl bg-primary text-primary-foreground transition-all hover:opacity-95 active:scale-[0.99] shadow-[0_4px_14px_-4px_hsl(175_40%_22%/0.4)]"
          >
            <p className="font-display text-base font-bold leading-tight">
              {lang === "zh" ? "開始 7 天免費體驗" : "Start 7-day free trial"}
            </p>
            <p className="text-sm text-primary-foreground/80 mt-1">
              {lang === "zh" ? "立即生成我的 AI 訓練計劃" : "Generate my AI training plan"}
            </p>
          </button>
          <button
            onClick={() => void finalizeOnboarding(false)}
            className="w-full text-left p-5 rounded-3xl border border-border/40 bg-card/60 text-foreground transition-colors hover:bg-card"
          >
            <p className="font-semibold text-base">
              {lang === "zh" ? "暫時略過" : "Skip for now"}
            </p>
            <p className="text-sm text-foreground/60 mt-1">
              {lang === "zh" ? "之後可隨時在設定中啟用。" : "You can enable it later from settings."}
            </p>
          </button>

          {!showRedeemInput ? (
            <button
              onClick={() => setShowRedeemInput(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              <Ticket size={14} />
              {lang === "zh" ? "我有兌換代碼" : "I have a redemption code"}
            </button>
          ) : (
            <SoftCard className="space-y-3 px-5 py-4">
              <Input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder={lang === "zh" ? "輸入代碼" : "Enter code"}
                className={`${underlineInput} text-center tracking-widest font-mono`}
                autoFocus
              />
              <PrimaryPill
                onClick={() => {
                  if (redeemCode.trim()) {
                    redeemOfferCode(redeemCode.trim(), lang);
                    void finalizeOnboarding(false);
                  }
                }}
                disabled={!redeemCode.trim()}
              >
                {lang === "zh" ? "兌換" : "Redeem"}
              </PrimaryPill>
            </SoftCard>
          )}
        </div>
      </div>
    </>
  );

  return (
    <OnboardingShell>
      {showTopBar && (
        <TopBar
          onBack={goBack}
          title={lang === "zh" ? currentMeta.titleZh : currentMeta.title}
          current={currentCounter}
          total={TOTAL_VISIBLE_STEPS}
        />
      )}

      <div className="flex-1 flex items-start justify-center px-6 pt-10 pb-6">
        <div className="w-full max-w-md">{signupPanels}</div>
      </div>

      {/* Bottom CTA for steps 1, 3-9 */}
      {step >= 1 && step <= 9 && step !== 2 && (
        <div className="px-6 pb-8 pt-4 max-w-md mx-auto w-full">
          <PrimaryPill onClick={goNext} disabled={!canProceed() || saving}>
            {step === 9
              ? (saving ? t("onboardingCreatingAccount", lang) : t("onboardingStart", lang))
              : (lang === "zh" ? "下一步" : "Next")
            }
          </PrimaryPill>
        </div>
      )}
    </OnboardingShell>
  );
};

export default Onboarding;
