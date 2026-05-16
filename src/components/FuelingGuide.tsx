import { ArrowLeft, Droplet, Zap, Flame, Timer, Trophy, Mountain, Coffee, Apple, AlertTriangle, Info, Beaker } from "lucide-react";
import { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onBack: () => void;
}

type Phase = { label: { en: string; zh: string }; when: { en: string; zh: string }; what: { en: string; zh: string } };

interface Session {
  icon: typeof Flame;
  color: string;
  bg: string;
  en: { title: string; desc: string };
  zh: { title: string; desc: string };
  phases: Phase[];
}

interface Race {
  icon: typeof Trophy;
  color: string;
  bg: string;
  en: { title: string; tag: string };
  zh: { title: string; tag: string };
  carbs: { en: string; zh: string };
  phases: Phase[];
  splits?: { pace: string; rate: string }[];
}

const trainingSessions: Session[] = [
  {
    icon: Droplet, color: "text-emerald-500", bg: "bg-emerald-500/10",
    en: { title: "Easy / Recovery Run", desc: "Low intensity, slower than marathon pace. Usually no fueling needed — sip water in heat." },
    zh: { title: "輕鬆 / 恢復跑", desc: "低強度、比馬拉松配速慢。一般不需補給，天熱時記得喝水。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Nothing required", zh: "無需補給" } },
      { label: { en: "During", zh: "主訓練" }, when: { en: "30–70 min", zh: "30–70 分鐘" }, what: { en: "Water only", zh: "只喝水" } },
    ],
  },
  {
    icon: Mountain, color: "text-cyan-500", bg: "bg-cyan-500/10",
    en: { title: "Long Run", desc: "Marathon-style endurance. 1 gel per hour keeps blood sugar steady and trains your gut." },
    zh: { title: "長跑", desc: "馬拉松式耐力訓練。每小時 1 包果膠維持血糖並訓練腸胃。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Solid 160 (25–40 g carbs)", zh: "Solid 160（25–40g 碳水）" } },
      { label: { en: "During", zh: "主訓練" }, when: { en: "40–160 min", zh: "40–160 分鐘" }, what: { en: "1 × Gel 100 or Gel 160 per hour", zh: "每小時 1 包 Gel 100 或 Gel 160" } },
    ],
  },
  {
    icon: Timer, color: "text-amber-500", bg: "bg-amber-500/10",
    en: { title: "Tempo / Threshold", desc: "Sustained moderate-hard effort. Top up before, sip drink mix between intervals." },
    zh: { title: "節奏 / 閾值跑", desc: "中高強度持續跑。跑前先補一點，間歇之間喝點運動飲料。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "1 × Solid 160 or Solid C 160", zh: "1 × Solid 160 或 Solid C 160" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "10–30 min", zh: "10–30 分鐘" }, what: { en: "1 × Gel 100 (Caf optional)", zh: "1 × Gel 100（可含咖啡因）" } },
      { label: { en: "Main set", zh: "主訓練" }, when: { en: "20–70 min", zh: "20–70 分鐘" }, what: { en: "Sip Drink Mix 160 / 320", zh: "小口喝 Drink Mix 160 / 320" } },
    ],
  },
  {
    icon: Zap, color: "text-rose-500", bg: "bg-rose-500/10",
    en: { title: "Intervals / VO₂ Max", desc: "Hard repeats at 3–10K pace. Pre-load energy; rely on drink mix between sets." },
    zh: { title: "間歇 / VO₂ Max", desc: "3–10K 配速的高強度間歇。賽前先儲能，組間靠運動飲料。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "1 × Solid 160", zh: "1 × Solid 160" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "10–30 min", zh: "10–30 分鐘" }, what: { en: "1 × Gel 100 Caf 100", zh: "1 × Gel 100 Caf 100" } },
      { label: { en: "Between sets", zh: "組間" }, when: { en: "20–70 min", zh: "20–70 分鐘" }, what: { en: "1–2 sips Drink Mix 160 / 320", zh: "1–2 口 Drink Mix 160 / 320" } },
    ],
  },
  {
    icon: Flame, color: "text-orange-500", bg: "bg-orange-500/10",
    en: { title: "Hill Repeats", desc: "Steep efforts at 5–10% grade. Bicarb pre-load helps buffer fatigue on heavy lactate days." },
    zh: { title: "上坡反覆跑", desc: "5–10% 坡度的強度跑。賽前小蘇打有助緩衝乳酸。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Bicarb System (optional)", zh: "Bicarb System（選用）" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "10–30 min", zh: "10–30 分鐘" }, what: { en: "1 × Gel 100 Caf 100", zh: "1 × Gel 100 Caf 100" } },
      { label: { en: "Main set", zh: "主訓練" }, when: { en: "20–70 min", zh: "20–70 分鐘" }, what: { en: "Sip Drink Mix between reps", zh: "組間小口喝 Drink Mix" } },
    ],
  },
];

