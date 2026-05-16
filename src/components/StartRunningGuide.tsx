import { ArrowLeft, ShoppingBag, Timer, MessageCircle, TrendingUp, Bed, Route, Flame, Droplet, Dumbbell, Trophy, Footprints, AlertTriangle } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Step {
  icon: typeof Footprints;
  color: string; // tailwind text color class
  bg: string;    // tailwind bg color class for icon circle
  en: { title: string; body: string };
  zh: { title: string; body: string };
}

const steps: Step[] = [
  {
    icon: ShoppingBag, color: "text-orange-500", bg: "bg-orange-500/10",
    en: { title: "Get the right shoes", body: "Visit a specialty running store for a gait analysis. Replace shoes every 500–800 km. Good shoes prevent the most common beginner injuries." },
    zh: { title: "選對跑鞋", body: "到專業跑店做步態分析，挑選適合腳型的跑鞋。每 500–800 公里換一雙。合腳的鞋是預防新手傷痛的第一步。" },
  },
  {
    icon: Timer, color: "text-blue-500", bg: "bg-blue-500/10",
    en: { title: "Start with run/walk", body: "Run 1 min, walk 2 min, repeat 8× — 3 days per week. Each week add 30s running, drop 30s walking. In 8–10 weeks you can run 30 min non-stop." },
    zh: { title: "跑走交替開始", body: "跑 1 分鐘、走 2 分鐘，重複 8 次，每週 3 次。每週多跑 30 秒、少走 30 秒。8–10 週後即可連續跑 30 分鐘。" },
  },
  {
    icon: MessageCircle, color: "text-emerald-500", bg: "bg-emerald-500/10",
    en: { title: "Slow down — talk test", body: "You should be able to hold a full conversation while running. 80% of runs should feel easy, only 20% hard. Most beginners run too fast." },
    zh: { title: "放慢 — 對話測試", body: "跑步時要能完整講話。80% 訓練輕鬆、只有 20% 高強度。大部分新手都跑太快。" },
  },
  {
    icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-500/10",
    en: { title: "The 10% rule", body: "Never increase weekly mileage by more than 10%. Bones and tendons adapt slower than muscles. Doing too much too soon is the #1 cause of injury." },
    zh: { title: "10% 增量原則", body: "每週總跑量增加不超過 10%。骨骼與肌腱適應比肌肉慢。過快增量是受傷的頭號原因。" },
  },
  {
    icon: Bed, color: "text-indigo-500", bg: "bg-indigo-500/10",
    en: { title: "Rest is non-negotiable", body: "Run on alternate days at first. Recovery is when you actually get stronger. Cross-train (bike, swim, light strength) on rest days." },
    zh: { title: "休息日不可省", body: "初期請隔天跑。休息日身體才真的變強。可在休息日做單車、游泳、輕量重訓。" },
  },
  {
    icon: Route, color: "text-cyan-500", bg: "bg-cyan-500/10",
    en: { title: "Build a weekly long run", body: "Once you can run 30 min, pick one run per week and slowly extend it. The long run is the foundation for any 5K, 10K, half or full marathon." },
    zh: { title: "每週一次長跑", body: "能連續跑 30 分鐘後，每週固定一次「長跑」並逐步加長。它是 5K、10K、半馬與全馬的共同基礎。" },
  },
  {
    icon: Flame, color: "text-rose-500", bg: "bg-rose-500/10",
    en: { title: "Warm up & cool down", body: "5 min brisk walk + dynamic drills before. 5 min easy walk + stretches for calves, hamstrings, hips, glutes after. Big drop in stiffness and injury." },
    zh: { title: "熱身與緩和", body: "跑前 5 分鐘快走加動態熱身。跑後 5 分鐘慢走，伸展小腿、腿後、髖部、臀肌。能大幅減少僵硬與受傷。" },
  },
  {
    icon: Droplet, color: "text-sky-500", bg: "bg-sky-500/10",
    en: { title: "Fuel & hydrate", body: "Drink water all day, not just before runs. Under 60 min: water is enough. Over 60 min: add electrolytes and easy carbs (gels, bananas)." },
    zh: { title: "補水與營養", body: "整天規律補水，不要只在跑前。60 分鐘以內喝水即可；超過 60 分鐘要補電解質與好消化碳水（果膠、香蕉）。" },
  },
  {
    icon: Dumbbell, color: "text-amber-500", bg: "bg-amber-500/10",
    en: { title: "Add strength training", body: "Two short sessions a week — squats, lunges, planks, glute bridges, calf raises. Strong hips and core fix most form problems automatically." },
    zh: { title: "加入肌力訓練", body: "每週兩次短時間肌力（深蹲、弓步、棒式、臀橋、提踵）。強壯的髖部與核心會自動修正大部分跑姿問題。" },
  },
  {
    icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-500/10",
    en: { title: "Sign up for a 5K", body: "Nothing keeps you consistent like a race on the calendar. A local 5K in 8–12 weeks is the perfect first goal. Every runner started where you are now." },
    zh: { title: "報名一場 5K", body: "行事曆上有比賽最能維持規律。8–12 週後的 5K 是完美的第一目標。每位跑者都是從你現在這一步開始的。" },
  },
];

interface Props {
  lang: Lang;
  onBack: () => void;
}

const StartRunningGuide = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";
  return (
    <div className="px-5 pt-2 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1"
      >
        <ArrowLeft size={18} />
        <span>{isZh ? "返回" : "Back"}</span>
      </button>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-primary/40 p-5 mb-5 text-primary-foreground">
        <div className="absolute -right-4 -bottom-4 opacity-20">
          <Footprints size={140} strokeWidth={1.2} />
        </div>
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 bg-primary-foreground/20 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider mb-2">
            <Footprints size={11} />
            {isZh ? "新手指南" : "Beginner Guide"}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight mb-1.5">
            {isZh ? "如何開始長距離跑步" : "How to Start Long Distance Running"}
          </h1>
          <p className="text-xs opacity-90 leading-relaxed max-w-[85%]">
            {isZh
              ? "10 個關鍵步驟，從零開始安全跑到 5K 甚至馬拉松。"
              : "10 essential steps to take you from zero to 5K — and beyond — safely."}
          </p>
          <div className="flex items-center gap-3 mt-3 text-[11px]">
            <div className="flex items-center gap-1 bg-primary-foreground/15 rounded-md px-2 py-0.5">
              <Timer size={11} /> 8–12 {isZh ? "週" : "weeks"}
            </div>
            <div className="flex items-center gap-1 bg-primary-foreground/15 rounded-md px-2 py-0.5">
              <Trophy size={11} /> 5K {isZh ? "目標" : "goal"}
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const c = isZh ? step.zh : step.en;
          return (
            <div key={i} className="flex gap-3 items-start">
              <div className={`shrink-0 w-12 h-12 rounded-2xl ${step.bg} flex items-center justify-center border border-border`}>
                <Icon size={22} className={step.color} strokeWidth={2} />
              </div>
              <div className="flex-1 bg-card border border-border rounded-xl p-3">
                <h3 className="font-display font-semibold text-sm text-foreground mb-1 leading-tight">
                  {c.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="mt-5 flex items-start gap-2 bg-muted/50 border border-border rounded-xl p-3">
        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {isZh
            ? "本指南為一般建議。如有傷病或健康問題，請先諮詢醫師。"
            : "General guidance only. Consult a doctor before starting if you have any injuries or health concerns."}
        </p>
      </div>
    </div>
  );
};

export default StartRunningGuide;
