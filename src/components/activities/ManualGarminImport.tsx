import { useState } from "react";
import { Link2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onImported: () => void;
  embedded?: boolean;
}

const ManualGarminImport = ({ lang, onImported, embedded = false }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const raw = url.trim();
    if (!raw) return;
    // Accept share-style text like:
    //   "Check out my track running activity on Garmin Connect. #beatyesterday https://connect.garmin.com/modern/activity/22465889243"
    // Extract the first Garmin Connect URL we find.
    const match = raw.match(/https?:\/\/[^\s]*garmin[^\s]*\/activity\/\d+[^\s]*/i)
      || raw.match(/https?:\/\/[^\s]*garmin[^\s]*/i);
    const cleanUrl = match ? match[0].replace(/[).,]+$/, "") : "";
    if (!cleanUrl || !/\/activity\/\d+/i.test(cleanUrl)) {
      toast.error(lang === "zh" ? "找不到有效的 Garmin 活動連結" : "Could not find a valid Garmin activity link");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-manual-import", {
        body: { url: cleanUrl },
      });
      // supabase.functions.invoke surfaces non-2xx responses on `error`,
      // but the JSON body (with our custom error/duplicate flag) is still in `data`.
      const payload: any = data ?? (error as any)?.context?.body ?? {};
      const isDuplicate = payload?.duplicate === true
        || /already been imported/i.test(payload?.error || "")
        || /similar activity already exists/i.test(payload?.error || "");

      if (isDuplicate) {
        const similarSrc: string | undefined = payload?.similar_source;
        const enMsg = similarSrc
          ? `A similar activity already exists from ${similarSrc}. Skipping to prevent duplicates.`
          : "This activity has already been imported by someone in the app.";
        const zhMsg = similarSrc
          ? `已存在相似活動（來自 ${similarSrc}），無法重複匯入`
          : "此活動已被應用程式中的其他使用者匯入過。";
        toast.error(lang === "zh" ? zhMsg : enMsg, { duration: 6000 });
      } else if (error || !payload?.success) {
        const msg = payload?.error || error?.message || "Import failed";
        toast.error(lang === "zh" ? `匯入失敗：${msg}` : msg);
      } else {
        const km = data.activity?.distance_km ?? 0;
        const xp = data.xp_gained ?? 0;
        toast.success(
          lang === "zh"
            ? `已匯入 ${km}km · 獲得 ${xp} XP`
            : `Imported ${km}km · +${xp} XP`,
        );
        const ahRemoved = data.apple_health_removed ?? 0;
        if (ahRemoved > 0) {
          toast.info(
            lang === "zh"
              ? `已移除 ${ahRemoved} 筆 Apple Health 活動。請繼續匯入 Garmin 活動以獲得更準確的數據。`
              : `Removed ${ahRemoved} Apple Health ${ahRemoved === 1 ? "activity" : "activities"}. Keep importing Garmin activities for better accuracy.`,
            { duration: 7000 },
          );
        }
        setUrl("");
        setExpanded(false);
        onImported();
      }
    } catch (err) {
      console.error("Manual import error:", err);
      toast.error(lang === "zh" ? "匯入失敗" : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const formBody = (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {lang === "zh"
          ? "在 Garmin Connect 將活動的隱私設定為「公開」，然後貼上連結（或整段「Check out my activity…」分享文字皆可）。我們會擷取距離、時間、配速、爬升、分段及路線地圖。"
          : "Set the activity to Public in Garmin Connect, then paste the link (or the full \"Check out my activity…\" share text — we'll find the URL). We'll extract distance, time, pace, ascent, laps and the route map."}
      </p>
      <textarea
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={lang === "zh"
          ? "貼上 Garmin 連結，或整段「Check out my activity…」分享文字"
          : "Paste Garmin link, or the full \"Check out my activity…\" share text"}
        disabled={loading}
        rows={3}
        maxLength={2000}
        className="w-full text-sm px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-y min-h-[72px] break-all"
      />
      <button
        onClick={handleImport}
        disabled={loading || !url.trim()}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-primary-foreground bg-primary disabled:opacity-50"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading
          ? (lang === "zh" ? "匯入中..." : "Importing...")
          : (lang === "zh" ? "匯入活動" : "Import Activity")}
      </button>
    </div>
  );

  if (embedded) return formBody;

  return (
    <div className="bg-card border border-border rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {lang === "zh" ? "手動匯入 Garmin 活動" : "Manually Import Garmin Activity"}
            </div>
            <div className="text-xs text-muted-foreground">
              {lang === "zh" ? "貼上公開活動連結" : "Paste a public activity link"}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          {formBody}
        </div>
      )}
    </div>
  );
};

export default ManualGarminImport;
