import { useRef, useState } from "react";
import { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface RpeLevel {
  rpe: number;
  en: string;
  zh: string;
  /** bar fill colour */
  bar: string;
  /** text colour for the active label */
  text: string;
  /** soft chip background for the active label */
  chip: string;
}

export const RPE_LEVELS: RpeLevel[] = [
  { rpe: 1, en: "Very easy", zh: "非常輕鬆", bar: "bg-sky-400", text: "text-sky-600", chip: "bg-sky-500/10 border-sky-500/30" },
  { rpe: 2, en: "Easy", zh: "輕鬆", bar: "bg-teal-400", text: "text-teal-600", chip: "bg-teal-500/10 border-teal-500/30" },
  { rpe: 3, en: "Comfortable", zh: "舒適", bar: "bg-emerald-400", text: "text-emerald-600", chip: "bg-emerald-500/10 border-emerald-500/30" },
  { rpe: 4, en: "Steady", zh: "穩定", bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-500/10 border-emerald-500/30" },
  { rpe: 5, en: "Moderate", zh: "中等", bar: "bg-lime-500", text: "text-lime-700", chip: "bg-lime-500/10 border-lime-500/30" },
  { rpe: 6, en: "Somewhat hard", zh: "有點吃力", bar: "bg-yellow-500", text: "text-yellow-700", chip: "bg-yellow-500/10 border-yellow-500/30" },
  { rpe: 7, en: "Hard", zh: "吃力", bar: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-500/10 border-amber-500/30" },
  { rpe: 8, en: "Very hard", zh: "很辛苦", bar: "bg-orange-500", text: "text-orange-700", chip: "bg-orange-500/10 border-orange-500/30" },
  { rpe: 9, en: "Extremely hard", zh: "非常辛苦", bar: "bg-red-500", text: "text-red-600", chip: "bg-red-500/10 border-red-500/30" },
  { rpe: 10, en: "Max effort", zh: "全力衝刺", bar: "bg-rose-600", text: "text-rose-600", chip: "bg-rose-600/10 border-rose-600/30" },
];

const HINTS: Record<number, { en: string; zh: string }> = {
  1: { en: "Barely any effort, could go all day", zh: "幾乎不費力，可以一直跑" },
  3: { en: "Conversational, nose breathing", zh: "可輕鬆對話" },
  5: { en: "Challenging but can hold a conversation", zh: "有點吃力但還能對話" },
  7: { en: "Only short sentences", zh: "只能說短句" },
  8: { en: "Can only say a few words", zh: "只能說幾個字" },
  10: { en: "Cannot speak at all", zh: "完全無法說話" },
};

interface Props {
  lang: Lang;
  value: number | null;
  onChange: (rpe: number) => void;
  className?: string;
}

/** Colour-coded RPE bar (1–10). Tap or drag along the bar to pick effort. */
const RpeSlider = ({ lang, value, onChange, className }: Props) => {
  const zh = lang === "zh";
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const active = value ? RPE_LEVELS[value - 1] : null;

  const pick = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const next = Math.min(10, Math.max(1, Math.ceil(ratio * 10)));
    if (next !== value) onChange(next);
  };

  const hint = value ? HINTS[value] : undefined;

  return (
    <div className={cn("select-none", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={zh ? "自覺運動強度 RPE" : "Rate of Perceived Exertion"}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={value ?? undefined}
        className="flex gap-1 cursor-pointer touch-none py-1"
        onPointerDown={(e) => {
          setDragging(true);
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => dragging && pick(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(1, (value ?? 5) - 1));
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(10, (value ?? 5) + 1));
          }
        }}
      >
        {RPE_LEVELS.map((lvl) => {
          const filled = value !== null && lvl.rpe <= value;
          const isCurrent = value === lvl.rpe;
          return (
            <div key={lvl.rpe} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-full rounded-full transition-all",
                  isCurrent ? "h-6" : "h-4",
                  filled ? lvl.bar : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-mono tabular-nums transition-colors",
                  isCurrent ? cn("font-bold", lvl.text) : "text-muted-foreground",
                )}
              >
                {lvl.rpe}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 min-h-[42px]">
        {active ? (
          <div className={cn("inline-flex flex-col rounded-lg border px-3 py-1.5", active.chip)}>
            <span className={cn("text-sm font-semibold", active.text)}>
              RPE {active.rpe} · {zh ? active.zh : active.en}
            </span>
            {hint && (
              <span className="text-[11px] text-muted-foreground">{zh ? hint.zh : hint.en}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {zh ? "拖動或點擊上方色條選擇強度（1 = 非常輕鬆，10 = 全力衝刺）" : "Drag or tap the bar to rate the effort (1 = very easy, 10 = max effort)"}
          </p>
        )}
      </div>
    </div>
  );
};

export default RpeSlider;
