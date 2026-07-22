import { useState } from "react";
import { Activity, Shield, MapPin, LineChart, Footprints, Heart, ChevronDown } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import appStoreBadge from "@/assets/app-store-badge.png";
import IPhoneFrame from "@/components/landing/IPhoneFrame";
import heroEn from "@/assets/appstore/hero-en.png.asset.json";
import heroZh from "@/assets/appstore/hero-zh.png.asset.json";
import poweredByStrava from "@/assets/brands/powered-by-strava.svg.asset.json";
import suuntoLogo from "@/assets/brands/suunto.png.asset.json";
import garminLogo from "@/assets/brands/garmin.png.asset.json";
import corosLogo from "@/assets/brands/coros.png.asset.json";
import polarLogo from "@/assets/brands/polar.png.asset.json";
import appleHealthLogo from "@/assets/brands/apple-health.png.asset.json";
import intervalsLogo from "@/assets/brands/intervals-icu.png.asset.json";

const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

type Lang = "en" | "zh";

const otherBrands = [
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

  const hero = zh ? heroZh.url : heroEn.url;
  const shot1 = zh ? screenshot1Zh.url : screenshot1En.url;
  const shot2 = zh ? screenshot2Zh.url : screenshot2En.url;
  const shot3 = zh ? screenshot3Zh.url : screenshot3En.url;

  const features = [
    {
      icon: Footprints,
      title: zh ? "跑姿分析" : "Posture Analysis",
      desc: zh
        ? "上載一段短片,逐幀分析步頻、著地方式、身體傾斜與擺臂,幫你改善跑步技術、減少受傷風險。"
        : "Upload a short video and get a frame-by-frame breakdown of cadence, foot strike, torso lean and arm swing to refine your form.",
      shot: shot1,
    },
    {
      icon: Shield,
      title: zh ? "受傷儀表板" : "Injury Dashboard",
      desc: zh
        ? "把訓練量、恢復狀態與睡眠整合成清晰的受傷風險指標,在小痛變成大傷之前提前調整。"
        : "Combines training load, recovery and sleep into a single injury-risk indicator so you can back off before small niggles turn into real injuries.",
      shot: shot2,
    },
    {
      icon: MapPin,
      title: zh ? "CityHunter 城市探索" : "CityHunter",
      desc: zh
        ? "把每次跑步變成城市探索遊戲,解鎖新街道、新地區,鼓勵你走出家門、認識自己的城市。"
        : "Turns every run into a city exploration game. Unlock new streets and districts as you run, and rediscover your neighbourhood on foot.",
      shot: shot3,
    },
  ];

  const perks = [
    {
      icon: LineChart,
      title: zh ? "訓練分析" : "Training Insights",
      desc: zh
        ? "追蹤心率區間、配速趨勢與體能負荷。"
        : "Track heart-rate zones, pace trends and weekly training load.",
    },
    {
      icon: Activity,
      title: zh ? "整合裝置" : "All Your Devices",
      desc: zh
        ? "一次連接你所有的跑步裝置與服務。"
        : "Sync runs from all your favourite platforms in one place.",
    },
    {
      icon: Heart,
      title: zh ? "以跑者為本" : "Made For Runners",
      desc: zh
        ? "由熱愛跑步的人親手打造,鼓勵你更常出門跑步。"
        : "Built by people who love running, to help you run more often.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-body antialiased">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-primary/10 blur-3xl opacity-60" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 md:px-8 py-3">
          <a href="/" className="flex items-center gap-2.5">
            <img src={appIcon} alt="Runward" className="h-9 w-auto rounded-xl" />
            <span className="font-display font-bold text-lg tracking-tight">
              {zh ? "向前跑" : "Runward"}
            </span>
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
            >
              {zh ? "EN" : "中文"}
            </button>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex text-xs font-semibold px-4 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              {zh ? "下載" : "Download"}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 pt-16 md:pt-24 pb-12">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase mb-5">
              <Footprints size={14} />
              {zh ? "為跑者而設" : "For runners, by runners"}
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight mb-5">
              {zh ? (
                <>
                  跑得更好、
                  <br />
                  <span className="text-primary">跑得更遠</span>。
                </>
              ) : (
                <>
                  Run better.
                  <br />
                  <span className="text-primary">Explore further.</span>
                </>
              )}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-lg mb-8">
              {zh
                ? "Runward 幫你分析跑姿、追蹤受傷風險,並用城市探索遊戲鼓勵你踏出家門。讓每次跑步都更有意義。"
                : "Runward helps you analyse your form, monitor injury risk and turn every run into a city adventure — so you keep coming back for more."}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                <img
                  src={appStoreBadge}
                  alt="Download on the App Store"
                  className="h-12 w-auto"
                />
              </a>
              <a
                href="#features"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {zh ? "了解更多" : "See what's inside"}
                <ChevronDown size={16} />
              </a>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <IPhoneFrame src={hero} alt="Runward app" className="w-[240px] md:w-[300px]" />
          </div>
        </div>
      </section>

      {/* Perks strip */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-8">
        <div className="grid sm:grid-cols-3 gap-4">
          {perks.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-border bg-card/60 p-5 flex gap-3 items-start"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <p.icon size={18} />
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1">{p.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-5 md:px-8 py-16 md:py-24 space-y-24 md:space-y-32">
        {features.map((f, idx) => {
          const reverse = idx % 2 === 1;
          return (
            <div
              key={f.title}
              className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center ${
                reverse ? "md:[direction:rtl]" : ""
              }`}
            >
              <div className="md:[direction:ltr]">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                  <f.icon size={22} />
                </div>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 leading-tight tracking-tight">
                  {f.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed text-base md:text-lg max-w-md">
                  {f.desc}
                </p>
              </div>
              <div className="flex justify-center md:[direction:ltr]">
                <IPhoneFrame
                  src={f.shot}
                  alt={f.title}
                  className="w-[220px] md:w-[260px]"
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Works with */}
      <section className="border-y border-border bg-card/40">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-14">
          <p className="text-center text-[11px] font-semibold tracking-[0.2em] text-muted-foreground/80 uppercase mb-8">
            {zh ? "支援的平台" : "Works with"}
          </p>

          {/* Powered by Strava — prominent, per Strava brand guidelines */}
          <div className="flex justify-center mb-8">
            <img
              src={poweredByStrava.url}
              alt="Powered by Strava"
              className="h-10 md:h-12 w-auto"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 md:gap-x-14">
            {otherBrands.map((b) => (
              <img
                key={b.alt}
                src={b.src}
                alt={b.alt}
                loading="lazy"
                className={`h-7 md:h-9 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity ${
                  b.invert ? "dark:invert" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-5 md:px-8 py-20 md:py-28 text-center">
        <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight tracking-tight mb-5">
          {zh ? "準備好出去跑一場了嗎?" : "Ready to lace up?"}
        </h2>
        <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto mb-8">
          {zh
            ? "免費下載 Runward,加入我們的跑者社群。"
            : "Runward is free to download. Join runners exploring their cities on foot every day."}
        </p>
        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
          <img
            src={appStoreBadge}
            alt="Download on the App Store"
            className="h-14 w-auto mx-auto"
          />
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-10 text-sm">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src={appIcon} alt="Runward" className="h-7 w-auto rounded-lg" />
                <span className="font-display font-bold">
                  {zh ? "向前跑" : "Runward"}
                </span>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">
                {zh
                  ? "為熱愛跑步的人而設的訓練夥伴。"
                  : "A training companion for people who love running."}
              </p>
            </div>
            <div>
              <h5 className="font-semibold text-xs uppercase tracking-wider mb-3 text-muted-foreground">
                {zh ? "產品" : "Product"}
              </h5>
              <ul className="space-y-2">
                <li>
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                    {zh ? "下載 iOS" : "Download for iOS"}
                  </a>
                </li>
                <li>
                  <a href="/support" className="hover:text-primary transition-colors">
                    {zh ? "支援與聯絡" : "Support & Contact"}
                  </a>
                </li>
                <li>
                  <a href="/delete-account" className="hover:text-primary transition-colors">
                    {zh ? "刪除帳戶與資料" : "Delete account & data"}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold text-xs uppercase tracking-wider mb-3 text-muted-foreground">
                {zh ? "法律" : "Legal"}
              </h5>
              <ul className="space-y-2">
                <li>
                  <a href="/privacy" className="hover:text-primary transition-colors">
                    {zh ? "私隱政策" : "Privacy Policy"}
                  </a>
                </li>
                <li>
                  <a href="mailto:support@runward.app" className="hover:text-primary transition-colors">
                    support@runward.app
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-border/60 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} Runward. {zh ? "版權所有。" : "All rights reserved."}</p>
            <p className="text-center md:text-right max-w-md leading-relaxed">
              {zh
                ? "Runward 並非由 Strava、Garmin、Suunto、COROS、Polar、Apple 或 intervals.icu 開發、認可或贊助。所有商標均屬其各自擁有者所有。"
                : "Runward is not affiliated with, endorsed by or sponsored by Strava, Garmin, Suunto, COROS, Polar, Apple or intervals.icu. All trademarks are property of their respective owners."}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ReviewLanding;
