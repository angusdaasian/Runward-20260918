import { useState } from "react";
import { Activity, Shield, MapPin, LineChart, Footprints } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import poweredByStrava from "@/assets/brands/powered-by-strava.svg.asset.json";
import suuntoLogo from "@/assets/brands/suunto.png.asset.json";
import garminLogo from "@/assets/brands/garmin.png.asset.json";
import corosLogo from "@/assets/brands/coros.png.asset.json";
import polarLogo from "@/assets/brands/polar.png.asset.json";
import appleHealthLogo from "@/assets/brands/apple-health.png.asset.json";
import intervalsLogo from "@/assets/brands/intervals-icu.png.asset.json";
import appStoreBadge from "@/assets/app-store-badge.png";

const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

type Lang = "en" | "zh";

const brands = [
  { src: poweredByStrava.url, alt: "Powered by Strava", invert: false },
  { src: garminLogo.url, alt: "Garmin", invert: true },
  { src: suuntoLogo.url, alt: "Suunto", invert: true },
  { src: corosLogo.url, alt: "COROS", invert: true },
  { src: polarLogo.url, alt: "Polar", invert: true },
  { src: appleHealthLogo.url, alt: "Apple Health", invert: true },
  { src: intervalsLogo.url, alt: "intervals.icu", invert: false },
];

const ReviewLanding = () => {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("app_lang") as Lang) || "en",
  );
  const zh = lang === "zh";
  const toggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };

  const features = [
    {
      icon: Footprints,
      title: zh ? "跑姿分析" : "Posture Analysis",
      desc: zh
        ? "上載跑步影片，逐幀分析步頻、著地方式、身體傾斜與擺臂，找出可改善的技術細節。"
        : "Upload a short running video and get a frame-by-frame breakdown of cadence, foot strike, torso lean and arm swing to refine your form.",
    },
    {
      icon: Shield,
      title: zh ? "受傷儀表板" : "Injury Dashboard",
      desc: zh
        ? "整合訓練量、恢復狀態與睡眠，計算受傷風險指標，幫你在受傷之前調整訓練。"
        : "Combines training load, recovery and sleep signals into a clear injury-risk indicator so you can adjust before problems appear.",
    },
    {
      icon: MapPin,
      title: zh ? "CityHunter 城市探索" : "CityHunter",
      desc: zh
        ? "把每次跑步變成城市探索遊戲，解鎖新街道、新地區，鼓勵你出門跑步、認識自己的城市。"
        : "Turns every run into a city exploration game — unlock new streets and districts as you run, and discover your neighbourhood on foot.",
    },
    {
      icon: LineChart,
      title: zh ? "訓練分析" : "Training Insights",
      desc: zh
        ? "追蹤心率區間、配速趨勢與體能負荷，掌握訓練進度。"
        : "Track heart-rate zones, pace trends and training load so every session moves you forward.",
    },
    {
      icon: Activity,
      title: zh ? "整合你所有的裝置" : "One Home For All Your Devices",
      desc: zh
        ? "支援 Strava、Garmin、Suunto、COROS、Polar、Apple Health 及 intervals.icu,一次同步所有跑步記錄。"
        : "Sync your runs from Strava, Garmin, Suunto, COROS, Polar, Apple Health and intervals.icu — all in one place.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <img src={appIcon} alt="Runward" className="h-8 w-auto" />
            <span className="font-display font-bold text-lg">
              {zh ? "向前跑" : "Runward"}
            </span>
          </div>
          <button
            onClick={toggleLang}
            className="text-sm font-medium px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
          >
            {zh ? "EN" : "中文"}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight mb-6">
          {zh ? "為熱愛跑步的人而設" : "Built for people who love running"}
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          {zh
            ? "Runward 幫你分析跑姿、追蹤受傷風險,並用城市探索鼓勵你踏出家門,讓每次跑步都更有意義。"
            : "Runward helps you analyse your form, monitor injury risk and explore your city on foot — so every run has purpose."}
        </p>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block"
        >
          <img
            src={appStoreBadge}
            alt="Download on the App Store"
            className="h-12 w-auto mx-auto"
          />
        </a>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon size={22} />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">
                {f.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Brand strip */}
      <section className="border-y border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-center text-[11px] font-semibold tracking-[0.18em] text-muted-foreground/80 uppercase mb-6">
            {zh ? "支援的平台" : "Works with"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {brands.map((b) => (
              <img
                key={b.alt}
                src={b.src}
                alt={b.alt}
                loading="lazy"
                className={`h-8 md:h-10 w-auto object-contain opacity-90 ${
                  b.invert ? "dark:invert" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-10 text-center text-sm text-muted-foreground">
        <div className="flex flex-wrap justify-center gap-6 mb-3">
          <a href="/privacy" className="hover:text-foreground">
            {zh ? "私隱政策" : "Privacy"}
          </a>
          <a href="/support" className="hover:text-foreground">
            {zh ? "支援" : "Support"}
          </a>
          <a href="/delete-account" className="hover:text-foreground">
            {zh ? "刪除帳戶" : "Delete Account"}
          </a>
        </div>
        <p>© {new Date().getFullYear()} Runward</p>
      </footer>
    </div>
  );
};

export default ReviewLanding;
