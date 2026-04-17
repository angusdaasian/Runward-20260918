import { useState } from "react";
import { Link2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onImported: () => void;
}

const ManualGarminImport = ({ lang, onImported }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/garmin/i.test(trimmed)) {
      toast.error(lang === "zh" ? "請貼上 Garmin Connect 的活動連結" : "Please paste a Garmin Connect activity link");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("garmin-manual-import", {
        body: { url: trimmed },
      });
      if (error || !data?.success) {
        const msg = data?.error || error?.message || "Import failed";
        toast.error(lang === "zh" ? `匯入失敗：${msg}` : msg);
      } else {
        const km = data.activity?.distance_km ?? 0;
        const xp = data.xp_gained ?? 0;
        toast.success(
          lang === "zh"
            ? `已匯入 ${km}km · 獲得 ${xp} XP`
            : `Imported ${km}km · +${xp} XP`,
        );
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
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {lang === "zh"
              ? "在 Garmin Connect 將活動的隱私設定為「公開」，然後將連結貼到這裡。我們會擷取距離、時間、配速、爬升及分段資料，並更新你的月度 XP 與排行榜。"
              : "Set the activity to Public in Garmin Connect, then paste the link below. We'll extract distance, time, pace, ascent and lap data, then update your monthly XP and leaderboard."}
          </p>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://connect.garmin.com/modern/activity/..."
            disabled={loading}
            className="w-full text-sm px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
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
      )}
    </div>
  );
};

export default ManualGarminImport;
