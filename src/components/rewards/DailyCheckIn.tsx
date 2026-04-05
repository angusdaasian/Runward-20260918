import { useState, useCallback, useEffect, useRef } from "react";
import { Flame, Zap, Check } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  lang: Lang;
  userId: string;
  lastLogin: string | null;
  currentXp: number;
  onXpGain: (newXp: number) => void;
}

const CHECK_IN_XP = 150;
const STREAK_BONUS_XP = 300;
const STREAK_DAYS = 7;

/** Get today's date string in HKT (Asia/Hong_Kong) as YYYY-MM-DD */
function getHKTDateString(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

/** Check if user can check in today (HKT) */
function canCheckInToday(lastCheckInDate: string | null): boolean {
  if (!lastCheckInDate) return true;
  return lastCheckInDate !== getHKTDateString();
}

/** Calculate streak: if last check-in was yesterday (HKT), continue streak; otherwise reset */
function calculateStreak(lastCheckInDate: string | null, currentStreak: number): number {
  if (!lastCheckInDate) return 1;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayHKT = getHKTDateString(yesterday);
  const todayHKT = getHKTDateString();

  if (lastCheckInDate === todayHKT || lastCheckInDate === yesterdayHKT) {
    return currentStreak + 1;
  }
  return 1; // streak broken
}

const DailyCheckIn = ({ lang, userId, lastLogin, currentXp, onXpGain }: Props) => {
  const [checking, setChecking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [lastCheckInDate, setLastCheckInDate] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [showXpFloat, setShowXpFloat] = useState(false);
  const [floatXp, setFloatXp] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch streak data
  useEffect(() => {
    const fetchStreak = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("check_in_streak, last_check_in_date")
        .eq("user_id", userId)
        .single();
      if (data) {
        setStreak(data.check_in_streak ?? 0);
        setLastCheckInDate(data.last_check_in_date ?? null);
        setCheckedIn(!canCheckInToday(data.last_check_in_date ?? null));
      }
    };
    fetchStreak();
  }, [userId]);

  const handleCheckIn = useCallback(async () => {
    if (checkedIn || checking) return;
    setChecking(true);

    const todayHKT = getHKTDateString();
    const newStreak = calculateStreak(lastCheckInDate, streak);
    const isStreakComplete = newStreak > 0 && newStreak % STREAK_DAYS === 0;
    const totalXpGain = CHECK_IN_XP + (isStreakComplete ? STREAK_BONUS_XP : 0);
    const newXp = currentXp + totalXpGain;

    const { error } = await supabase
      .from("profiles")
      .update({
        monthly_xp: newXp,
        last_login: new Date().toISOString(),
        check_in_streak: newStreak,
        last_check_in_date: todayHKT,
      })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setChecking(false);
      return;
    }

    // Update lifetime_xp
    const { data: profile } = await supabase
      .from("profiles")
      .select("lifetime_xp")
      .eq("user_id", userId)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ lifetime_xp: profile.lifetime_xp + totalXpGain })
        .eq("user_id", userId);
    }

    // Show floating +XP effect
    setFloatXp(totalXpGain);
    setShowXpFloat(true);
    setTimeout(() => setShowXpFloat(false), 1500);

    // Confetti
    confetti({
      particleCount: isStreakComplete ? 300 : 150,
      spread: isStreakComplete ? 120 : 80,
      origin: { y: 0.7 },
      colors: isStreakComplete
        ? ["#FFD700", "#FF6B35", "#00D4FF", "#7C3AED", "#FF0080"]
        : ["#FFD700", "#FF6B35", "#00D4FF", "#7C3AED"],
    });

    setCheckedIn(true);
    setStreak(newStreak);
    setLastCheckInDate(todayHKT);
    onXpGain(newXp);
    setChecking(false);

    const desc = isStreakComplete
      ? lang === "zh"
        ? `+${CHECK_IN_XP} XP + 🔥 ${STREAK_BONUS_XP} XP 連續獎勵！`
        : `+${CHECK_IN_XP} XP + 🔥 ${STREAK_BONUS_XP} XP Streak Bonus!`
      : lang === "zh"
        ? `+${CHECK_IN_XP} XP`
        : `+${CHECK_IN_XP} XP earned`;

    toast({
      title: lang === "zh" ? "簽到成功！" : "Checked in!",
      description: desc,
    });
  }, [checkedIn, checking, currentXp, userId, onXpGain, lang, streak, lastCheckInDate]);

  // Determine which of the 7 days are filled
  const streakDaysFilled = checkedIn ? streak : streak; // current streak count
  const currentDayInCycle = streakDaysFilled % STREAK_DAYS;

  return (
    <div className="space-y-3">
      {/* Check-in Button */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleCheckIn}
          disabled={checkedIn || checking}
          className={`w-full relative overflow-hidden rounded-xl p-4 flex items-center gap-4 transition-all ${
            checkedIn
              ? "bg-card border border-border opacity-70"
              : "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-[0.98]"
          }`}
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              checkedIn ? "bg-muted" : "bg-white/20"
            }`}
          >
            {checkedIn ? (
              <Check size={24} className="text-primary" />
            ) : (
              <Zap size={24} className="text-white" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className={`font-bold text-sm ${checkedIn ? "text-muted-foreground" : ""}`}>
              {checkedIn
                ? lang === "zh"
                  ? "今日已簽到 ✓"
                  : "Checked in today ✓"
                : lang === "zh"
                  ? "每日簽到"
                  : "Daily Check-in"}
            </p>
            <p className={`text-xs ${checkedIn ? "text-muted-foreground" : "text-white/70"}`}>
              {checkedIn
                ? lang === "zh"
                  ? "明天再來！"
                  : "Come back tomorrow!"
                : lang === "zh"
                  ? `簽到獲得 +${CHECK_IN_XP} XP`
                  : `Check in for +${CHECK_IN_XP} XP`}
            </p>
          </div>
          {!checkedIn && <span className="text-xl font-black">+{CHECK_IN_XP}</span>}
        </button>

        {/* Floating +XP animation */}
        <AnimatePresence>
          {showXpFloat && (
            <motion.div
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -60, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="absolute top-0 right-6 text-2xl font-black text-primary pointer-events-none"
            >
              +{floatXp} XP
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 7-Day Streak Circles */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} className="text-orange-500" />
          <span className="text-xs font-bold text-foreground">
            {lang === "zh" ? `連續簽到 ${streak} 天` : `${streak} Day Streak`}
          </span>
          {streak >= STREAK_DAYS && (
            <span className="ml-auto text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
              🔥 +{STREAK_BONUS_XP} XP
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5">
          {Array.from({ length: STREAK_DAYS }).map((_, i) => {
            const dayNum = i + 1;
            const isFilled = dayNum <= currentDayInCycle || (currentDayInCycle === 0 && streak >= STREAK_DAYS);
            const isBonus = dayNum === STREAK_DAYS;

            return (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isFilled
                      ? isBonus
                        ? "bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-lg shadow-orange-500/30"
                        : "bg-primary text-primary-foreground"
                      : isBonus
                        ? "border-2 border-dashed border-orange-500/40 text-orange-500/40"
                        : "border-2 border-border text-muted-foreground"
                  }`}
                >
                  {isFilled ? (
                    <Check size={14} />
                  ) : isBonus ? (
                    <Flame size={14} />
                  ) : (
                    dayNum
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {isBonus ? (lang === "zh" ? "獎勵" : "Bonus") : `${lang === "zh" ? "日" : "D"}${dayNum}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DailyCheckIn;
