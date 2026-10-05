import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

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
    if (!animatedOnce.current || display == null || !inView) {
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
  }, [inView, total]);

  return (
    <section className="border-y border-border bg-primary/5 px-6 py-14 md:py-20">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-4xl"
      >
        <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-foreground/35 bg-foreground px-4 py-12 text-center shadow-[0_5px_0_hsl(var(--foreground)/0.18)] sm:min-h-64 sm:px-8">
          {display == null ? (
            <div className="h-14 w-56 animate-pulse rounded bg-background/20 sm:h-20 sm:w-80" aria-label={zh ? "載入數據" : "Loading data"} />
          ) : (
            <div className="font-display text-5xl font-bold text-background tabular-nums sm:text-7xl md:text-8xl">
              {display.toLocaleString()}
            </div>
          )}
          <p className="mt-5 text-base text-background/80 sm:text-xl">
            {zh ? "已處理的活動及健康數據" : "Activities & health data processed"}
          </p>
        </div>
      </motion.div>
    </section>
  );
}
