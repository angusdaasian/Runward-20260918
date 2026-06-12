import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import poweredByStrava from "@/assets/brands/powered-by-strava.svg.asset.json";
import suuntoLogo from "@/assets/brands/suunto.png.asset.json";
import garminLogo from "@/assets/brands/garmin.png.asset.json";
import corosLogo from "@/assets/brands/coros.png.asset.json";
import polarLogo from "@/assets/brands/polar.png.asset.json";
import appleHealthLogo from "@/assets/brands/apple-health.png.asset.json";

interface Props {
  lang: "en" | "zh";
}

const brands = [
  { src: poweredByStrava.url, alt: "Powered by Strava", h: "h-7 md:h-9", invert: false },
  { src: garminLogo.url, alt: "Garmin", h: "h-8 md:h-10", invert: true },
  { src: suuntoLogo.url, alt: "Suunto", h: "h-9 md:h-11", invert: true },
  { src: corosLogo.url, alt: "COROS", h: "h-8 md:h-10", invert: true, offset: "translate-y-1 md:translate-y-1.5" },
  { src: polarLogo.url, alt: "Polar", h: "h-6 md:h-8", invert: true },
  { src: appleHealthLogo.url, alt: "Works with Apple Health", h: "h-9 md:h-12", invert: true },
];

export default function BrandStrip({ lang }: Props) {
  const isZh = lang === "zh";

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
    const card = el.querySelector<HTMLElement>("[data-brand]");
    const step = card ? card.offsetWidth + 40 : el.clientWidth * 0.6;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className="border-y border-border bg-card/50 overflow-hidden">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-center text-[11px] font-semibold tracking-[0.18em] text-muted-foreground/80 uppercase mb-6">
          {isZh ? "支援的平台" : "Works with"}
        </p>

        <div className="relative">
          <div
            ref={scrollerRef}
            className="flex items-center gap-10 md:gap-14 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none scroll-smooth px-12"
            style={{ scrollbarWidth: "none" }}
          >
            {brands.map((b) => (
              <div
                key={b.alt}
                data-brand
                className="snap-start shrink-0 flex items-center justify-center min-w-[110px] md:min-w-[140px]"
              >
                <img
                  src={b.src}
                  alt={b.alt}
                  loading="lazy"
                  className={`${b.h} w-auto object-contain opacity-90 hover:opacity-100 transition-opacity ${
                    b.invert ? "dark:invert" : ""
                  } ${b.offset ?? ""}`}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            aria-label={isZh ? "上一個" : "Previous"}
            onClick={() => scrollBy(-1)}
            disabled={!canPrev}
            className="flex absolute -left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-background border border-border shadow-lg shadow-foreground/10 hover:bg-muted transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={isZh ? "下一個" : "Next"}
            onClick={() => scrollBy(1)}
            disabled={!canNext}
            className="flex absolute -right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-background border border-border shadow-lg shadow-foreground/10 hover:bg-muted transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
