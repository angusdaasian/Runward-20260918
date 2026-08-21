import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Globe, Smartphone, ArrowLeft, Gauge, Beaker, Activity, Timer, Calculator } from "lucide-react";
import appIcon from "@/assets/app-icon.png";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DesktopPaceCalculator from "@/components/dashboard/DesktopPaceCalculator";
import CalculatorTab from "@/components/CalculatorTab";
import EquivalentTab from "@/components/EquivalentTab";
import { RaceFuelCalculator } from "@/components/FuelingGuide";
import BlogPaceCalculator, { type RaceKey } from "@/components/blog/BlogPaceCalculator";
import { applySeoHead } from "@/lib/seoHead";

const APP_STORE_URL = "https://apps.apple.com/us/app/runward/id6761060757";

type Lang = "en" | "zh";

const Calculators = () => {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("app_lang") as Lang) || "zh");
  const zh = lang === "zh";
  const [score, setScore] = useState<number | null>(null);
  const [targetRace, setTargetRace] = useState<RaceKey>("HM");

  const toggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    localStorage.setItem("app_lang", next);
    setLang(next);
  };

  useEffect(() => {
    applySeoHead({
      title: zh
        ? "免費跑步計算機 — 配速、跑力等級、補給 | Runward"
        : "Free Running Calculators — Pace, Running Level, Nutrition | Runward",
      description: zh
        ? "免費跑步計算機：配速換算與分段表、跑力等級評分、同等成績預測、比賽補給規劃與目標時間訓練配速。"
        : "Free running calculators: pace conversion and split tables, running level score, equivalent race times, race nutrition planning and target-time training paces.",
      canonical: "https://runward.site/calculators",
    });
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
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          {zh ? "返回首頁" : "Back to home"}
        </Link>

        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Calculator className="h-5 w-5" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              {zh ? "實用計算機" : "Useful Calculators"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {zh
              ? "全部免費、無需註冊。配速換算、跑力等級評分、同等成績、比賽補給與目標時間訓練配速 — 想要根據你真實訓練數據自動調整的課表,請使用 Runward App。"
              : "All free, no sign-up needed. Pace conversion, running level score, equivalent times, race nutrition and target-time training paces — for plans that adapt to your real training data, use the Runward app."}
          </p>
        </header>

        <Tabs defaultValue="pace" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="pace" className="gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              {zh ? "配速計算" : "Pace"}
            </TabsTrigger>
            <TabsTrigger value="level" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {zh ? "跑力等級" : "Running Level"}
            </TabsTrigger>
            <TabsTrigger value="equivalent" className="gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {zh ? "同等成績" : "Equivalent Times"}
            </TabsTrigger>
            <TabsTrigger value="training" className="gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              {zh ? "訓練配速" : "Training Paces"}
            </TabsTrigger>
            <TabsTrigger value="fuel" className="gap-1.5">
              <Beaker className="h-3.5 w-3.5" />
              {zh ? "比賽補給" : "Nutrition"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pace" className="mt-5">
            <Card className="p-6">
              <SectionHeader
                title={zh ? "配速計算器" : "Pace Calculator"}
                desc={
                  zh
                    ? "在配速、時間與距離之間轉換,並產生分段表"
                    : "Convert between pace, time and distance, plus generate split tables"
                }
              />
              <DesktopPaceCalculator lang={lang} />
            </Card>
          </TabsContent>

          <TabsContent value="level" className="mt-5">
            <Card className="p-6">
              <SectionHeader
                title={zh ? "跑力等級計算器" : "Running Level Calculator"}
                desc={
                  zh
                    ? "輸入一次比賽成績或配速,計算你的跑力分數"
                    : "Enter a race result or pace to get your running level score"
                }
              />
              <CalculatorTab score={score} setScore={setScore} lang={lang} />
            </Card>
          </TabsContent>

          <TabsContent value="equivalent" className="mt-5">
            <Card className="p-6">
              <SectionHeader
                title={zh ? "同等成績預測" : "Equivalent Race Times"}
                desc={
                  zh
                    ? "根據跑力分數換算各項公路與田徑距離的同等成績"
                    : "Convert a running level score into equivalent road and track times"
                }
              />
              <EquivalentTab score={score} lang={lang} />
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
              <BlogPaceCalculator race={targetRace} lang={lang} />
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

export default Calculators;
