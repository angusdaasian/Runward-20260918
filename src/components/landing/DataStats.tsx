import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Database } from "lucide-react";

interface Props {
  lang: "en" | "zh";
}

const POLL_MS = 60_000;

export default function DataStats({ lang }: Props) {
  const zh = lang === "zh";
  const [total, setTotal] = useState<number | null>(null);
  const [display, setDisplay] = useState(0);
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

  // Animate toward the latest total (first time: count up; later: quick catch-up)
  useEffect(() => {
    if (!inView || total == null) return;
    const from = animatedOnce.current ? display : 0;
    animatedOnce.current = true;
    if (from === total) {
      setDisplay(total);
      return;
    }
    const duration = animatedOnce.current && from > 0 ? 800 : 1600;
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

  if (total == null) return null;

  return (
    <section className="px-6 py-14 md:py-20 border-y border-border bg-card/30">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
          <Database className="h-3.5 w-3.5" />
          {zh ? "即時數據" : "Live data"}
        </div>
        <div className="font-display text-5xl md:text-7xl font-bold tracking-tight tabular-nums">
          {display.toLocaleString()}
        </div>
        <p className="text-muted-foreground mt-3 text-sm md:text-base">
          {zh
            ? "筆跑步活動與健康數據已同步處理 — 而且持續增加中。"
            : "activities & health records synced and processed — and counting."}
        </p>
      </motion.div>
    </section>
  );
}