const races: Race[] = [
  {
    icon: Trophy, color: "text-purple-500", bg: "bg-purple-500/10",
    en: { title: "5K – 10K", tag: "Short & sharp" },
    zh: { title: "5K – 10K", tag: "短距離衝刺" },
    carbs: { en: "No in-race fueling needed", zh: "比賽中無需補給" },
    phases: [
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "1 × Drink Mix 160 or Solid 160", zh: "1 × Drink Mix 160 或 Solid 160" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "15–45 min before", zh: "起跑前 15–45 分鐘" }, what: { en: "1 × Gel 100 Caf 100", zh: "1 × Gel 100 Caf 100" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Race time", zh: "全程" }, what: { en: "Nothing", zh: "無需補給" } },
    ],
  },
  {
    icon: Trophy, color: "text-blue-500", bg: "bg-blue-500/10",
    en: { title: "Half Marathon", tag: "75–80 g carbs total" },
    zh: { title: "半程馬拉松", tag: "全程約 75–80g 碳水" },
    carbs: { en: "2 × Gel 160 or 3 × Gel 100", zh: "2 × Gel 160 或 3 × Gel 100" },
    phases: [
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "1 × Drink Mix 160 or Solid C 160", zh: "1 × Drink Mix 160 或 Solid C 160" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "15–45 min before", zh: "起跑前 15–45 分鐘" }, what: { en: "1 × Gel 100 Caf 100", zh: "1 × Gel 100 Caf 100" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Every ~6 km", zh: "每 ~6 公里" }, what: { en: "1 × Gel 100 (or 1 × Gel 160 @ 10 km)", zh: "1 × Gel 100（或 10 公里時 1 × Gel 160）" } },
    ],
    splits: [
      { pace: "Sub 1:15", rate: "60–64 g/h" },
      { pace: "Sub 1:30", rate: "50–53 g/h" },
      { pace: "Sub 1:45", rate: "43–46 g/h" },
      { pace: "Sub 2:00", rate: "38–40 g/h" },
      { pace: "Sub 2:15", rate: "33–36 g/h" },
    ],
  },
  {
    icon: Trophy, color: "text-red-500", bg: "bg-red-500/10",
    en: { title: "Marathon", tag: "175–200 g carbs total" },
    zh: { title: "全程馬拉松", tag: "全程約 175–200g 碳水" },
    carbs: { en: "5 × Gel 160 or 7 × Gel 100", zh: "5 × Gel 160 或 7 × Gel 100" },
    phases: [
      { label: { en: "Preload", zh: "賽前一日" }, when: { en: "Day before", zh: "賽前一晚" }, what: { en: "1 × Drink Mix 320 + 1 × Solid 160", zh: "1 × Drink Mix 320 + 1 × Solid 160" } },
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "1 × Drink Mix 160 + 1 × Solid 160", zh: "1 × Drink Mix 160 + 1 × Solid 160" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "15 min before", zh: "起跑前 15 分鐘" }, what: { en: "1 × Gel 100 Caf 100", zh: "1 × Gel 100 Caf 100" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Every ~6 km", zh: "每 ~6 公里" }, what: { en: "1 × Gel 100  (6 total, mix in 2 × Caf)", zh: "1 × Gel 100（共 6 包，其中 2 包含咖啡因）" } },
    ],
    splits: [
      { pace: "Sub 2:30", rate: "70–80 g/h" },
      { pace: "Sub 3:00", rate: "58–67 g/h" },
      { pace: "Sub 3:30", rate: "50–57 g/h" },
      { pace: "Sub 4:00", rate: "44–50 g/h" },
      { pace: "Sub 4:30", rate: "39–44 g/h" },
    ],
  },
  {
    icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-500/10",
    en: { title: "Ultra Distance", tag: "30–60 g carbs / hour" },
    zh: { title: "超級馬拉松", tag: "每小時 30–60g 碳水" },
    carbs: { en: "Reset taste buds with Solid every 3 h", zh: "每 3 小時用 Solid 重整味覺" },
    phases: [
      { label: { en: "Preload", zh: "賽前一日" }, when: { en: "Day before", zh: "賽前一晚" }, what: { en: "1 × Drink Mix 320 or 1 × Solid 160", zh: "1 × Drink Mix 320 或 1 × Solid 160" } },
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "1 × Drink Mix 160 or Solid 160", zh: "1 × Drink Mix 160 或 Solid 160" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Per hour", zh: "每小時" }, what: { en: "Mix gels + drink mix to hit 30–60 g", zh: "果膠 + 飲料組合，達到 30–60g" } },
    ],
  },
];

