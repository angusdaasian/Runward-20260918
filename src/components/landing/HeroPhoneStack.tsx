import activitiesEn from "@/assets/appstore/activities-en.png.asset.json";
import activitiesZh from "@/assets/appstore/activities-zh.png.asset.json";
import analyticsEn from "@/assets/appstore/analytics-en.png.asset.json";
import analyticsZh from "@/assets/appstore/analytics-zh.png.asset.json";

type Lang = "en" | "zh";

const t = (zh: boolean, en: string, z: string) => (zh ? z : en);

const PhoneShell = ({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) => (
  <div className={`relative rounded-[2.2rem] bg-black p-[8px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ${className}`}>
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90px] h-[22px] bg-black rounded-b-2xl z-20" />
    <div className="relative rounded-[1.8rem] overflow-hidden bg-white">
      <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
    </div>
  </div>
);

const GlowCard = ({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className={`relative rounded-2xl border-2 border-primary/70 bg-zinc-900/80 backdrop-blur-md p-3.5 text-white ${className}`}
    style={{
      boxShadow:
        "0 0 0 1px hsl(var(--primary) / 0.4), 0 0 40px hsl(var(--primary) / 0.55), 0 0 90px hsl(var(--primary) / 0.35), 0 20px 50px rgba(0,0,0,0.5)",
      ...style,
    }}
  >
    <div
      className="absolute inset-0 rounded-2xl pointer-events-none opacity-60"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--primary) / 0.18), transparent 60%)",
      }}
    />
    <div className="relative">{children}</div>
  </div>
);

export default function HeroPhoneStack({ lang }: { lang: Lang }) {
  const zh = lang === "zh";
  const activities = zh ? activitiesZh.url : activitiesEn.url;
  const analytics = zh ? analyticsZh.url : analyticsEn.url;

  return (
    <div className="relative w-full max-w-[640px] aspect-[5/5] mx-auto md:mx-0">
      {/* Back phone — analytics, tilted */}
      <div
        className="absolute right-0 top-[8%] w-[55%] origin-bottom-right"
        style={{ transform: "rotate(-14deg)" }}
      >
        <PhoneShell src={analytics} alt="Analytics" />
      </div>

      {/* Front phone — activities */}
      <div
        className="absolute left-[6%] bottom-0 w-[58%]"
        style={{ transform: "rotate(-4deg)" }}
      >
        <PhoneShell src={activities} alt="Activities" />
      </div>

      {/* Floating HRV widget — top */}
      <GlowCard
        className="absolute top-0 left-[8%] w-[180px] sm:w-[210px]"
        style={{ transform: "rotate(-6deg)" }}
      >
        <div className="flex items-start justify-between">
          <div className="text-[10px] uppercase tracking-widest text-primary/90 font-semibold">
            HRV
          </div>
          <div className="text-[10px] text-white/60">
            {t(zh, "Today", "今日")}
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-4xl font-display font-bold text-primary leading-none">86</span>
          <span className="text-xs text-white/70">ms</span>
        </div>
        <div className="mt-1 text-[11px] text-white/60">
          {t(zh, "Moderate", "中等")}
        </div>
      </GlowCard>

      {/* Floating Steps / Today Stat widget — bottom right */}
      <GlowCard
        className="absolute bottom-[8%] right-[-2%] w-[200px] sm:w-[230px]"
        style={{ transform: "rotate(7deg)" }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-primary/90 font-semibold">
            {t(zh, "Daily Steps", "每日步數")}
          </div>
          <span className="text-base">👟</span>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-4xl font-display font-bold text-primary leading-none">5,382</span>
          <span className="text-xs text-white/70">{t(zh, "steps", "步")}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
          <div>
            <div className="text-white/50">{t(zh, "Calories", "卡路里")}</div>
            <div className="font-semibold text-white">171 <span className="text-white/50 font-normal">kcal</span></div>
          </div>
          <div>
            <div className="text-white/50">{t(zh, "Distance", "距離")}</div>
            <div className="font-semibold text-white">4.63 <span className="text-white/50 font-normal">km</span></div>
          </div>
        </div>
      </GlowCard>

      {/* Small VO2max chip — mid left */}
      <GlowCard
        className="absolute top-[42%] left-[-4%] w-[140px]"
        style={{ transform: "rotate(-10deg)" }}
      >
        <div className="text-[10px] uppercase tracking-widest text-primary/90 font-semibold">
          VO₂max
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-display font-bold text-primary leading-none">59.0</span>
          <span className="text-[10px] text-white/60">ml/kg/min</span>
        </div>
      </GlowCard>
    </div>
  );
}
