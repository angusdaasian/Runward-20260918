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
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Normal meal, nothing extra", zh: "正常一餐即可" } },
      { label: { en: "During", zh: "主訓練" }, when: { en: "30–70 min", zh: "30–70 分鐘" }, what: { en: "Water only", zh: "只喝水" } },
    ],
  },
  {
    icon: Mountain, color: "text-cyan-500", bg: "bg-cyan-500/10",
    en: { title: "Long Run", desc: "Marathon-style endurance. Train your gut by taking carbs every 30–45 min." },
    zh: { title: "長跑", desc: "馬拉松式耐力訓練。每 30–45 分鐘補一次碳水，訓練腸胃適應。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Carb-rich meal (~60–80 g carbs): oats, toast, banana, rice", zh: "高碳水餐（約 60–80g 碳水）：燕麥、吐司、香蕉、米飯" } },
      { label: { en: "During", zh: "主訓練" }, when: { en: "40–160 min", zh: "40–160 分鐘" }, what: { en: "30–60 g carbs/hour — 1 standard gel (~25 g) every 30 min", zh: "每小時 30–60g 碳水 — 每 30 分鐘 1 包標準果膠（約 25g）" } },
    ],
  },
  {
    icon: Timer, color: "text-amber-500", bg: "bg-amber-500/10",
    en: { title: "Tempo / Threshold", desc: "Sustained moderate-hard effort. Top up before, sip a carb drink between intervals." },
    zh: { title: "節奏 / 閾值跑", desc: "中高強度持續跑。跑前先補一點，間歇之間喝點運動飲料。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Small carb snack (~40 g): banana + toast, energy bar", zh: "小份碳水點心（約 40g）：香蕉加吐司、能量棒" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "10–30 min", zh: "10–30 分鐘" }, what: { en: "1 standard gel (~25 g carbs), caffeine optional", zh: "1 包標準果膠（約 25g 碳水），可選含咖啡因" } },
      { label: { en: "Main set", zh: "主訓練" }, when: { en: "20–70 min", zh: "20–70 分鐘" }, what: { en: "Sip a carb-electrolyte drink (~30–40 g per bottle)", zh: "小口喝碳水電解質飲（每瓶約 30–40g）" } },
    ],
  },
  {
    icon: Zap, color: "text-rose-500", bg: "bg-rose-500/10",
    en: { title: "Intervals / VO₂ Max", desc: "Hard repeats at 3–10K pace. Pre-load energy; sip a carb drink between sets." },
    zh: { title: "間歇 / VO₂ Max", desc: "3–10K 配速的高強度間歇。賽前先儲能，組間靠運動飲料。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Small carb snack (~40 g)", zh: "小份碳水點心（約 40g）" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "10–30 min", zh: "10–30 分鐘" }, what: { en: "1 caffeinated gel (~25 g carbs + 75–100 mg caffeine)", zh: "1 包含咖啡因果膠（約 25g 碳水 + 75–100mg 咖啡因）" } },
      { label: { en: "Between sets", zh: "組間" }, when: { en: "20–70 min", zh: "20–70 分鐘" }, what: { en: "1–2 sips of carb-electrolyte drink", zh: "1–2 口碳水電解質飲" } },
    ],
  },
  {
    icon: Flame, color: "text-orange-500", bg: "bg-orange-500/10",
    en: { title: "Hill Repeats", desc: "Steep efforts at 5–10% grade. Fuel like an interval session — caffeine helps on heavy days." },
    zh: { title: "上坡反覆跑", desc: "5–10% 坡度的強度跑。補給比照間歇，重訓量日可加咖啡因。" },
    phases: [
      { label: { en: "Pre-run", zh: "跑前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Small carb snack (~40 g)", zh: "小份碳水點心（約 40g）" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "10–30 min", zh: "10–30 分鐘" }, what: { en: "1 caffeinated gel", zh: "1 包含咖啡因果膠" } },
      { label: { en: "Main set", zh: "主訓練" }, when: { en: "20–70 min", zh: "20–70 分鐘" }, what: { en: "Sip carb-electrolyte drink between reps", zh: "組間小口喝碳水電解質飲" } },
    ],
  },
];