const FuelingGuide = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";

  return (
    <div className="px-5 pt-2 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground mb-3 -ml-1">
        <ArrowLeft size={18} />
        <span>{isZh ? "返回" : "Back"}</span>
      </button>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 p-5 mb-5 text-white">
        <div className="absolute -right-6 -bottom-6 opacity-20">
          <Flame size={150} strokeWidth={1.2} />
        </div>
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider mb-2">
            <Beaker size={11} />
            {isZh ? "補給指南 · Maurten 參考" : "Fueling Guide · Maurten reference"}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight mb-1.5">
            {isZh ? "跑者補給策略" : "Fuel Like a Pro Runner"}
          </h1>
          <p className="text-xs opacity-95 leading-relaxed max-w-[90%]">
            {isZh
              ? "用對的時間、對的碳水量，跑得更遠、撞牆更晚。練習中試用，比賽日才不會出包。"
              : "Right carbs, right timing — run further, hit the wall later. Always practice fueling in training before race day."}
          </p>
        </div>
      </div>

      {/* Key principles */}
      <div className="mb-6">
        <h2 className="font-display text-base font-bold mb-2 flex items-center gap-1.5">
          <Info size={16} className="text-primary" />
          {isZh ? "核心原則" : "Core Principles"}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "短於" : "Under"} 60 min</div>
            <div className="text-sm font-semibold">{isZh ? "只需喝水" : "Water is enough"}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">60–90 min</div>
            <div className="text-sm font-semibold">30–60 g {isZh ? "碳水/小時" : "carbs/h"}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "超過" : "Over"} 90 min</div>
            <div className="text-sm font-semibold">60–90 g {isZh ? "碳水/小時" : "carbs/h"}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "精英級" : "Elite"}</div>
            <div className="text-sm font-semibold">90–120 g {isZh ? "碳水/小時" : "carbs/h"}</div>
          </div>
        </div>
      </div>

      {/* Training sessions */}
      <h2 className="font-display text-base font-bold mb-2 flex items-center gap-1.5">
        <Apple size={16} className="text-emerald-500" />
        {isZh ? "訓練日補給" : "Training Fueling"}
      </h2>
      <div className="space-y-3 mb-6">
        {trainingSessions.map((s, i) => {
          const Icon = s.icon;
          const c = isZh ? s.zh : s.en;
          return (
            <div key={i} className="bg-card border border-border rounded-xl p-3.5">
              <div className="flex items-start gap-3 mb-2.5">
                <div className={`shrink-0 w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center border border-border`}>
                  <Icon size={20} className={s.color} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-sm leading-tight">{c.title}</h3>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{c.desc}</p>
                </div>
              </div>
              <div className="space-y-1.5 pl-1">
                {s.phases.map((p, j) => (
                  <div key={j} className="flex items-start gap-2 text-[11px]">
                    <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                    <div className="flex-1">
                      <span className="font-semibold">{isZh ? p.label.zh : p.label.en}</span>
                      <span className="text-muted-foreground"> · {isZh ? p.when.zh : p.when.en}</span>
                      <div className="text-muted-foreground">→ {isZh ? p.what.zh : p.what.en}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Race day */}
      <h2 className="font-display text-base font-bold mb-2 flex items-center gap-1.5">
        <Trophy size={16} className="text-warning" />
        {isZh ? "比賽日補給" : "Race Day Fueling"}
      </h2>
      <div className="space-y-3 mb-6">
        {races.map((r, i) => {
          const Icon = r.icon;
          const c = isZh ? r.zh : r.en;
          return (
            <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className={`${r.bg} px-3.5 py-3 border-b border-border flex items-start gap-3`}>
                <div className={`shrink-0 w-11 h-11 rounded-xl bg-background flex items-center justify-center border border-border`}>
                  <Icon size={20} className={r.color} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-sm leading-tight">{c.title}</h3>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{c.tag}</div>
                  <div className={`text-[11px] font-semibold ${r.color} mt-0.5`}>{isZh ? r.carbs.zh : r.carbs.en}</div>
                </div>
              </div>
              <div className="p-3.5 space-y-2">
                {r.phases.map((p, j) => (
                  <div key={j} className="flex gap-2.5">
                    <div className="shrink-0 flex flex-col items-center pt-0.5">
                      <div className={`w-2 h-2 rounded-full ${r.color.replace("text-", "bg-")}`} />
                      {j < r.phases.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold">{isZh ? p.label.zh : p.label.en}</span>
                        <span className="text-[10px] text-muted-foreground">{isZh ? p.when.zh : p.when.en}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-snug">{isZh ? p.what.zh : p.what.en}</div>
                    </div>
                  </div>
                ))}
                {r.splits && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      {isZh ? "依配速分配" : "Carbs by finish time"}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {r.splits.map((sp, k) => (
                        <div key={k} className="flex justify-between bg-muted/50 rounded-md px-2 py-1 text-[11px]">
                          <span className="font-mono font-semibold">{sp.pace}</span>
                          <span className="text-muted-foreground">{sp.rate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hydration + caffeine tips */}
      <div className="grid grid-cols-1 gap-2 mb-5">
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 flex items-start gap-2.5">
          <Droplet size={16} className="text-sky-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold mb-0.5">{isZh ? "水分與電解質" : "Hydration & Electrolytes"}</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isZh
                ? "炎熱潮濕時每小時 500–750 ml 水並加電解質。深色尿液 = 補水不足。"
                : "In heat/humidity: 500–750 ml/h with electrolytes. Dark urine = under-hydrated."}
            </p>
          </div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
          <Coffee size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold mb-0.5">{isZh ? "咖啡因策略" : "Caffeine Strategy"}</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isZh
                ? "目標 3–6 mg/kg 體重。賽前 30–45 分鐘或最後 1/3 段使用咖啡因果膠效果最佳。"
                : "Aim 3–6 mg per kg bodyweight. Take caffeine 30–45 min pre-race or in the final third."}
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-xl p-3">
        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {isZh
            ? "資料參考自 Maurten Fuel Guides，僅作教育用途。請在訓練中試用補給策略，比賽前勿嘗試新產品。如有特殊醫療狀況請諮詢專業人士。"
            : "Adapted from Maurten Fuel Guides for educational reference. Always test fueling in training — never try anything new on race day. Consult a professional for medical concerns."}
        </p>
      </div>
    </div>
  );
};

export default FuelingGuide;
