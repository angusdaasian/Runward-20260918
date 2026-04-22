import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";

interface Banner {
  id: string;
  image_url: string;
  link_url: string | null;
  caption: string | null;
  caption_zh: string | null;
}

interface Props {
  lang: Lang;
  userId?: string | null;
  /** When true, bypass the once-per-day check (admin preview / manual trigger). */
  forceShow?: boolean;
  /** Bumping this number re-runs the open logic even if already seen today. */
  triggerKey?: number;
  /** Called when the banner closes (used for preview / manual trigger mode). */
  onClose?: () => void;
}

const STORAGE_PREFIX = "promo_banner_seen_";

// Expose a helper so admins can re-trigger from the manager.
export const clearPromoBannerSeen = (userId?: string | null) => {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${userId ?? "guest"}`);
  } catch {
    /* ignore */
  }
};

const todayKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const PromoBanner = ({ lang, userId, forceShow = false, triggerKey = 0, onClose }: Props) => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  // swipe state
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    // Manual trigger: any non-zero key bypasses the daily seen flag
    const manualTrigger = triggerKey > 0;
    if (!forceShow && !manualTrigger) {
      const seenKey = `${STORAGE_PREFIX}${userId ?? "guest"}`;
      const lastSeen = localStorage.getItem(seenKey);
      if (lastSeen === todayKey()) return;
    }

    let cancelled = false;
    const fetchBanners = async () => {
      const { data, error } = await supabase
        .from("promo_banners")
        .select("id, image_url, link_url, caption, caption_zh")
        .eq("is_active", true)
        .gt("ends_at", new Date().toISOString())
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[PromoBanner] fetch error", error);
        return;
      }
      const list = (data as Banner[]) || [];
      if (list.length > 0) {
        setBanners(list);
        setCurrent(0);
        setOpen(true);
      }
    };
    fetchBanners();
    return () => {
      cancelled = true;
    };
  }, [userId, forceShow, triggerKey]);

  const handleClose = useCallback(() => {
    // Only persist "seen today" on the natural auto-open. Manual trigger and
    // admin preview should not affect the daily flag.
    if (!forceShow && triggerKey === 0) {
      const seenKey = `${STORAGE_PREFIX}${userId ?? "guest"}`;
      localStorage.setItem(seenKey, todayKey());
    }
    setOpen(false);
    onClose?.();
  }, [userId, forceShow, triggerKey, onClose]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowLeft") setCurrent((c) => Math.max(0, c - 1));
      else if (e.key === "ArrowRight") setCurrent((c) => Math.min(banners.length - 1, c + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, banners.length, handleClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (banners.length <= 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (banners.length <= 1 || touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    setDragOffset(touchDeltaX.current);
  };
  const onTouchEnd = () => {
    if (banners.length <= 1 || touchStartX.current === null) return;
    const threshold = 50;
    if (touchDeltaX.current < -threshold && current < banners.length - 1) {
      setCurrent(current + 1);
    } else if (touchDeltaX.current > threshold && current > 0) {
      setCurrent(current - 1);
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
    setDragOffset(0);
  };

  if (!open || banners.length === 0) return null;

  const banner = banners[current];
  const caption = lang === "zh" && banner.caption_zh ? banner.caption_zh : banner.caption;
  const hasMultiple = banners.length > 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md mx-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-muted active:scale-90 transition-all"
        >
          <X size={18} />
        </button>

        {/* Image carousel */}
        <div
          className="relative overflow-hidden rounded-2xl shadow-2xl bg-card touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(calc(${-current * 100}% + ${dragOffset}px))`,
              transitionDuration: dragOffset === 0 ? "300ms" : "0ms",
            }}
          >
            {banners.map((b) => {
              const cap = lang === "zh" && b.caption_zh ? b.caption_zh : b.caption;
              const failed = imgError[b.id];
              const inner = (
                <div className="w-full shrink-0 bg-muted">
                  {failed ? (
                    <div className="w-full aspect-[4/5] flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                      <span className="text-sm">Image failed to load</span>
                      <span className="text-[10px] mt-1 break-all opacity-60">{b.image_url}</span>
                    </div>
                  ) : (
                    <img
                      src={b.image_url}
                      alt={cap || "Promotion"}
                      className="w-full h-auto block select-none"
                      draggable={false}
                      onError={() => {
                        console.error("[PromoBanner] image failed", b.image_url);
                        setImgError((s) => ({ ...s, [b.id]: true }));
                      }}
                    />
                  )}
                </div>
              );
              return b.link_url ? (
                <a
                  key={b.id}
                  href={b.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleClose}
                  className="w-full shrink-0"
                >
                  {inner}
                </a>
              ) : (
                <div key={b.id} className="w-full shrink-0">
                  {inner}
                </div>
              );
            })}
          </div>

          {/* Swipe arrows (multi only) */}
          {hasMultiple && current > 0 && (
            <button
              onClick={() => setCurrent(current - 1)}
              aria-label="Previous"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/70 backdrop-blur flex items-center justify-center text-foreground hover:bg-background/90 active:scale-90 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {hasMultiple && current < banners.length - 1 && (
            <button
              onClick={() => setCurrent(current + 1)}
              aria-label="Next"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/70 backdrop-blur flex items-center justify-center text-foreground hover:bg-background/90 active:scale-90 transition-all"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        {/* Caption */}
        {caption && (
          <p className="mt-3 text-center text-xs text-white/90 px-4">{caption}</p>
        )}

        {/* Pagination dots (multi only) */}
        {hasMultiple && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                onClick={() => setCurrent(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === current ? "w-6 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PromoBanner;
