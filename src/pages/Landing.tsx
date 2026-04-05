import { useState } from "react";
import { Activity, BarChart3, Zap, Target, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Lang, t } from "@/lib/i18n";
import appStoreBadge from "@/assets/app-store-badge.png";
import appIcon from "@/assets/app-icon.png";

const APP_STORE_URL = "https://apps.apple.com/app/id0000000000"; // Replace with real App Store URL

const Landing = () => {
  const location = useLocation();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "en");
  const currentRoute = `${location.pathname}${location.search}`;
  const toggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };
  const [carouselIdx, setCarouselIdx] = useState(0);
  const visibleCount = typeof window !== "undefined" && window.innerWidth >= 768 ? 3 : 1;

  const prev = () => setCarouselIdx((i) => Math.max(0, i - 1));
  const next = () => setCarouselIdx((i) => Math.min(5, i + 1));

  const screenshots = [
    { label: t("landingScreenActivity", lang), gradient: "from-emerald-400 to-teal-600" },
    { label: t("landingScreenTraining", lang), gradient: "from-blue-400 to-indigo-600" },
    { label: t("landingScreenCharts", lang), gradient: "from-violet-400 to-purple-600" },
    { label: t("landingScreenAI", lang), gradient: "from-amber-400 to-orange-600" },
    { label: t("landingScreenPosture", lang), gradient: "from-rose-400 to-pink-600" },
    { label: t("landingScreenCalc", lang), gradient: "from-cyan-400 to-sky-600" },
  ];

  const features = [
    { icon: Activity, title: t("landingStravaTitle", lang), desc: t("landingStravaDesc", lang) },
    { icon: Target, title: t("landingAITitle", lang), desc: t("landingAIDesc", lang) },
    { icon: BarChart3, title: t("landingAnalyticsTitle", lang), desc: t("landingAnalyticsDesc", lang) },
    { icon: Zap, title: t("landingPostureTitle", lang), desc: t("landingPostureDesc", lang) },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      {/* ─── Language Toggle ─── */}
      <div className="flex justify-end px-6 pt-4">
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe size={14} />
          {lang === "en" ? "中文" : "EN"}
        </button>
      </div>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden px-6 pt-8 pb-20 md:pt-16 md:pb-28 text-center">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto space-y-6">
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
            {lang === "zh" ? "向前跑" : "Runward"}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto">
            {t("landingTagline", lang)}
          </p>

          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-block mt-4">
            <img src={appStoreBadge} alt="Download on the App Store" className="h-14 mx-auto" />
          </a>
        </div>

        <div className="relative z-10 mt-12 mx-auto max-w-[200px]">
          <img src={appIcon} alt="Runward App Icon" className="rounded-[2rem] shadow-xl w-full" />
        </div>
      </section>

      {/* ─── Screenshots Carousel ─── */}
      <section className="px-6 py-16 md:py-20 bg-card">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">
            {t("landingSeeItInAction", lang)}
          </h2>

          <div className="relative">
            <div className="overflow-hidden">
              <div
                className="flex gap-4 transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${carouselIdx * (100 / visibleCount)}%)` }}
              >
                {screenshots.map((s, i) => (
                  <div
                    key={i}
                    className="shrink-0"
                    style={{ width: `calc(${100 / visibleCount}% - ${((visibleCount - 1) * 16) / visibleCount}px)` }}
                  >
                    {/* Replace this placeholder with actual app screenshot */}
                    <div
                      className={`rounded-[2rem] bg-gradient-to-b ${s.gradient} shadow-lg border border-border/30 overflow-hidden`}
                      style={{ aspectRatio: "9/19.5" }}
                    >
                      <div className="flex flex-col items-center justify-end h-full pb-8 px-4">
                        <span className="text-white/90 font-medium text-sm backdrop-blur-sm bg-black/20 px-4 py-1.5 rounded-full">
                          {s.label}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={prev}
              disabled={carouselIdx === 0}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 md:-translate-x-5 w-10 h-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-foreground disabled:opacity-30 transition-opacity"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              disabled={carouselIdx >= screenshots.length - visibleCount}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 md:translate-x-5 w-10 h-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-foreground disabled:opacity-30 transition-opacity"
            >
              <ChevronRight size={20} />
            </button>

            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: screenshots.length - visibleCount + 1 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCarouselIdx(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === carouselIdx ? "bg-primary w-6" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="px-6 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">
            {t("landingRunSmarter", lang)}
          </h2>

          <div className="grid sm:grid-cols-2 gap-8">
            {features.map((f, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon size={22} className="text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="px-6 py-16 md:py-20 bg-card">
        <div className="max-w-lg mx-auto text-center space-y-6">
          <h2 className="font-display text-2xl md:text-3xl font-bold">
            {t("landingCTATitle", lang)}
          </h2>
          <p className="text-muted-foreground">
            {t("landingCTADesc", lang)}
          </p>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
            <img src={appStoreBadge} alt="Download on the App Store" className="h-14 mx-auto" />
          </a>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} {lang === "zh" ? "向前跑" : "Runward"}. {t("landingCopyright", lang)}</span>
          <div className="flex gap-6">
            <Link to="/privacy" state={{ from: currentRoute }} className="hover:text-foreground transition-colors">
              {t("landingPrivacy", lang)}
            </Link>
            <Link to="/support" state={{ from: currentRoute }} className="hover:text-foreground transition-colors">
              {t("landingSupport", lang)}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
