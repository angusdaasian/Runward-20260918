import { useEffect, useState, useCallback } from "react";
import { Star, Check } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";

interface Props {
  lang: Lang;
  userId: string;
  currentXp: number;
  onXpGain: (newXp: number) => void;
}

const REWARD_KEY = "rate_app";
const REWARD_XP = 5000;
const APP_STORE_URL =
  "https://apps.apple.com/us/app/runward/id6761060757?action=write-review";

const RateAppReward = ({ lang, userId, currentXp, onXpGain }: Props) => {
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("social_rewards_claimed")
        .select("id")
        .eq("user_id", userId)
        .eq("reward_key", REWARD_KEY)
        .maybeSingle();
      setClaimed(!!data);
    })();
  }, [userId]);

  const handleClick = useCallback(async () => {
    if (busy || claimed) return;
    setBusy(true);

    // Open App Store review page in user gesture
    window.open(APP_STORE_URL, "_blank", "noopener,noreferrer");

    const { error: insertErr } = await supabase
      .from("social_rewards_claimed")
      .insert({ user_id: userId, reward_key: REWARD_KEY, xp_awarded: REWARD_XP });

    if (insertErr) {
      if ((insertErr as any).code === "23505") {
        setClaimed(true);
      } else {
        toast({ title: "Error", description: insertErr.message, variant: "destructive" });
      }
      setBusy(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("monthly_xp, lifetime_xp")
      .eq("user_id", userId)
      .single();

    const newMonthly = (profile?.monthly_xp ?? currentXp) + REWARD_XP;
    const newLifetime = (profile?.lifetime_xp ?? 0) + REWARD_XP;

    await supabase
      .from("profiles")
      .update({ monthly_xp: newMonthly, lifetime_xp: newLifetime })
      .eq("user_id", userId);

    confetti({
      particleCount: 300,
      spread: 120,
      origin: { y: 0.7 },
      colors: ["#FFD700", "#FFA500", "#FF8C00", "#FFC107", "#FFEB3B"],
    });

    onXpGain(newMonthly);
    setClaimed(true);
    setBusy(false);

    toast({
      title: lang === "zh" ? "感謝你的評分！" : "Thanks for rating!",
      description: lang === "zh" ? `+${REWARD_XP} XP 已加到你的賬戶` : `+${REWARD_XP} XP added to your account`,
    });
  }, [busy, claimed, userId, currentXp, onXpGain, lang]);

  if (claimed === null) return null;

  return (
    <button
      onClick={handleClick}
      disabled={busy || claimed}
      className={`w-full relative overflow-hidden rounded-xl p-4 flex items-center gap-4 transition-all ${
        claimed
          ? "bg-card border border-border opacity-70"
          : "bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 active:scale-[0.98]"
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${claimed ? "bg-muted" : "bg-white/20"}`}>
        {claimed ? <Check size={24} className="text-primary" /> : <Star size={24} className="text-white fill-white" />}
      </div>
      <div className="flex-1 text-left">
        <p className={`font-bold text-sm ${claimed ? "text-muted-foreground" : ""}`}>
          {claimed
            ? lang === "zh" ? "已領取 ✓" : "Claimed ✓"
            : lang === "zh" ? "為 Runward 評分" : "Rate Runward"}
        </p>
        <p className={`text-xs ${claimed ? "text-muted-foreground" : "text-white/90"}`}>
          {claimed
            ? lang === "zh" ? "感謝你的支持！" : "Thanks for your support!"
            : lang === "zh" ? `在 App Store 留下評價獲得 +${REWARD_XP} XP` : `Leave a review on the App Store for +${REWARD_XP} XP`}
        </p>
      </div>
      {!claimed && <span className="text-lg font-black">+{REWARD_XP}</span>}
    </button>
  );
};

export default RateAppReward;
