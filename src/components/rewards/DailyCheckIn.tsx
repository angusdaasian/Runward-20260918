import { useState, useCallback } from "react";
import { Zap } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";

interface Props {
  lang: Lang;
  userId: string;
  lastLogin: string | null;
  currentXp: number;
  onXpGain: (newXp: number) => void;
}

const CHECK_IN_XP = 100;

function canCheckIn(lastLogin: string | null): boolean {
  if (!lastLogin) return true;
  const last = new Date(lastLogin);
  const now = new Date();
  return last.toDateString() !== now.toDateString();
}

const DailyCheckIn = ({ lang, userId, lastLogin, currentXp, onXpGain }: Props) => {
  const [checking, setChecking] = useState(false);
  const [checkedIn, setCheckedIn] = useState(!canCheckIn(lastLogin));

  const handleCheckIn = useCallback(async () => {
    if (checkedIn || checking) return;
    setChecking(true);

    const newXp = currentXp + CHECK_IN_XP;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("profiles")
      .update({
        monthly_xp: newXp,
        lifetime_xp: currentXp + CHECK_IN_XP, // Will be overridden by actual calculation
        last_login: now,
      })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setChecking(false);
      return;
    }

    // Also update lifetime_xp correctly
    const { data: profile } = await supabase
      .from("profiles")
      .select("lifetime_xp")
      .eq("user_id", userId)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ lifetime_xp: profile.lifetime_xp + CHECK_IN_XP })
        .eq("user_id", userId);
    }

    // Confetti!
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.7 },
      colors: ["#FFD700", "#FF6B35", "#00D4FF", "#7C3AED"],
    });

    setCheckedIn(true);
    onXpGain(newXp);
    setChecking(false);

    toast({
      title: lang === "zh" ? "簽到成功！" : "Checked in!",
      description: lang === "zh" ? `+${CHECK_IN_XP} XP` : `+${CHECK_IN_XP} XP earned`,
    });
  }, [checkedIn, checking, currentXp, userId, onXpGain, lang]);

  return (
    <button
      onClick={handleCheckIn}
      disabled={checkedIn || checking}
      className={`w-full relative overflow-hidden rounded-xl p-4 flex items-center gap-4 transition-all ${
        checkedIn
          ? "bg-card border border-border opacity-60"
          : "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-[0.98]"
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
        checkedIn ? "bg-muted" : "bg-white/20"
      }`}>
        <Zap size={24} className={checkedIn ? "text-muted-foreground" : "text-white"} />
      </div>
      <div className="flex-1 text-left">
        <p className={`font-bold text-sm ${checkedIn ? "text-muted-foreground" : ""}`}>
          {checkedIn
            ? (lang === "zh" ? "今日已簽到 ✓" : "Checked in today ✓")
            : (lang === "zh" ? "每日簽到" : "Daily Check-in")}
        </p>
        <p className={`text-xs ${checkedIn ? "text-muted-foreground" : "text-white/70"}`}>
          {checkedIn
            ? (lang === "zh" ? "明天再來！" : "Come back tomorrow!")
            : (lang === "zh" ? `簽到獲得 +${CHECK_IN_XP} XP` : `Check in for +${CHECK_IN_XP} XP`)}
        </p>
      </div>
      {!checkedIn && (
        <span className="text-xl font-black">+{CHECK_IN_XP}</span>
      )}
    </button>
  );
};

export default DailyCheckIn;
