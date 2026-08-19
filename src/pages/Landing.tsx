import { useState, useEffect } from "react";
import { Globe, Smartphone, ChevronRight, CheckCircle2, Check, X, Crown, Sparkles, Target, KeyRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import appStoreBadge from "@/assets/app-store-badge.png";
import appIcon from "@/assets/app-icon.png";
import poweredByStrava from "@/assets/brands/powered-by-strava.svg.asset.json";
import IPhoneFrame from "@/components/landing/IPhoneFrame";
import heroEn from "@/assets/appstore/hero-en.png.asset.json";
import heroZh from "@/assets/appstore/hero-zh.png.asset.json";
import AppStoreScreenshots from "@/components/landing/AppStoreScreenshots";
import DashboardPreview from "@/components/landing/DashboardPreview";
import BrandStrip from "@/components/landing/BrandStrip";


const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

type Lang = "en" | "zh";

const Landing = () => {
  const location = useLocation();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "zh");
  const currentRoute = `${location.pathname}${location.search}`;
  const toggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const zh = lang === "zh";


  return (
    <div className="min-h-screen bg-background text-foreground font-body overflow-x-hidden">
      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <img src={appIcon} alt="Runward" className="h-8 w-auto" />
            <span className="font-display font-bold text-lg">{zh ? "向前跑" : "Runward"}</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#pricing"
              className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {zh ? "價格" : "Pricing"}
            </a>
            <Link
              to="/compare"
              className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {zh ? "比較" : "Compare"}
            </Link>
            <Link
              to="/blog"
              className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {zh ? "博客" : "Blog"}
            </Link>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe size={14} />
              {lang === "en" ? "中文" : "EN"}
            </button>
            <Link
              to="/dashboard?auth=1"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <KeyRound size={14} />
              {zh ? "登入 / 註冊" : "Sign In"}
            </Link>
            <Link
              to="/dashboard"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <Target size={14} />
              {zh ? "儀表板" : "Dashboard"}
            </Link>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Smartphone size={14} />
              {zh ? "下載" : "Download"}
            </a>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative px-6 pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
        <div className="absolute top-[-160px] right-[-120px] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto grid md:grid-cols-[1.15fr_1fr] gap-12 md:gap-16 items-center">
          {/* Left — copy */}
          <div className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <h1 className="font-display text-[2.5rem] sm:text-5xl md:text-6xl lg:text-[4.25rem] font-bold tracking-tight leading-[1.02]">
              {zh ? (
                <>
                  你的 AI 跑步教練,
                  <br />
                  <span className="italic text-primary">隨時陪你訓練。</span>
                </>
              ) : (
                <>
                  Your AI running coach.
                  <br />
                  <span className="italic text-primary">In your pocket.</span>
                </>
              )}
            </h1>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mt-6 md:mt-8">
              {zh
                ? "Strava、Garmin、Suunto、COROS、Apple Health、Polar 一鍵同步。AI 自動生成訓練計劃、跑姿分析、賽季排名與獎勵 — 全部整合在一個應用裡。"
                : "Strava, Garmin, Suunto, COROS, Apple Health, Polar — synced in one tap. AI training plans, posture analysis, ranked seasons and rewards, all in one beautifully crafted app."}
            </p>

            {/* Integrations strip */}
            <div className="mt-8 md:mt-10">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase mb-3">
                {zh ? "整合你的裝置" : "Pick your stack"}
              </div>
              <div className="flex flex-wrap gap-2">
                {["Strava", "Garmin", "Apple Health", "COROS", "Polar", "Suunto", "Fitbit"].map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 md:mt-10 flex flex-wrap items-center gap-4">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
              >
                {zh ? "免費開始使用" : "Get started, it's free"}
                <ChevronRight size={18} />
              </a>
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
                <img src={appStoreBadge} alt="Download on the App Store" className="h-12" />
              </a>
            </div>

            <p className="text-xs text-muted-foreground mt-5">
              {zh ? "iPhone · 免費下載 · 7 天 Premium 試用" : "iPhone · Free to download · 7-day Premium trial"}
            </p>
          </div>

          {/* Right — single hero phone */}
          <div className={`relative flex justify-center md:justify-end transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/10 via-primary/5 to-transparent rounded-[3rem] blur-2xl" />
            <IPhoneFrame
              src={zh ? heroZh.url : heroEn.url}
              alt="Runward app"
              className="w-[260px] sm:w-[300px] md:w-[340px]"
            />
          </div>
        </div>
      </section>

      {/* ─── Brand logos strip ─── */}
      <BrandStrip lang={lang} />



      {/* ─── App Store Screenshots ─── */}
      <AppStoreScreenshots lang={lang} />

      {/* ─── Web Dashboard Preview ─── */}
      <DashboardPreview lang={lang} />



      {/* ─── Pricing ─── */}
      <section id="pricing" className="px-6 py-20 md:py-28 bg-card/30 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
              {zh ? "訂閱方案" : "Pricing"}
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              {zh ? "簡單透明的訂閱方案" : "Simple, Transparent Pricing"}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {zh ? "免費開始,隨時升級為 Premium。" : "Start for free. Upgrade to Premium when you're ready."}
            </p>
          </div>





          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-border bg-background p-6 flex flex-col">
              <div className="mb-4">
                <h3 className="font-display text-xl font-bold mb-1">{zh ? "免費版" : "Free"}</h3>
                <p className="text-sm text-muted-foreground">{zh ? "開始你的跑步旅程" : "Start your running journey"}</p>
              </div>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold">{zh ? "免費" : "Free"}</span>
              </div>
              <ul className="space-y-2.5 text-sm mb-6 flex-1">
                {[
                  zh ? "活動追蹤與同步" : "Activity tracking & sync",
                  zh ? "社群與排行榜" : "Community & leaderboards",
                  zh ? "HRV 洞察" : "HRV insights",
                  zh ? "訓練負荷圖表" : "Training load charts",
                  zh ? "基本訓練計劃" : "Basic training plans",
                  zh ? "每日 1 次跑姿分析" : "1 posture analysis / day",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check size={16} className="text-success shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                {zh ? "免費下載" : "Download Free"}
              </a>
            </div>

            {/* Monthly */}
            <div className="rounded-2xl border border-border bg-background p-6 flex flex-col">
              <div className="mb-4">
                <h3 className="font-display text-xl font-bold mb-1 flex items-center gap-2">
                  Premium <span className="text-xs font-normal text-muted-foreground">{zh ? "月費" : "Monthly"}</span>
                </h3>
                <p className="text-sm text-muted-foreground">{zh ? "彈性月度訂閱" : "Flexible monthly billing"}</p>
              </div>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold">HK$48</span>
                <span className="text-muted-foreground">/{zh ? "月" : "mo"}</span>
                <div className="text-sm text-muted-foreground mt-1">TWD 190/{zh ? "月" : "mo"}</div>
              </div>

              <ul className="space-y-2.5 text-sm mb-6 flex-1">
                {[
                  zh ? "包含所有免費功能" : "Everything in Free",
                  zh ? "AI 跑步教練（24/7）" : "AI Running Coach (24/7)",
                  zh ? "AI 活動分析報告" : "AI activity analysis",
                  zh ? "AI 個人化訓練計劃" : "AI-personalized training plans",
                  zh ? "無限跑姿分析" : "Unlimited posture analysis",
                  zh ? "全距離比賽預測" : "Race predictor (all distances)",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check size={16} className="text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
              >
                {zh ? "立即訂閱" : "Subscribe"}
              </a>
            </div>

            {/* Yearly */}
            <div className="relative rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 flex flex-col shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold tracking-wide uppercase">
                {zh ? "最划算" : "Best Value"}
              </div>
              <div className="mb-4">
                <h3 className="font-display text-xl font-bold mb-1 flex items-center gap-2">
                  Premium <span className="text-xs font-normal text-muted-foreground">{zh ? "年費" : "Yearly"}</span>
                </h3>
                <p className="text-sm text-muted-foreground">{zh ? "節省更多，承諾全年" : "Save more, commit to the year"}</p>
              </div>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold">HK$488</span>
                <span className="text-muted-foreground">/{zh ? "年" : "yr"}</span>
                <div className="text-sm text-muted-foreground mt-1">TWD 1990/{zh ? "年" : "yr"}</div>
              </div>
              <ul className="space-y-2.5 text-sm mb-6 flex-1">
                {[
                  zh ? "包含所有月費功能" : "Everything in Monthly",
                  zh ? "相當於每月約 HK$41" : "About HK$41 / month",
                  zh ? "年費省更多" : "Save more annually",
                  zh ? "AI 活動分享海報" : "AI activity share posters",
                  zh ? "每週計劃回顧（即將推出）" : "Weekly plan reviews (soon)",
                  zh ? "優先獲取新功能" : "Priority access to new features",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Sparkles size={16} className="text-warning shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Crown size={14} />
                {zh ? "立即訂閱" : "Subscribe Yearly"}
              </a>
            </div>
          </div>



          {/* Comparison table */}
          <div className="mt-16 max-w-3xl mx-auto">
            <h3 className="font-display text-2xl md:text-3xl font-bold text-center mb-2">
              {zh ? "免費版 vs Premium" : "Free vs Premium"}
            </h3>
            <p className="text-center text-muted-foreground mb-8 text-sm">
              {zh ? "完整功能對照" : "Full feature comparison"}
            </p>
            <div className="bg-background border border-border rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[1fr_100px_100px] md:grid-cols-[1fr_140px_140px] bg-accent/50 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span>{zh ? "功能" : "Feature"}</span>
                <span className="text-center">{zh ? "免費" : "Free"}</span>
                <span className="text-center flex items-center justify-center gap-1">
                  <Sparkles size={12} className="text-warning" />
                  Premium
                </span>
              </div>
              {[
                { label: zh ? "活動追蹤與同步" : "Activity tracking & sync", free: true, premium: true },
                { label: zh ? "社群與排行榜" : "Community & leaderboards", free: true, premium: true },
                { label: zh ? "HRV 洞察" : "HRV insights", free: true, premium: true },
                { label: zh ? "訓練負荷圖表" : "Training load charts", free: true, premium: true },
                { label: zh ? "AI 跑步教練（全天候）" : "AI Running Coach (24/7 chat)", free: false, premium: true },
                { label: zh ? "AI 活動分析" : "AI activity analysis", free: false, premium: true },
                { label: zh ? "活動分享" : "Activity sharing", free: zh ? "基本" : "Basic", premium: zh ? "全部功能" : "All functions" },
                { label: zh ? "AI 活動分享海報" : "AI activity share posters", free: false, premium: true },
                { label: zh ? "每週計劃回顧" : "Weekly plan reviews", free: false, premium: zh ? "即將推出" : "Coming soon" },
                { label: zh ? "訓練計劃" : "Training plans", free: zh ? "基本" : "Basic", premium: zh ? "AI 個人化" : "Personalized AI" },
                { label: zh ? "比賽預測" : "Race predictor", free: zh ? "僅 5K" : "5K only", premium: zh ? "全距離" : "All distances" },
                { label: zh ? "跑姿分析" : "Posture analysis", free: zh ? "每日 1 次" : "1 / day", premium: zh ? "無限" : "Unlimited" },
              ].map((f, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_100px_100px] md:grid-cols-[1fr_140px_140px] items-center px-4 py-3 text-sm ${
                    i % 2 === 0 ? "bg-background" : "bg-accent/20"
                  }`}
                >
                  <span className="text-foreground pr-2">{f.label}</span>
                  <div className="text-center">
                    {f.free === true ? (
                      <Check size={16} className="text-success mx-auto" />
                    ) : f.free === false ? (
                      <X size={16} className="text-muted-foreground/50 mx-auto" />
                    ) : (
                      <span className="text-xs text-foreground">{f.free}</span>
                    )}
                  </div>
                  <div className="text-center">
                    {f.premium === true ? (
                      <Check size={16} className="text-success mx-auto" />
                    ) : f.premium === false ? (
                      <X size={16} className="text-muted-foreground/50 mx-auto" />
                    ) : (
                      <span className="text-xs text-foreground">{f.premium}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                to="/compare"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-card border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                {zh ? "對比 Garmin Connect 與 Strava →" : "Compare with Garmin Connect & Strava →"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Premium CTA ─── */}
      <section className="px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-8 md:p-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 grid md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold mb-4">
                  {zh ? "進階版" : "PREMIUM"}
                </span>
                <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                  {zh ? "解鎖完整體驗" : "Unlock the Full Experience"}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {zh
                    ? "升級進階版，獲取 AI 訓練計劃、跑姿分析及更多專屬功能。"
                    : "Upgrade to Premium for AI training plans, posture analysis, and exclusive features."}
                </p>
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  {zh ? "下載應用，立即體驗" : "Get the App & Try Premium"}
                  <ChevronRight size={16} />
                </a>
              </div>
              <div className="space-y-3">
                {[
                  zh ? "AI 個人化訓練計劃" : "AI-Personalized Training Plans",
                  zh ? "即時跑姿分析" : "Real-time Posture Analysis",
                  zh ? "AI 活動分析報告" : "AI Activity Analysis Reports",
                  zh ? "無限制訓練計劃生成" : "Unlimited Plan Generation",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-primary shrink-0" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="px-6 py-20 md:py-28 bg-card/50">
        <motion.div
          className="max-w-lg mx-auto text-center space-y-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <img src={appIcon} alt="Runward" className="h-20 w-auto mx-auto" />
          <h2 className="font-display text-2xl md:text-3xl font-bold">
            {zh ? "準備好跑得更聰明了嗎？" : "Ready to Run Smarter?"}
          </h2>
          <p className="text-muted-foreground">
            {zh
              ? "加入 Runward，讓 AI 幫助你達成跑步目標。"
              : "Join Runward and let AI help you reach your running goals."}
          </p>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
            <img src={appStoreBadge} alt="Download on the App Store" className="h-14 mx-auto" />
          </a>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <img src={appIcon} alt="" className="h-5 w-5 rounded" />
            <span>© {new Date().getFullYear()} {zh ? "向前跑" : "Runward"}. {zh ? "保留所有權利。" : "All rights reserved."}</span>
            <span className="text-border">|</span>
            <img src={poweredByStrava.url} alt="Powered by Strava" className="h-5" />
          </div>
          <div className="flex gap-6">
            <Link to="/blog" className="hover:text-foreground transition-colors">
              {zh ? "博客" : "Blog"}
            </Link>
            <Link to="/privacy" state={{ from: currentRoute }} className="hover:text-foreground transition-colors">
              {zh ? "隱私政策" : "Privacy Policy"}
            </Link>
            <Link to="/support" state={{ from: currentRoute }} className="hover:text-foreground transition-colors">
              {zh ? "支援" : "Support"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
