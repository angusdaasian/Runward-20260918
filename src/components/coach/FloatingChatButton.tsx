import { useEffect, useRef, useState, useCallback } from "react";
import { MessageCircle, X, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import ChatModal from "./ChatModal";
import PlanComparisonDialog from "@/components/PlanComparisonDialog";

interface Props {
  lang: "en" | "zh";
}

type Pos = { x: number; y: number };

const POS_KEY = "ai_coach_btn_pos";
const BTN_SIZE_MOBILE = 56;
const BTN_SIZE_DESKTOP = 64;
const EDGE_PADDING = 12;

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {}
}

function clampToViewport(p: Pos, size: number): Pos {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.min(Math.max(p.x, EDGE_PADDING), w - size - EDGE_PADDING),
    y: Math.min(Math.max(p.y, EDGE_PADDING), h - size - EDGE_PADDING),
  };
}

const FloatingChatButton = ({ lang }: Props) => {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const [open, setOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [size, setSize] = useState(
    typeof window !== "undefined" && window.innerWidth >= 640
      ? BTN_SIZE_DESKTOP
      : BTN_SIZE_MOBILE,
  );
  const [pos, setPos] = useState<Pos>(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const s = w >= 640 ? BTN_SIZE_DESKTOP : BTN_SIZE_MOBILE;
    const saved = loadPos();
    if (saved) return clampToViewport(saved, s);
    // default: bottom-right above bottom nav
    return { x: w - s - 16, y: h - s - 96 };
  });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    startTime: number;
  } | null>(null);

  // Resize handling
  useEffect(() => {
    const onResize = () => {
      const newSize =
        window.innerWidth >= 640 ? BTN_SIZE_DESKTOP : BTN_SIZE_MOBILE;
      setSize(newSize);
      setPos((p) => clampToViewport(p, newSize));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (open) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const rect = target.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
      startTime: Date.now(),
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const next = clampToViewport(
      { x: e.clientX - s.offsetX, y: e.clientY - s.offsetY },
      size,
    );
    const dx = Math.abs(next.x - pos.x);
    const dy = Math.abs(next.y - pos.y);
    if (!s.moved && (dx > 4 || dy > 4)) {
      s.moved = true;
      setDragging(true);
    }
    if (s.moved) setPos(next);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const s = dragStateRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    const wasDrag = s.moved;
    setDragging(false);

    if (wasDrag) {
      // Snap to nearest edge
      const w = window.innerWidth;
      const centerX = pos.x + size / 2;
      const snapX =
        centerX < w / 2 ? EDGE_PADDING : w - size - EDGE_PADDING;
      const snapped = clampToViewport({ x: snapX, y: pos.y }, size);
      setPos(snapped);
      savePos(snapped);
    } else {
      // Treat as tap
      handleClick();
    }
  };

  const handleClick = useCallback(() => {
    if (!user) return;
    setOpen((v) => !v);
  }, [user]);

  if (!user) return null;

  const tooltip = lang === "zh" ? "與 AI 教練聊天" : "Chat with AI Coach";

  return (
    <>
      <button
        type="button"
        aria-label={tooltip}
        title={tooltip}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
          setDragging(false);
        }}
        className={`fixed select-none touch-none rounded-full shadow-lg shadow-primary/30 flex items-center justify-center
          bg-gradient-to-br from-primary to-primary/70 text-primary-foreground
          hover:scale-105 active:scale-95
          ${dragging ? "" : "transition-all duration-300 ease-out"}
          ${!open && !dragging ? "animate-coach-bounce" : ""}`}
        style={{
          left: pos.x,
          top: pos.y,
          width: size,
          height: size,
          zIndex: 9999,
          touchAction: "none",
        }}
      >
        {open ? (
          <X size={size === BTN_SIZE_DESKTOP ? 28 : 24} strokeWidth={2.5} />
        ) : (
          <MessageCircle size={size === BTN_SIZE_DESKTOP ? 28 : 24} strokeWidth={2} />
        )}
        {!isPremium && !open && (
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center">
            <Lock size={12} className="text-primary" />
          </span>
        )}
      </button>

      <ChatModal open={open} onClose={() => setOpen(false)} lang={lang} />
      <PlanComparisonDialog open={showUpgrade} onOpenChange={setShowUpgrade} lang={lang} />
    </>
  );
};

export default FloatingChatButton;
