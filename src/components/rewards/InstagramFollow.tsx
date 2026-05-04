import { useEffect, useState, useCallback } from "react";
import { Instagram, Check } from "lucide-react";
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

const REWARD_KEY = "instagram_follow";
const REWARD_XP = 3000;
const IG_URL =
  "https://www.instagram.com/runward.app?igsh=dzBuaWpzaXlyOGRt&utm_source=qr";

const InstagramFollow = ({ lang, userId, currentXp, onXpGain }: Props) => {
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

    // Open Instagram in a new tab first (must be in user gesture)
    window.open(IG_URL, "_blank", "noopener,noreferrer");

    const { error: insertErr } = await supabase
      .from("social_rewards_claimed")
      .insert({ user_id: userId, reward_key: REWARD_KEY, xp_awarded: REWARD_XP });

    if (insertErr) {
      // Already claimed (unique violation) or other error
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
      particleCount: 250,
      spread: 110,
      origin: { y: 0.7 },
      colors: ["#E1306C", "#F77737", "#FCAF45", "#FFDC80", "#833AB4"],
    });

    onXpGain(newMonthly);
    setClaimed(true);
    setBusy(false);

    toast({
      title: lang === "zh" ? "感謝關注！" : "Thanks for following!",
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
          : "bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white shadow-lg shadow-[#E1306C]/25 hover:shadow-[#E1306C]/40 active:scale-[0.98]"
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${claimed ? "bg-muted" : "bg-white/20"}`}>
        {claimed ? <Check size={24} className="text-primary" /> : <Instagram size={24} className="text-white" />}
      </div>
      <div className="flex-1 text-left">
        <p className={`font-bold text-sm ${claimed ? "text-muted-foreground" : ""}`}>
          {claimed
            ? lang === "zh" ? "已領取 ✓" : "Claimed ✓"
            : lang === "zh" ? "關注 Instagram" : "Follow on Instagram"}
        </p>
        <p className={`text-xs ${claimed ? "text-muted-foreground" : "text-white/80"}`}>
          {claimed
            ? lang === "zh" ? "感謝你的支持！" : "Thanks for your support!"
            : lang === "zh" ? `關注 @runward.app 獲得 +${REWARD_XP} XP` : `Follow @runward.app for +${REWARD_XP} XP`}
        </p>
      </div>
      {!claimed && <span className="text-lg font-black">+{REWARD_XP}</span>}
    </button>
  );
};

export default InstagramFollow;
