import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, X, Minus, Globe, Smartphone, Crown, ExternalLink } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import {
  comparisons,
  type Cell,
  type CompetitorComparison,
  RUNWARD_PRICE,
} from "@/data/comparison";

const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

type Lang = "en" | "zh";

const renderCell = (cell: Cell, zh: boolean, accent: boolean) => {
  if (cell.kind === "yes") {
    return (
      <div className="flex flex-col items-center gap-1">
        <Check size={18} className={accent ? "text-primary" : "text-success"} />
        {(cell.note_en || cell.note_zh) && (
          <span className="text-[11px] text-muted-foreground text-center leading-tight">
            {zh ? cell.note_zh : cell.note_en}
          </span>
        )}
      </div>
    );
  }
  if (cell.kind === "no") {
    return (
      <div className="flex flex-col items-center gap-1">
        <X size={18} className="text-muted-foreground/60" />
        {(cell.note_en || cell.note_zh) && (
          <span className="text-[11px] text-muted-foreground text-center leading-tight">
            {zh ? cell.note_zh : cell.note_en}
          </span>
        )}
      </div>
    );
  }
  if (cell.kind === "partial") {
    return (
      <div className="flex flex-col items-center gap-1">
        <Minus size={18} className="text-warning" />
        <span className="text-[11px] text-muted-foreground text-center leading-tight">
          {zh ? cell.note_zh : cell.note_en}
        </span>
      </div>
    );
  }
  return (
    <span className={`text-sm font-medium text-center ${accent ? "text-primary" : "text-foreground"}`}>
      {zh ? cell.text_zh : cell.text_en}
    </span>
  );
};

const ComparisonTable = ({ data, zh }: { data: CompetitorComparison; zh: boolean }) => {
  return (
    <section className="mb-20">
      <div className="mb-6">
        <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
          {zh ? `向前跑 vs ${data.name}` : `Runward vs ${data.name}`}
        </h2>
        <p className="text-muted-foreground max-w-3xl">{zh ? data.blurb_zh : data.blurb_en}</p>
      </div>

      {/* Price cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/10 to-background p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
            {zh ? "向前跑 Premium" : "Runward Premium"}
          </div>
          <div className="font-display text-2xl font-bold">
            {zh ? RUNWARD_PRICE.monthly_zh : RUNWARD_PRICE.monthly_en}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {zh ? RUNWARD_PRICE.yearly_zh : RUNWARD_PRICE.yearly_en}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {zh ? data.free_label_zh : data.free_label_en}
          </div>
          <div className="font-display text-2xl font-bold">{zh ? "免費" : "Free"}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {zh ? "基礎功能" : "Basic features"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {zh ? data.premium_label_zh : data.premium_label_en}
          </div>
          <div className="font-display text-2xl font-bold">
            {zh ? data.premium_price_zh : data.premium_price_en}
          </div>
          <a
            href={data.pricing_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
          >
            {zh ? "官方價格" : "Official pricing"} <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Feature table */}
      <div className="rounded-2xl border border-border bg-background overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-card/60">
              <tr className="border-b border-border">
                <th className="text-left font-semibold px-4 py-3 w-2/5">
                  {zh ? "功能" : "Feature"}
                </th>
                <th className="font-semibold px-4 py-3 text-primary">
                  {zh ? "向前跑" : "Runward"}
                </th>
                <th className="font-semibold px-4 py-3 text-muted-foreground">
                  {zh ? data.free_label_zh : data.free_label_en}
                </th>
                <th className="font-semibold px-4 py-3 text-muted-foreground">
                  {zh ? data.premium_label_zh : data.premium_label_en}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-b-0 hover:bg-card/30 transition-colors"
                >
                  <td className="px-4 py-3 text-foreground">{zh ? row.label_zh : row.label_en}</td>
                  <td className="px-4 py-3 align-middle">{renderCell(row.runward, zh, true)}</td>
                  <td className="px-4 py-3 align-middle">
                    {renderCell(row.competitor_free, zh, false)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {renderCell(row.competitor_premium, zh, false)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const Compare = () => {
  const [lang, setLang] = useState<Lang>(
    () => (typeof window !== "undefined" && (localStorage.getItem("app_lang") as Lang)) || "zh"
  );
  const zh = lang === "zh";
  const toggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };

  useEffect(() => {
    const prevTitle = document.title;
    document.title = zh
      ? "向前跑 vs Garmin Connect vs Strava — 功能與價格比較"
      : "Runward vs Garmin Connect vs Strava — Compare Features & Pricing";
    const desc = zh
      ? "比較向前跑、Garmin Connect 與 Strava 的功能與訂閱價格：AI 教練、跑姿分析、訓練計劃與多品牌手錶同步。"
      : "Compare Runward, Garmin Connect and Strava on features and pricing: AI coach, posture analysis, training plans and multi-brand watch sync.";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const prevDesc = meta.content;
    meta.content = desc;

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const prevCanonical = canonical?.href;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/compare`;

    return () => {
      document.title = prevTitle;
      if (meta) meta.content = prevDesc;
      if (canonical && prevCanonical) canonical.href = prevCanonical;
    };
  }, [zh]);

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={appIcon} alt="Runward" className="h-8 w-auto" />
            <span className="font-display font-bold text-lg">{zh ? "向前跑" : "Runward"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={14} />
              {zh ? "返回首頁" : "Back"}
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
              {zh ? "下載" : "Download"}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="px-6 pt-14 pb-10 md:pt-20 md:pb-14 max-w-6xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
          {zh ? "比較" : "Compare"}
        </span>
        <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4 max-w-3xl">
          {zh
            ? "向前跑、Garmin Connect 與 Strava，怎麼選？"
            : "How Runward compares with Garmin Connect and Strava"}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-base md:text-lg">
          {zh
            ? "AI 教練、跑姿分析、個人化訓練計劃，加上多品牌手錶同步，價格更實惠。"
            : "AI coaching, posture analysis and personalized plans across every major watch brand — at a friendlier price."}
        </p>
      </header>

      {/* Tables */}
      <main className="px-6 pb-12 max-w-6xl mx-auto">
        {comparisons.map((c) => (
          <ComparisonTable key={c.id} data={c} zh={zh} />
        ))}

        <p className="text-xs text-muted-foreground max-w-3xl mt-4">
          {zh
            ? "* 競品價格以官方公開資訊為準（截至 2026 年 6 月），實際價格可能因地區、促銷或方案調整而異。"
            : "* Competitor prices reflect publicly listed rates as of June 2026 and may vary by region, promotion or plan changes."}
        </p>
      </main>

      {/* CTA */}
      <section className="px-6 py-16 md:py-20 bg-card/30 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
            {zh ? "立即免費試用向前跑" : "Try Runward free today"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {zh
              ? "免費下載，隨時升級為 Premium 解鎖 AI 教練與跑姿分析。"
              : "Download free. Upgrade to Premium anytime for AI coaching and posture analysis."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Crown size={14} />
              {zh ? "下載 App" : "Download App"}
            </a>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-card border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              {zh ? "開啟網頁Dashboard" : "Open Web Dashboard"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Compare;
