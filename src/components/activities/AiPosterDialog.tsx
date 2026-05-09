import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Sparkles, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { distributeImageBlob } from "@/lib/shareActivity";
import type { Lang } from "@/lib/i18n";

interface Stats {
  distanceKm: number;
  timeStr: string;
  paceStr: string;
  calories?: number | null;
  hr?: number | null;
  elevation?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: Stats;
  lang: Lang;
}

const STYLES: Array<{ id: string; en: string; zh: string }> = [
  { id: "bold_hype", en: "Bold Hype", zh: "熱血海報" },
  { id: "minimal_zen", en: "Minimal Zen", zh: "極簡禪意" },
  { id: "retro_magazine", en: "Retro Magazine", zh: "復古雜誌" },
];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function downscaleImage(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const img = await loadImage(file);
    const { width: w, height: h } = img;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    ctx.drawImage(img, 0, 0, tw, th);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const [, b64] = dataUrl.split(",");
    return { base64: b64, mimeType: "image/jpeg" };
  } catch {
    // Fallback: original file as-is.
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const result = r.result as string;
        const [meta, b64] = result.split(",");
        const mt = meta.match(/data:([^;]+)/)?.[1] || file.type || "image/jpeg";
        resolve({ base64: b64, mimeType: mt });
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
}

export default function AiPosterDialog({ open, onOpenChange, stats, lang }: Props) {
  const isZh = lang === "zh";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [style, setStyle] = useState("bold_hype");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      toast.error(isZh ? "圖片太大（上限 8MB）" : "Image too large (max 8MB)");
      return;
    }
    setFile(f);
    setResult(null);
    setPreview(URL.createObjectURL(f));
  };

  const generate = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const { base64, mimeType } = await downscaleImage(file, 1280, 0.82);
      const { data, error } = await supabase.functions.invoke("generate-share-poster", {
        body: { imageBase64: base64, mimeType, stats, stylePreset: style, lang },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const j = await ctx.json();
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.imageDataUrl;
      if (!url) throw new Error("No image returned");
      setResult(url);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || (isZh ? "生成失敗" : "Generation failed"));
    } finally {
      setLoading(false);
    }
  };

  const shareResult = async () => {
    if (!result) return;
    try {
      const res = await fetch(result);
      const blob = await res.blob();
      await distributeImageBlob(blob, `runward-poster-${Date.now()}.png`, lang);
    } catch {
      toast.error(isZh ? "無法分享" : "Unable to share");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            {isZh ? "AI 分享海報" : "AI Share Poster"}
          </DialogTitle>
          <DialogDescription>
            {isZh
              ? "上傳一張你的照片，AI 會生成附帶數據與勵志金句的分享海報。"
              : "Upload a photo of yourself — AI will generate a share poster with your stats and a motivational quote."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload area */}
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
            {!preview ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full aspect-[4/5] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50 transition"
              >
                <Upload size={28} />
                <span className="text-sm">{isZh ? "點擊上傳照片" : "Tap to upload photo"}</span>
                <span className="text-xs">{isZh ? "建議直立全身或半身照" : "Vertical full/half body works best"}</span>
              </button>
            ) : (
              <div className="relative rounded-xl overflow-hidden">
                <img src={result || preview} alt="" className="w-full" />
                {!result && (
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md bg-background/80 text-xs"
                  >
                    {isZh ? "更換" : "Change"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Style picker */}
          {!result && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {isZh ? "風格" : "Style"}
              </div>
              <div className="flex gap-2 flex-wrap">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      style === s.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-muted/70"
                    }`}
                  >
                    {isZh ? s.zh : s.en}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!result ? (
              <Button onClick={generate} disabled={!file || loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    {isZh ? "生成中（約 15 秒）..." : "Generating (~15s)..."}
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    {isZh ? "生成海報" : "Generate poster"}
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={generate} disabled={loading} className="flex-1">
                  <RefreshCw size={16} />
                  {isZh ? "重新生成" : "Regenerate"}
                </Button>
                <Button onClick={shareResult} className="flex-1">
                  <Share2 size={16} />
                  {isZh ? "分享 / 儲存" : "Share / Save"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