const races: Race[] = [
  {
    icon: Trophy, color: "text-purple-500", bg: "bg-purple-500/10",
    en: { title: "5K – 10K", tag: "Short & sharp" },
    zh: { title: "5K – 10K", tag: "短距離衝刺" },
    carbs: { en: "0 gels — pre-fuel only", zh: "全程 0 包果膠 — 賽前補足即可" },
    phases: [
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Light carb meal (~40 g): toast, banana, oatmeal", zh: "輕量碳水餐（約 40g）：吐司、香蕉、燕麥" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "15–45 min before", zh: "起跑前 15–45 分鐘" }, what: { en: "1 caffeinated gel (~25 g + caffeine)", zh: "1 包含咖啡因果膠（約 25g + 咖啡因）" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Race time", zh: "全程" }, what: { en: "Water at stations — no gels needed", zh: "水站喝水即可，無需果膠" } },
    ],
  },
  {
    icon: Trophy, color: "text-blue-500", bg: "bg-blue-500/10",
    en: { title: "Half Marathon", tag: "~75–80 g carbs in-race" },
    zh: { title: "半程馬拉松", tag: "比賽中約 75–80g 碳水" },
    carbs: { en: "Take 2–3 gels total (every ~6 km)", zh: "全程約 2–3 包果膠（每 6 公里 1 包）" },
    phases: [
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Carb meal (~60–80 g): oats, bagel, banana", zh: "碳水餐（約 60–80g）：燕麥、貝果、香蕉" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "15–45 min before", zh: "起跑前 15–45 分鐘" }, what: { en: "1 caffeinated gel", zh: "1 包含咖啡因果膠" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Every ~6 km", zh: "每 ~6 公里" }, what: { en: "1 gel (~25 g) + water", zh: "1 包果膠（約 25g）+ 水" } },
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
    en: { title: "Marathon", tag: "~175–200 g carbs in-race" },
    zh: { title: "全程馬拉松", tag: "比賽中約 175–200g 碳水" },
    carbs: { en: "Take 6–8 gels total (every ~5–6 km)", zh: "全程約 6–8 包果膠（每 5–6 公里 1 包）" },
    phases: [
      { label: { en: "Carb-load", zh: "碳水充填" }, when: { en: "2–3 days before", zh: "賽前 2–3 天" }, what: { en: "Ramp carbs to 8–10 g/kg bodyweight/day while tapering training — pasta, rice, bread, potatoes. Cut fat/fibre. Modern research shows muscle glycogen needs ~36–48 h to fully saturate — one pasta dinner is not enough.", zh: "每日碳水提升至 8–10g/kg 體重，同時減量訓練 — 義大利麵、米飯、麵包、馬鈴薯。降低脂肪與纖維。研究指出肌肉肝醣需 36–48 小時才能完全充填，光靠賽前一晚絕對不夠。" } },
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Carb meal (~80–100 g): oatmeal, bagel + jam, banana. Low fat/fibre.", zh: "碳水餐（約 80–100g）：燕麥、貝果加果醬、香蕉。低脂低纖。" } },
      { label: { en: "Warm-up", zh: "熱身" }, when: { en: "~15 min before", zh: "起跑前約 15 分鐘" }, what: { en: "1 caffeinated gel", zh: "1 包含咖啡因果膠" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Every ~5–6 km", zh: "每 ~5–6 公里" }, what: { en: "1 gel (~25 g) — mix 2 caffeinated into the second half", zh: "1 包果膠（約 25g）— 後半段加入 2 包含咖啡因" } },
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
    carbs: { en: "Rotate gels, sports drink and real food every 3 h to reset taste", zh: "每 3 小時輪替果膠、運動飲料與真食物，避免味覺疲勞" },
    phases: [
      { label: { en: "Preload", zh: "賽前一日" }, when: { en: "Day before", zh: "賽前一晚" }, what: { en: "High-carb meals throughout the day", zh: "整日高碳水飲食" } },
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Carb meal (~60–80 g) + electrolyte drink", zh: "碳水餐（約 60–80g）+ 電解質飲" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Per hour", zh: "每小時" }, what: { en: "Mix gels, chews, sports drink, and real food (banana, rice ball, PB&J) to hit 30–60 g", zh: "果膠、軟糖、運動飲料、真食物（香蕉、飯糰、花生果醬三明治）混合，達到 30–60g" } },
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
            {isZh ? "補給指南" : "Fueling Guide"}
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

      {/* What's in a sports gel */}
      <div className="mb-6 bg-card border border-border rounded-xl p-4">
        <h2 className="font-display text-base font-bold mb-2 flex items-center gap-1.5">
          <Beaker size={16} className="text-primary" />
          {isZh ? "果膠裡有什麼？" : "What's in a Sports Gel?"}
        </h2>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          {isZh
            ? "市面果膠成分大同小異 — 你可以選任何品牌（SiS、GU、High5、Precision、Maurten、Huma 等）。重點看每包碳水克數，而不是品牌。"
            : "Most sports gels share the same building blocks — any reputable brand works (SiS, GU, High5, Precision, Maurten, Huma, etc.). What matters is the carbs per sachet, not the logo."}
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold mb-0.5">{isZh ? "雙碳水組合" : "Dual carbs"}</div>
            <div className="text-muted-foreground">{isZh ? "麥芽糊精 + 果糖（2:1 比例）— 吸收更快、上限更高" : "Maltodextrin + fructose (2:1) — faster uptake, higher ceiling"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold mb-0.5">{isZh ? "電解質" : "Electrolytes"}</div>
            <div className="text-muted-foreground">{isZh ? "鈉、鉀 — 預防抽筋與低血鈉" : "Sodium, potassium — cramp & hyponatremia defence"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold mb-0.5">{isZh ? "咖啡因（選用）" : "Caffeine (optional)"}</div>
            <div className="text-muted-foreground">{isZh ? "每包 25–100 mg — 後段衝刺神器" : "25–100 mg per gel — late-race kick"}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="font-semibold mb-0.5">{isZh ? "水分搭配" : "Take with water"}</div>
            <div className="text-muted-foreground">{isZh ? "每包配 150–200 ml 水，預防腸胃不適" : "150–200 ml water per gel to prevent GI issues"}</div>
          </div>
        </div>
      </div>

      {/* Key principles */}
      <div className="mb-6">
        <h2 className="font-display text-base font-bold mb-2 flex items-center gap-1.5">
          <Info size={16} className="text-primary" />
          {isZh ? "每小時碳水攝取" : "Carbs per Hour"}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "短於" : "Under"} 60 min</div>
            <div className="text-sm font-semibold">{isZh ? "只需喝水" : "Water is enough"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">0 {isZh ? "包" : "gels"}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">60–90 min</div>
            <div className="text-sm font-semibold">30–60 g {isZh ? "碳水/小時" : "carbs/h"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">1–2 {isZh ? "包/小時" : "gels/h"}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "超過" : "Over"} 90 min</div>
            <div className="text-sm font-semibold">60–90 g {isZh ? "碳水/小時" : "carbs/h"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">2–3 {isZh ? "包/小時" : "gels/h"}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "精英級" : "Elite"}</div>
            <div className="text-sm font-semibold">90–120 g {isZh ? "碳水/小時" : "carbs/h"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">3–4 {isZh ? "包/小時（需訓練）" : "gels/h (train it!)"}</div>
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
            ? "本指南整合多項運動營養研究，僅作教育用途。請在訓練中試用補給策略，比賽前勿嘗試新產品。如有特殊醫療狀況請諮詢專業人士。"
            : "Based on general sports-nutrition research. Educational reference only — always test fueling in training, never try anything new on race day. Consult a professional for medical concerns."}
        </p>
      </div>
    </div>
  );
};

export default FuelingGuide;
