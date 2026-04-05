import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Mail, Eye, EyeOff, Ticket } from "lucide-react";
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

const OnboardingBgWrapper = ({ children, showOverlay = true }: { children: ReactNode; showOverlay?: boolean }) => (
  <div className="relative min-h-screen flex flex-col">
    <img
      src={onboardingBg}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      width={896}
      height={1920}
    />
    {showOverlay && <div className="absolute inset-0 bg-black/60" />}
    <div className="relative z-10 flex flex-col min-h-screen">
      {children}
    </div>
  </div>
);

const OnboardingProgressBar = ({ current, total }: { current: number; total: number }) => (
  <div className="flex justify-center gap-1.5 mb-6 px-6 pt-6">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={`h-1.5 rounded-full transition-all duration-300 ${
          i < current ? "flex-1 bg-white" : i === current ? "flex-[2] bg-white" : "flex-1 bg-white/30"
        }`}
      />
    ))}
  </div>
);

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

  const handleAppleSignIn = () => {
    const redirectUri = window.location.origin;
    const startUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apple-auth-start?redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = startUrl;
  };

  const handleAppleSignUp = () => {
    saveOnboardingDataToStorage();
    handleAppleSignIn();
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

    // Find the user's chosen distance for headline
    const chosenRace = ALL_RACE_DISTS.find((r) => r.meters === dist.meters);

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

  const labels = sexLabels(lang);

  // ---- SIGN IN MODE ----
  if (isSignInMode) {
    return (
      <OnboardingBgWrapper>
        <div className="flex-1 flex flex-col px-6 pt-16 pb-8">
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => { if (lang !== "en") { setSwitchingLang(true); setLang("en"); setTimeout(() => setSwitchingLang(false), 4000); } }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${lang === "en" ? "bg-white text-black" : "bg-white/20 text-white"}`}
            >English</button>
            <button
              onClick={() => { if (lang !== "zh") { setSwitchingLang(true); setLang("zh"); setTimeout(() => setSwitchingLang(false), 4000); } }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${lang === "zh" ? "bg-white text-black" : "bg-white/20 text-white"}`}
            >中文 (HK)</button>
          </div>

          {switchingLang && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
              <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-white/70">{lang === "zh" ? "切換語言中..." : "Switching language..."}</p>
            </div>
          )}

          <div className="text-center mb-8">
            <img src={gingrunLogo} alt="RunWard" width={80} height={80} className="mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-white">{t("onboardingWelcomeBack", lang)}</h1>
            <p className="text-white/70 text-sm mt-1">{t("onboardingSignInDesc", lang)}</p>
          </div>

          <div className="space-y-3 max-w-sm mx-auto w-full">
            <button
              onClick={handleAppleSignIn}
              className="w-full flex items-center justify-center gap-2 bg-white text-black py-3 rounded-xl font-medium text-sm transition-all hover:opacity-90"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              {t("signInWithApple", lang)}
            </button>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-white/30" />
              <span className="text-xs text-white/60">{t("orContinueWith", lang)}</span>
              <div className="flex-1 h-px bg-white/30" />
            </div>

            <Input
              type="email"
              placeholder={t("email", lang)}
              value={signInEmail}
              onChange={(e) => setSignInEmail(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
            <Input
              type="password"
              placeholder={t("password", lang)}
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
            <Button
              onClick={handleSignIn}
              disabled={saving || !signInEmail || !signInPassword}
              className="w-full h-12 rounded-xl bg-white text-black hover:bg-white/90"
            >
              <Mail size={16} />
              {saving ? t("onboardingSaving", lang) : t("signIn", lang)}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignInMode(false)}
              className="text-white/70 text-sm hover:text-white transition-colors"
            >
              <ChevronLeft size={14} className="inline mr-1" />
              {t("onboardingBack", lang)}
            </button>
          </div>

          <div className="mt-auto pt-6">
            <p className="text-center text-xs text-white/50">
              {lang === "zh" ? "登入即表示您同意我們的" : "By signing in, you agree to our "}
              <a href="/privacy" className="text-white/70 underline">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</a>
              {lang === "zh" ? "及" : " and "}
              <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-white/70 underline">
                {lang === "zh" ? "使用條款" : "Terms of Use"}
              </a>
            </p>
          </div>
        </div>
      </OnboardingBgWrapper>
    );
  }

  // ---- STEP 0: First time? ----
  if (step === 0) {
    return (
      <OnboardingBgWrapper>
        <div className="flex-1 flex flex-col px-6 pt-16 pb-8">
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => { if (lang !== "en") { setSwitchingLang(true); setLang("en"); setTimeout(() => setSwitchingLang(false), 4000); } }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${lang === "en" ? "bg-white text-black" : "bg-white/20 text-white"}`}
            >English</button>
            <button
              onClick={() => { if (lang !== "zh") { setSwitchingLang(true); setLang("zh"); setTimeout(() => setSwitchingLang(false), 4000); } }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${lang === "zh" ? "bg-white text-black" : "bg-white/20 text-white"}`}
            >中文 (HK)</button>
          </div>

          {switchingLang && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
              <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-white/70">{lang === "zh" ? "切換語言中..." : "Switching language..."}</p>
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center">
            <img src={gingrunLogo} alt="RunWard" width={100} height={100} className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">
              {lang === "zh" ? "向前跑" : "RunWard"}
            </h1>
            <p className="text-white/70 text-sm mb-10">
              {lang === "zh" ? "你的跑步訓練夥伴" : "Your running training companion"}
            </p>

            <h2 className="text-xl font-semibold text-white mb-6 text-center">
              {t("onboardingFirstTime", lang)}
            </h2>

            <div className="space-y-3 w-full max-w-xs">
              <Button
                onClick={() => setStep(1)}
                className="w-full h-14 rounded-xl bg-white text-black hover:bg-white/90 text-base font-semibold"
              >
                {t("onboardingYes", lang)}
              </Button>
              <Button
                onClick={() => setIsSignInMode(true)}
                variant="outline"
                className="w-full h-14 rounded-xl border-white/30 text-white bg-white/10 hover:bg-white/20 text-base font-semibold"
              >
                {t("onboardingNo", lang)}
              </Button>
              <button
                onClick={onGuest}
                className="w-full text-center text-sm text-white/60 hover:text-white transition-colors py-2"
              >
                {t("continueAsGuest", lang)}
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-white/50 mt-4">
            {lang === "zh" ? "登入即表示您同意我們的" : "By signing in, you agree to our "}
            <a href="/privacy" className="text-white/70 underline">{lang === "zh" ? "隱私權政策" : "Privacy Policy"}</a>
            {lang === "zh" ? "及" : " and "}
            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-white/70 underline">
              {lang === "zh" ? "使用條款" : "Terms of Use"}
            </a>
          </p>
        </div>
      </OnboardingBgWrapper>
    );
  }

  // ---- STEPS 1-10: Signup flow ----
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
      case 7: return true; // before/after is just display
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
      <div hidden={step !== 1} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">👋</span>
          <h2 className="text-2xl font-bold text-white">{lang === "zh" ? "你叫什麼名字？" : "What's your name?"}</h2>
        </div>
        <Input
          type="text"
          placeholder={lang === "zh" ? "輸入你的名字" : "Enter your name"}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoFocus={step === 1}
          className="text-center text-lg h-14 bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>

      {/* Step 2: Welcome Animation */}
      <div hidden={step !== 2} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <div
            className={`transition-all duration-1000 ease-out ${
              welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-lg text-white/70 text-center mb-2">
              {lang === "zh" ? "歡迎來到我們的應用程式" : "Welcome to our App"}
            </p>
          </div>
          <div
            className={`transition-all duration-1000 ease-out delay-500 ${
              welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <h1 className="text-4xl font-bold text-white text-center">
              {displayName} 🎉
            </h1>
          </div>
          <div
            className={`transition-all duration-1000 ease-out delay-1000 ${
              welcomeVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-sm text-white/50 text-center mt-4">
              {lang === "zh" ? "讓我們開始設定你的個人檔案" : "Let's set up your profile"}
            </p>
          </div>
        </div>
      </div>

      {/* Step 3: Gender */}
      <div hidden={step !== 3} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">🏃</span>
          <h2 className="text-2xl font-bold text-white">{t("onboardingGender", lang)}</h2>
        </div>
        <div className="flex gap-2">
          {(["male", "female", "other"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSex(s)}
              className={`flex-1 py-4 rounded-xl text-sm font-semibold transition-all border-2 ${
                sex === s
                  ? "bg-white text-black border-white shadow-md"
                  : "bg-white/10 text-white border-white/20 hover:border-white/40"
              }`}
            >
              {s === "male" ? "🙋‍♂️ " : s === "female" ? "🙋‍♀️ " : "🧑 "}
              {labels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Step 4: Age */}
      <div hidden={step !== 4} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">🎂</span>
          <h2 className="text-2xl font-bold text-white">{t("onboardingAgeQuestion", lang)}</h2>
        </div>
        <Input
          type="number"
          placeholder={t("onboardingAge", lang)}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          min={10}
          max={100}
          autoFocus={step === 4}
          className="text-center text-lg h-14 bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>

      {/* Step 5: Run frequency */}
      <div hidden={step !== 5} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">📅</span>
          <h2 className="text-2xl font-bold text-white">{t("onboardingRunFreqQuestion", lang)}</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              onClick={() => setRunsPerWeek(n)}
              className={`py-4 rounded-xl text-lg font-bold transition-all border-2 ${
                runsPerWeek === n
                  ? "bg-white text-black border-white shadow-md scale-105"
                  : "bg-white/10 text-white border-white/20 hover:border-white/40"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-center text-white/60">{t("onboardingDaysPerWeek", lang)}</p>
      </div>

      {/* Step 6: Estimated Race Time */}
      <div hidden={step !== 6} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">⏱️</span>
          <h2 className="text-xl font-bold text-white">
            {lang === "zh" ? "輸入你的預估比賽時間" : "Enter your estimated race time"}
          </h2>
          <p className="text-sm text-white/60 mt-2">
            {lang === "zh"
              ? "這是你認為如果現在比賽可以跑出的時間！"
              : "This is the time you think you can run if you race now!"}
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-white/80 mb-2 block">{t("distance", lang)}</label>
          <div className="grid grid-cols-4 gap-3">
            {EST_DISTANCES.map((d) => (
              <button
                key={d.label}
                onClick={() => setEstDistance(d.label)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all border-2 ${
                  estDistance === d.label
                    ? "border-white shadow-lg bg-white/15 scale-105"
                    : "border-white/20 bg-white/5 hover:border-white/40"
                }`}
              >
                <img src={DISTANCE_BADGES[d.label]} alt={d.label} className="w-14 h-14 object-contain" />
                <span className="text-xs font-semibold text-white">{lang === "zh" ? d.labelZh : d.label}</span>
              </button>
            ))}
          </div>
        </div>
        {estDistance && (
          <div>
            <label className="text-sm font-medium text-white/80 mb-2 block">{t("time", lang)}</label>
            <div className="flex gap-2">
              <Input placeholder="H" type="number" min={0} value={estHours} onChange={(e) => setEstHours(e.target.value)} className="text-center h-12 text-lg bg-white/10 border-white/20 text-white placeholder:text-white/50" />
              <Input placeholder="M" type="number" min={0} max={59} value={estMinutes} onChange={(e) => setEstMinutes(e.target.value)} className="text-center h-12 text-lg bg-white/10 border-white/20 text-white placeholder:text-white/50" />
              <Input placeholder="S" type="number" min={0} max={59} value={estSeconds} onChange={(e) => setEstSeconds(e.target.value)} className="text-center h-12 text-lg bg-white/10 border-white/20 text-white placeholder:text-white/50" />
            </div>
            {isFasterThanWorldRecord() && (
              <p className="text-amber-400 text-sm text-center mt-3">
                {lang === "zh"
                  ? "你比目前的世界紀錄還快！😅"
                  : "You are faster than the current world record! 😅"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Step 7: Before/After Comparison */}
      <div hidden={step !== 7} className="space-y-4">
        {estimatedTimes && chosenRaceForHeader ? (
          <>
            {/* Header banner */}
            <div className="rounded-xl bg-gradient-to-r from-teal-600 to-teal-400 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white/80">⏱</span>
                <span className="text-sm font-medium text-white">
                  {lang === "zh"
                    ? `預估${lang === "zh" ? (chosenDist?.labelZh || "") : (chosenDist?.label || "")}時間`
                    : `Estimated ${chosenDist?.label || ""} Time`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <img src={chosenRaceForHeader.badge} alt={chosenRaceForHeader.label} className="w-9 h-9 object-contain" />
                <span className="text-2xl font-bold text-white">
                  {formatTime(chosenRaceForHeader.improvedTime)} - {formatTime(chosenRaceForHeader.currentTime)}
                </span>
              </div>
            </div>

            {/* Column headers */}
            <div className="flex justify-between px-2 text-xs text-white/50 uppercase tracking-wider">
              <span>{lang === "zh" ? "目前" : "Current"}</span>
              <span>{lang === "zh" ? "12週後" : "In 12 Weeks"}</span>
            </div>

            {/* Race rows */}
            {(showAllRaces ? estimatedTimes : estimatedTimes.filter((r) => r.isChosen)).map((race) => (
              <div key={race.label} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <img src={race.badge} alt={race.label} className="w-9 h-9 object-contain" />
                  <span className="text-white font-medium">{formatTime(race.currentTime)}</span>
                </div>
                <div className="flex items-center gap-1 text-white/40">
                  <span>•</span><span>•</span>
                  <span className="text-white/60">🏃</span>
                  <span>•</span><span>•</span>
                </div>
                <div className="text-right">
                  <span className="text-white font-bold">{formatTime(race.improvedTime)}</span>
                  <p className="text-xs text-green-400">
                    -{Math.floor(race.diff / 60)}m {Math.round(race.diff % 60)}s
                  </p>
                </div>
              </div>
            ))}

            {/* Toggle */}
            <button
              onClick={() => setShowAllRaces(!showAllRaces)}
              className="w-full flex items-center justify-center gap-1 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              {showAllRaces
                ? (lang === "zh" ? "收起" : "See Less")
                : (lang === "zh" ? "查看所有距離" : "See All Distances")}
              {showAllRaces ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <p className="text-center text-xs text-white/40">
              {lang === "zh"
                ? "* 基於12週 AI 訓練計劃的預估改善幅度"
                : "* Estimated improvement based on 12 weeks of AI training plan"}
            </p>
          </>
        ) : (
          <div className="text-center text-white/60 text-sm py-12">
            {lang === "zh" ? "請先輸入你的預估比賽時間" : "Please enter your estimated race time first"}
          </div>
        )}
      </div>

      {/* Step 8: Email / Account creation */}
      <div hidden={step !== 8} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">📧</span>
          <h2 className="text-2xl font-bold text-white">{t("createAccount", lang)}</h2>
          <p className="text-sm text-white/60 mt-1">{t("createAccountDesc", lang)}</p>
        </div>

        <button
          onClick={handleAppleSignUp}
          className="w-full flex items-center justify-center gap-2 bg-white text-black py-3.5 rounded-xl font-medium text-sm transition-all hover:opacity-90"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          {t("signInWithApple", lang)}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/30" />
          <span className="text-xs text-white/60">{t("orContinueWith", lang)}</span>
          <div className="flex-1 h-px bg-white/30" />
        </div>

        <Input
          type="email"
          placeholder={t("email", lang)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus={step === 8}
          className="text-center text-lg h-14 bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>

      {/* Step 9: Password */}
      <div hidden={step !== 9} className="space-y-6">
        <div className="text-center">
          <span className="text-5xl mb-3 block">🔐</span>
          <h2 className="text-2xl font-bold text-white">{t("onboardingSetPassword", lang)}</h2>
        </div>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder={t("password", lang)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoFocus={step === 9}
            className="text-center text-lg h-14 bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <div className="relative">
          <Input
            type={showConfirmPassword ? "text" : "password"}
            placeholder={t("confirmPassword", lang)}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            className="text-center text-lg h-14 bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
          >
            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <p className={`text-red-400 text-sm text-center ${password && confirmPassword && password !== confirmPassword ? "visible" : "invisible"}`}>{t("passwordsDoNotMatch", lang)}</p>
        <p className={`text-red-400 text-sm text-center ${password && password.length > 0 && password.length < 6 ? "visible" : "invisible"}`}>{t("passwordMinLength", lang)}</p>
      </div>

      {/* Step 12: Email verification */}
      <div hidden={step !== 12} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <Mail size={48} className="text-white mb-6" />
          <h2 className="text-2xl font-bold text-white text-center">
            {lang === "zh" ? "請驗證你的電子郵件" : "Check your email"}
          </h2>
          <p className="text-sm text-white/60 text-center mt-3 max-w-xs">
            {lang === "zh"
              ? `我們已發送驗證連結到 ${email}。請點擊連結以完成註冊。`
              : `We've sent a verification link to ${email}. Please click the link to complete your signup.`}
          </p>
          <Button
            onClick={() => {
              supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin } });
              toast({ title: lang === "zh" ? "已重新發送" : "Resent", description: lang === "zh" ? "驗證信已重新寄出" : "Verification email resent" });
            }}
            variant="outline"
            className="mt-6 rounded-xl border-white/30 text-white bg-white/10 hover:bg-white/20"
          >
            {lang === "zh" ? "重新發送驗證信" : "Resend verification email"}
          </Button>
        </div>
      </div>

      {/* Step 11: Creating account loading */}
      <div hidden={step !== 11} className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-2xl font-bold text-white text-center">
            {lang === "zh" ? "正在建立你的帳號..." : "Creating your account..."}
          </h2>
          <p className="text-sm text-white/60 text-center mt-3">
            {lang === "zh" ? "請稍候，我們正在為你準備一切" : "Please wait while we set everything up for you"}
          </p>
        </div>
      </div>

      {/* Step 10: Plan prompt */}
      <div hidden={step !== 10} className="space-y-8">
        <div className="text-center">
          <span className="text-5xl mb-3 block">🎉</span>
          <h2 className="text-2xl font-bold text-white">{t("onboardingWantPlan", lang)}</h2>
        </div>
        <div className="space-y-3 max-w-xs mx-auto">
          <Button
            onClick={() => void finalizeOnboarding(true)}
            className="w-full h-auto py-3 rounded-xl bg-white text-black hover:bg-white/90 font-semibold whitespace-normal leading-tight flex flex-col items-center gap-0.5"
          >
            <span className="text-base">{lang === "zh" ? "是，請給我我的 AI 訓練計劃！" : "Yes, please give me my Generated plan!"}</span>
            <span className="text-xs font-medium text-black/60">{lang === "zh" ? "領取 7 天免費體驗" : "Claim Your 7‑Day Free Access"}</span>
          </Button>
          <Button
            onClick={() => void finalizeOnboarding(false)}
            variant="outline"
            className="w-full h-14 rounded-xl border-white/30 text-white bg-white/10 hover:bg-white/20 text-base font-semibold whitespace-normal leading-tight"
          >
            {lang === "zh" ? "不，帶我去主頁。" : "No, take me to the home page."}
          </Button>

          {/* Redemption code option */}
          {!showRedeemInput ? (
            <button
              onClick={() => setShowRedeemInput(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-white/60 hover:text-white transition-colors"
            >
              <Ticket size={16} />
              {lang === "zh" ? "我有兌換代碼" : "I have a redemption code"}
            </button>
          ) : (
            <div className="space-y-3 pt-2">
              <Input
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                placeholder={lang === "zh" ? "輸入代碼" : "Enter code"}
                className="text-center text-lg tracking-widest font-mono bg-white/10 border-white/20 text-white placeholder:text-white/50"
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
                className="w-full h-12 rounded-xl bg-white text-black hover:bg-white/90"
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

  // Progress bar: steps 1-10, but skip step 2 (welcome anim) from count
  // Show progress for steps 1, 3-10 = 9 visible steps
  const progressStep = step <= 1 ? 0 : step === 2 ? 0 : step - 2; // map step to progress index
  const TOTAL_PROGRESS_STEPS = 9;

  return (
    <OnboardingBgWrapper>
      {step >= 1 && step <= 10 && step !== 2 && (
        <OnboardingProgressBar current={progressStep} total={TOTAL_PROGRESS_STEPS} />
      )}

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">{signupPanels}</div>
      </div>

      {/* Bottom nav for steps 1, 3-9 (not 2=welcome anim, not 10=plan prompt) */}
      {step >= 1 && step <= 9 && step !== 2 && (
        <div className="flex items-center gap-3 px-6 pb-8 pt-4">
          <Button
            variant="outline"
            onClick={goBack}
            className="h-12 px-5 rounded-xl border-white/30 text-white bg-white/10 hover:bg-white/20"
          >
            <ChevronLeft size={16} /> {t("onboardingBack", lang)}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={goNext}
            disabled={!canProceed() || saving}
            className="h-12 px-6 rounded-xl bg-white text-black hover:bg-white/90"
          >
            {step === 9
              ? (saving ? t("onboardingCreatingAccount", lang) : t("onboardingStart", lang))
              : (<>{t("onboardingNext", lang)} <ChevronRight size={16} /></>)
            }
          </Button>
        </div>
      )}
    </OnboardingBgWrapper>
  );
};

export default Onboarding;
