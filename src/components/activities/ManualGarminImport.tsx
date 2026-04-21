import { useState } from "react";
import { Link2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import despia from "despia-native";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onImported: () => void;
  embedded?: boolean;
}

const GARMIN_ACTIVITY_URL_RE = /https?:\/\/[^\s"'<>]*garmin[^\s"'<>]*\/activity\/\d+[^\s"'<>]*/i;

const extractGarminActivityUrl = (value: string) => {
  const match = value.match(GARMIN_ACTIVITY_URL_RE) || value.match(/https?:\/\/[^\s"'<>]*garmin[^\s"'<>]*/i);
  const cleanUrl = match ? match[0].replace(/[).,]+$/, "") : "";
  return cleanUrl && /\/activity\/\d+/i.test(cleanUrl) ? cleanUrl : "";
};

const canUseDespiaClipboard = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("despia") || typeof (window as any).despia !== "undefined";
};

const readNativeClipboard = async () => {
  if (!canUseDespiaClipboard()) return "";
  try {
    const result = await despia("getclipboard://", ["clipboarddata"]);
    return typeof result?.clipboarddata === "string" ? result.clipboarddata : "";
  } catch {
    return "";
  }
};

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
    const cleanUrl = extractGarminActivityUrl(raw);
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
        onPaste={(e) => {
          // iOS WebKit (incl. Despia) often truncates pasted share text via the
          // default handler. Read the clipboard ourselves, preferring richer
          // formats so the full URL survives. Fall back to the browser default
          // if we can't read anything useful.
          const cd = e.clipboardData;
          if (!cd) return;

          // Try every available format and pick whichever yields the longest
          // string containing a Garmin activity link.
          const candidates: string[] = [];
          const types = Array.from(cd.types || []);
          for (const t of types) {
            try {
              const v = cd.getData(t);
              if (v) candidates.push(v);
            } catch {
              /* ignore */
            }
          }

          // Extract URL from any HTML payload as well (often contains the full
          // link even when text/plain is truncated).
          const htmlPayload = candidates.find((c) => /<a\s|href=/i.test(c));
          if (htmlPayload) {
            const hrefMatch = htmlPayload.match(/href=["']([^"']*garmin[^"']*\/activity\/\d+[^"']*)["']/i);
            if (hrefMatch) candidates.push(hrefMatch[1]);
          }

          // Prefer the longest candidate that contains a Garmin activity URL.
          // If the WebView only exposes truncated text without the URL, do not
          // prevent the browser's native paste — native paste can still include
          // the full share text on iOS/Despia.
          const withGarmin = candidates.filter((c) => /garmin[^\s]*\/activity\/\d+/i.test(c));
          const best = withGarmin.sort((a, b) => b.length - a.length)[0];

          if (!best) {
            const target = e.currentTarget;
            window.setTimeout(() => {
              void (async () => {
                const nativeText = await readNativeClipboard();
                if (!extractGarminActivityUrl(nativeText) || extractGarminActivityUrl(target.value)) return;
                setUrl(nativeText);
              })();
            }, 0);
            return; // let browser default paste run, then repair via native clipboard if possible
          }

          e.preventDefault();
          const target = e.currentTarget;
          const start = target.selectionStart ?? url.length;
          const end = target.selectionEnd ?? url.length;
          const next = url.slice(0, start) + best + url.slice(end);
          setUrl(next);
        }}
        placeholder={lang === "zh"
          ? "貼上 Garmin 連結,或整段「Check out my activity…」分享文字"
          : "Paste Garmin link, or the full \"Check out my activity…\" share text"}
        disabled={loading}
        rows={3}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full text-sm px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-y min-h-[72px] whitespace-pre-wrap break-words"
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
