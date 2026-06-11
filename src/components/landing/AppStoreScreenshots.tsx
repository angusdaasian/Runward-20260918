import { motion } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import en1 from "@/assets/appstore/en-1.png.asset.json";
import en2 from "@/assets/appstore/en-2.png.asset.json";
import en3 from "@/assets/appstore/en-3.png.asset.json";
import en4 from "@/assets/appstore/en-4.png.asset.json";
import en5 from "@/assets/appstore/en-5.png.asset.json";
import zh1 from "@/assets/appstore/zh-1.png.asset.json";
import zh2 from "@/assets/appstore/zh-2.png.asset.json";
import zh3 from "@/assets/appstore/zh-3.png.asset.json";
import zh4 from "@/assets/appstore/zh-4.png.asset.json";
import zh5 from "@/assets/appstore/zh-5.png.asset.json";

const en = [en1, en2, en3, en4, en5];
const zh = [zh1, zh2, zh3, zh4, zh5];

interface Props {
  lang: "en" | "zh";
}

export default function AppStoreScreenshots({ lang }: Props) {
  const isZh = lang === "zh";
  const shots = isZh ? zh : en;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateButtons();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, [updateButtons]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-shot]");
    const step = card ? card.offsetWidth + 28 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className="px-6 py-20 md:py-28 bg-card/30 border-y border-border overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
            {isZh ? "App Store 預覽" : "On the App Store"}
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            {isZh ? "看看應用內部" : "A look inside the app"}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            {isZh
              ? "從追蹤、訓練到分析,一切都為跑者而設計。"
              : "From tracking to training to analytics — built end-to-end for runners."}
          </p>
        </div>

        <div className="relative">
          <div
            ref={scrollerRef}
            className="flex gap-5 md:gap-7 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-none scroll-smooth"
            style={{ scrollbarWidth: "none" }}
          >
            {shots.map((s, i) => (
              <motion.div
                key={i}
                data-shot
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="snap-start shrink-0 w-[220px] md:w-[260px] rounded-2xl overflow-hidden shadow-xl shadow-foreground/10 ring-1 ring-border bg-background"
              >
                <img
                  src={s.url}
                  alt={`App Store screenshot ${i + 1}`}
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </motion.div>
            ))}
          </div>

          <button
            type="button"
            aria-label={isZh ? "上一張" : "Previous"}
            onClick={() => scrollBy(-1)}
            disabled={!canPrev}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-background border border-border shadow-lg shadow-foreground/10 hover:bg-muted transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={isZh ? "下一張" : "Next"}
            onClick={() => scrollBy(1)}
            disabled={!canNext}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-background border border-border shadow-lg shadow-foreground/10 hover:bg-muted transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
