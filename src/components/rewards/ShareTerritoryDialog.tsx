import { useRef, useState, useEffect } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ShareTerritoryCard from "./ShareTerritoryCard";

interface Hex {
  hex_id: string;
  owner_user_id: string;
  captured_at: string;
  region: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hexes: Hex[];
  displayName: string;
  lang: "en" | "zh";
}

const ShareTerritoryDialog = ({ open, onOpenChange, hexes, displayName, lang }: Props) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const w = wrapRef.current?.clientWidth ?? 400;
      setScale(w / 1080);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  const generate = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      width: 1080,
      height: 1350,
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await generate();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `territory-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(lang === "zh" ? "已下載" : "Downloaded");
    } catch (e) {
      console.error(e);
      toast.error(lang === "zh" ? "生成失敗" : "Failed to generate");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await generate();
      if (!blob) return;
      const file = new File([blob], "territory.png", { type: "image/png" });
      const shareData: ShareData = {
        files: [file],
        title: lang === "zh" ? "我的跑步領地" : "My Running Territory",
        text:
          lang === "zh"
            ? "看看我在 Runners Hub 佔領的地塊!"
            : "Check out the territory I've claimed on Runners Hub!",
      };
      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await handleDownload();
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error(e);
        toast.error(lang === "zh" ? "分享失敗" : "Share failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4">
        <DialogHeader>
          <DialogTitle>
            {lang === "zh" ? "分享你的領地" : "Share your territory"}
          </DialogTitle>
        </DialogHeader>

        <div
          ref={wrapRef}
          className="relative w-full overflow-hidden rounded-xl bg-muted/30"
          style={{ height: scale * 1350 }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <ShareTerritoryCard
              ref={cardRef}
              hexes={hexes}
              displayName={displayName}
              lang={lang}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button onClick={handleShare} disabled={busy} className="flex-1">
            {busy ? <Loader2 className="animate-spin mr-2" size={14} /> : <Share2 className="mr-2" size={14} />}
            {lang === "zh" ? "分享" : "Share"}
          </Button>
          <Button onClick={handleDownload} disabled={busy} variant="outline" className="flex-1">
            <Download className="mr-2" size={14} />
            {lang === "zh" ? "下載" : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareTerritoryDialog;
