import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lang } from "@/lib/i18n";
import type { ActivityPhoto } from "@/hooks/use-activity-photos";

interface Props {
  lang: Lang;
  photos: ActivityPhoto[];
  loading: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (photo: ActivityPhoto) => Promise<void>;
}

const MAX_PHOTOS = 6;

const ActivityPhotos = ({ lang, photos, loading, uploading, onUpload, onRemove }: Props) => {
  const isZh = lang === "zh";
  const t = (en: string, zh: string) => (isZh ? zh : en);
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<ActivityPhoto | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      toast.error(t(`You can add up to ${MAX_PHOTOS} photos`, `最多可加入 ${MAX_PHOTOS} 張照片`));
      return;
    }
    if (files.some((f) => f.size > 10 * 1024 * 1024)) {
      toast.error(t("Each photo must be under 10MB", "每張照片需小於 10MB"));
      return;
    }
    try {
      await onUpload(files);
      toast.success(t("Photo added", "已加入照片"));
    } catch (err) {
      console.error("[ActivityPhotos] upload failed", err);
      toast.error(t("Could not upload the photo", "無法上傳照片"));
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Camera size={16} className="text-primary" />
          {t("Photos", "照片")}
        </h3>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading || photos.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {t("Add photo", "加入照片")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {loading ? (
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "Add your run photos — you can put your stats on top of them when you share.",
            "加入這次跑步的照片 — 分享時可以把數據疊在照片上。",
          )}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative group">
              <button
                type="button"
                onClick={() => setViewer(p)}
                className="block w-full aspect-square overflow-hidden rounded-lg border border-border"
              >
                <img src={p.url} alt={t("Run photo", "跑步照片")} className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                aria-label={t("Remove photo", "移除照片")}
                onClick={async () => {
                  try {
                    await onRemove(p);
                  } catch {
                    toast.error(t("Could not remove the photo", "無法移除照片"));
                  }
                }}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-destructive shadow-sm"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {viewer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setViewer(null)}
        >
          <button
            aria-label={t("Close", "關閉")}
            className="absolute right-4 top-4 rounded-full bg-background/90 p-2"
            onClick={() => setViewer(null)}
          >
            <X size={18} />
          </button>
          <img src={viewer.url} alt={t("Run photo", "跑步照片")} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default ActivityPhotos;
