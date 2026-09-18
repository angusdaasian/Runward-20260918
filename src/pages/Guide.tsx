import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Smartphone } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import HowToUseGuide from "@/components/HowToUseGuide";
import { applySeoHead, SITE_URL } from "@/lib/seoHead";

type Lang = "en" | "zh";

const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

const copy = {
  en: {
    guide: "App Guide",
    back: "Home",
    blog: "Blog",
    download: "Download",
    switch: "中文",
    heading: "How to use Runward",
    intro:
      "Every feature explained, step by step — grouped by where you find it in the app. Free features and Premium features are both covered.",
    seoTitle: "Runward App Guide — How to use every feature",
    seoDescription:
      "A step-by-step guide to every Runward feature: activity sync, training plans, race tools, group leaderboards, analytics, settings and Premium features.",
  },
  zh: {
    guide: "使用教學",
    back: "首頁",
    blog: "跑步文章",
    download: "下載",
    switch: "English",
    heading: "如何使用 Runward",
    intro: "逐項功能詳細教學，按功能在 App 中的位置分類，免費與付費功能一應俱全。",
    seoTitle: "Runward 使用教學 — 逐項功能詳細指南",
    seoDescription:
      "Runward 逐項功能教學：活動同步、訓練計劃、賽事工具、群組排行榜、數據分析、設定及付費版功能，逐步說明。",
  },
} as const;

const Guide = () => {
  const [lang, setLang] = useState<Lang>(
    () => ((localStorage.getItem("app_lang") as Lang) || "zh"),
  );
  const zh = lang === "zh";
  const t = copy[lang];

  useEffect(() => {
    applySeoHead({
      title: t.seoTitle,
      description: t.seoDescription,
      canonical: "/guide",
      type: "website",
    });
    document.documentElement.lang = zh ? "zh-HK" : "en";
  }, [lang, t.seoTitle, t.seoDescription, zh]);

  const toggleLang = () => {
    const next: Lang = zh ? "en" : "zh";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      {/* ─── Nav (matches landing) ─── */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-8 py-4">
          <Link to="/full" className="flex items-center gap-2.5">
            <img src={appIcon} alt="Runward" className="h-8 w-auto" />
            <span className="font-display font-bold text-lg">{zh ? "向前跑" : "Runward"}</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link
              to="/full"
              className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.back}
            </Link>
            <Link
              to="/blog"
              className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.blog}
            </Link>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe size={14} />
              {lang === "en" ? "中文" : "EN"}
            </button>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Smartphone size={14} />
              {t.download}
            </a>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative px-6 pt-16 pb-10 md:pt-20 md:pb-14 overflow-hidden">
        <div className="absolute top-[-160px] right-[-120px] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-6xl mx-auto">
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
            {t.heading}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl mt-4">
            {t.intro}
          </p>
        </div>
      </section>

      {/* ─── Guide content ─── */}
      <main className="max-w-6xl mx-auto px-6 pb-20">
        <HowToUseGuide lang={lang} variant="web" />
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Runward</span>
          <a
            href="https://runward.site"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            runward.site
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Guide;
