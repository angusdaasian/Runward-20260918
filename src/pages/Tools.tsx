import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Globe, Smartphone, ArrowLeft, Gauge, Beaker, Activity, Wrench, ClipboardCheck } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DesktopPaceLab from "@/components/dashboard/DesktopPaceLab";
import { RaceFuelCalculator } from "@/components/FuelingGuide";
import BlogPaceCalculator, { type RaceKey } from "@/components/blog/BlogPaceCalculator";
import RaceDayChecklist from "@/components/tools/RaceDayChecklist";
import { applySeoHead } from "@/lib/seoHead";

const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

type Lang = "en" | "zh";

const VALID_TABS = ["pace", "training", "fuel", "checklist"] as const;
type TabKey = (typeof VALID_TABS)[number];

const Tools = () => {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "zh");
  const zh = lang === "zh";

  const [tab, setTab] = useState<TabKey>(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("tab") || window.location.hash.replace("#", "")) as TabKey;
    return VALID_TABS.includes(requested) ? requested : "pace";
  });

  const [targetRace, setTargetRace] = useState<RaceKey>("HM");


  const toggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };

  useEffect(() => {
    applySeoHead({
      title: zh
        ? "跑步實用小工具 — 配速、跑力、補給、比賽清單 | Runward"
        : "Running Tools — Pace, Level, Nutrition, Race Day Checklist | Runward",
      description: zh
        ? "免費跑步計算機：配速換算與分段表、跑力等級評分、同等成績預測、比賽補給規劃與目標時間訓練配速。"
        : "Free running calculators: pace conversion and split tables, running level score, equivalent race times, race nutrition planning and target-time training paces.",
      canonical: "https://runward.site/tools",
    });
  }, [zh]);

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      {/* Nav */}
      <nav className="print:hidden sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={appIcon} alt="Runward" className="h-8 w-auto" />
            <span className="font-display font-bold text-lg">{zh ? "向前跑" : "Runward"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/blog"
              className="hidden sm:inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {zh ? "博客" : "Blog"}
            </Link>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label={zh ? "切換語言" : "Toggle language"}
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

      <main className="max-w-5xl mx-auto px-5 sm:px-6 py-10">
        <Link
          to="/"
          className="print:hidden inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          {zh ? "返回首頁" : "Back to home"}
        </Link>

        <header className="mb-8 print:hidden">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Wrench className="h-5 w-5" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              {zh ? "實用小工具" : "Tools"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {zh
              ? "全部免費、無需註冊。配速換算、跑力等級評分、同等成績、比賽補給、目標時間訓練配速,以及可列印的比賽日檢查清單 — 想要根據你真實訓練數據自動調整的課表,請使用 Runward App。"
              : "All free, no sign-up needed. Pace conversion, running level score, equivalent times, race nutrition, target-time training paces and a printable race day checklist — for plans that adapt to your real training data, use the Runward app."}
          </p>
        </header>

        <Tabs defaultValue="pace" className="w-full">
          <TabsList className="print:hidden flex flex-wrap h-auto gap-1">
            <TabsTrigger value="pace" className="gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              {zh ? "配速 · 跑力 · 同等成績" : "Pace, Level & Equivalents"}
            </TabsTrigger>
            <TabsTrigger value="training" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {zh ? "訓練配速" : "Training Paces"}
            </TabsTrigger>
            <TabsTrigger value="fuel" className="gap-1.5">
              <Beaker className="h-3.5 w-3.5" />
              {zh ? "比賽補給" : "Nutrition"}
            </TabsTrigger>
            <TabsTrigger value="checklist" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              {zh ? "比賽日清單" : "Race Day Checklist"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pace" className="mt-5">
            <Card className="p-6">
              <SectionHeader
                title={zh ? "配速與跑力計算器" : "Pace & Running Level Calculator"}
                desc={
                  zh
                    ? "一次輸入距離與時間(或目標配速),即得配速、平均速度、跑力分數、各距離同等成績與分段表"
                    : "Enter a distance with a time (or target pace) once to get pace, speed, running level score, equivalent race times and split tables"
                }
              />
              <DesktopPaceLab lang={lang} />
            </Card>
          </TabsContent>


          <TabsContent value="training" className="mt-5">
            <Card className="p-6">
              <SectionHeader
                title={zh ? "目標時間訓練配速" : "Target-Time Training Paces"}
                desc={
                  zh
                    ? "輸入目標完賽時間,得出輕鬆跑、節奏跑與間歇跑配速"
                    : "Enter a goal finish time to get easy, tempo and interval paces"
                }
              />
              <div className="flex gap-1 bg-muted/50 p-1 rounded-lg mb-5 max-w-xs">
                {([
                  { k: "10K" as RaceKey, label: "10K" },
                  { k: "HM" as RaceKey, label: zh ? "半馬" : "Half" },
                  { k: "FM" as RaceKey, label: zh ? "全馬" : "Marathon" },
                ] as const).map((r) => (
                  <button
                    key={r.k}
                    onClick={() => setTargetRace(r.k)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      targetRace === r.k
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <BlogPaceCalculator race={targetRace} lang={lang} defaultOpen />
            </Card>
          </TabsContent>

          <TabsContent value="fuel" className="mt-5">
            <Card className="p-6">
              <SectionHeader
                title={zh ? "比賽補給計算器" : "Race Nutrition Calculator"}
                desc={zh ? "半馬與全馬的能量膠與碳水補給規劃" : "Gel & carb planning for half and full marathon"}
              />
              <RaceFuelCalculator isZh={zh} />
            </Card>
          </TabsContent>

          <TabsContent value="checklist" className="mt-5">
            <Card className="p-6 print:border-0 print:shadow-none print:p-0">
              <div className="print:hidden">
                <SectionHeader
                  title={zh ? "比賽日檢查清單" : "Race Day Checklist"}
                  desc={
                    zh
                      ? "10K、半馬、全馬適用 — 打勾記錄準備進度,並可列印或儲存為 PDF"
                      : "For 10K, half and full marathon — tick off your prep, then print it or save as PDF"
                  }
                />
              </div>
              <RaceDayChecklist lang={lang} />
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display font-semibold text-lg">{title}</h2>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}

export default Tools;
