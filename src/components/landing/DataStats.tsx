import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

interface Props {
  lang: "en" | "zh";
}

const POLL_MS = 60_000;

export default function DataStats({ lang }: Props) {
  const zh = lang === "zh";
  const [total, setTotal] = useState<number | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const animatedOnce = useRef(false);
  const reducedMotion = useReducedMotion();

  // Fetch on load, then poll so the count updates as new data arrives
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-stats`;
      fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && typeof d?.total === "number" && d.total > 0) setTotal(d.total);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Show the first real value immediately, then animate only later live updates.
  useEffect(() => {
    if (total == null) return;
    if (!animatedOnce.current || display == null || !inView || reducedMotion) {
      animatedOnce.current = true;
      setDisplay(total);
      return;
    }
    const from = display;
    if (from === total) {
      setDisplay(total);
      return;
    }
    const duration = 800;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (total - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, total, reducedMotion]);

  return (
    <section aria-label={zh ? "已處理數據" : "Data processed"} className="px-6 py-6 md:py-8">
      <div ref={ref} className="mx-auto flex max-w-4xl flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center text-sm sm:text-base">
          <p className="font-medium text-foreground">
            {zh ? "已處理的活動及健康數據：" : "Activities & health data processed:"}
          </p>
          {display == null ? (
            <span className="inline-block min-w-[7ch] text-left text-muted-foreground" aria-label={zh ? "載入數據" : "Loading data"}>—</span>
          ) : (
            <span className="inline-flex min-w-[7ch] overflow-hidden text-left font-medium leading-normal text-muted-foreground tabular-nums" aria-label={display.toLocaleString("en-US")}>
              {display.toLocaleString("en-US").split("").map((digit, index) => (
                <motion.span key={`${index}-${digit}`} initial={false} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.2 }} aria-hidden="true">{digit}</motion.span>
              ))}
            </span>
          )}
      </div>
    </section>
  );
}
