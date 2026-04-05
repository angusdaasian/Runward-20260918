import { useEffect, useState } from "react";
import { Gift, Ticket } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useDespiaPurchases } from "@/hooks/use-despia-purchases";
import { Button } from "@/components/ui/button";

interface Props {
  lang: Lang;
  userId: string;
}

interface RewardCode {
  id: string;
  code_string: string;
  month_year: string | null;
}

const ClaimRewards = ({ lang, userId }: Props) => {
  const [rewards, setRewards] = useState<RewardCode[]>([]);
  const { redeemOfferCode } = useDespiaPurchases();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("used_codes")
        .select("id, code_string, month_year")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setRewards(data as RewardCode[]);
    };
    fetch();
  }, [userId]);

  if (rewards.length === 0) return null;

  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-2 border-amber-500/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gift size={18} className="text-amber-500" />
        <h3 className="text-sm font-bold text-foreground">
          {lang === "zh" ? "🎉 恭喜！你上個月表現出色！" : "🎉 Congrats! You dominated last month!"}
        </h3>
      </div>

      <div className="space-y-3">
        {rewards.map((r) => (
          <div
            key={r.id}
            className="bg-card/80 rounded-lg p-3 border border-border"
          >
            <p className="text-xs text-muted-foreground mb-1">
              {r.month_year ? `${lang === "zh" ? "月份" : "Month"}: ${r.month_year}` : ""}
            </p>
            <p className="text-sm text-foreground mb-2">
              {lang === "zh" ? "你的 App Store 兌換碼：" : "Your App Store Redeem Code:"}
            </p>
            <code className="block bg-muted px-3 py-2 rounded-lg text-sm font-mono font-bold text-foreground tracking-wider text-center">
              {r.code_string}
            </code>
            <Button
              variant="default"
              size="sm"
              className="w-full mt-3 gap-2"
              onClick={() => redeemOfferCode(r.code_string, lang)}
            >
              <Ticket size={14} />
              {lang === "zh" ? "兌換代碼" : "Redeem Code"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClaimRewards;
