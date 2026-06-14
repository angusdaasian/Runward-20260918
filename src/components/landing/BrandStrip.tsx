import poweredByStrava from "@/assets/brands/powered-by-strava.svg.asset.json";
import suuntoLogo from "@/assets/brands/suunto.png.asset.json";
import garminLogo from "@/assets/brands/garmin.png.asset.json";
import corosLogo from "@/assets/brands/coros.png.asset.json";
import polarLogo from "@/assets/brands/polar.png.asset.json";
import appleHealthLogo from "@/assets/brands/apple-health.png.asset.json";
import intervalsLogo from "@/assets/brands/intervals-icu.png.asset.json";

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
  { src: intervalsLogo.url, alt: "intervals.icu", h: "h-8 md:h-10", invert: false },
];

export default function BrandStrip({ lang }: Props) {
  const isZh = lang === "zh";
  const loop = [...brands, ...brands];

  return (
    <section className="border-y border-border bg-card/50 overflow-hidden">
      <style>{`
        @keyframes brand-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .brand-marquee-track {
          animation: brand-marquee 32s linear infinite;
          width: max-content;
        }
        .brand-marquee-mask {
          mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
        }
      `}</style>
      <div className="relative max-w-6xl mx-auto px-6 py-10">
        <p className="text-center text-[11px] font-semibold tracking-[0.18em] text-muted-foreground/80 uppercase mb-6">
          {isZh ? "支援的平台" : "Works with"}
        </p>

        <div className="brand-marquee-mask overflow-hidden">
          <div className="brand-marquee-track flex items-center gap-10 md:gap-14">
            {loop.map((b, i) => (
              <div
                key={`${b.alt}-${i}`}
                className="shrink-0 flex items-center justify-center min-w-[110px] md:min-w-[140px]"
                aria-hidden={i >= brands.length}
              >
                <img
                  src={b.src}
                  alt={b.alt}
                  loading="lazy"
                  className={`${b.h} w-auto object-contain opacity-90 ${
                    b.invert ? "dark:invert" : ""
                  } ${b.offset ?? ""}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
