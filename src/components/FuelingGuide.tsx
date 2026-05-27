import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Droplet, Zap, Flame, Timer, Trophy, Mountain, Coffee, Apple, AlertTriangle, Info, Beaker, ChevronDown, Calculator, Plus, X } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      { label: { en: "Carb-load", zh: "碳水充填" }, when: { en: "2–3 days before", zh: "賽前 2–3 天" }, what: { en: "Same as marathon — 8–10 g/kg/day carbs while tapering. Keep meals familiar; rehearse them in long-run blocks.", zh: "同馬拉松 — 每日 8–10g/kg 碳水並減量訓練。維持熟悉的食物，平時長跑時就先演練。" } },
      { label: { en: "Pre-race", zh: "賽前" }, when: { en: "1–4 h before", zh: "1–4 小時前" }, what: { en: "Carb meal (~60–80 g) + electrolyte drink", zh: "碳水餐（約 60–80g）+ 電解質飲" } },
      { label: { en: "During race", zh: "比賽中" }, when: { en: "Per hour", zh: "每小時" }, what: { en: "Mix gels, chews, sports drink, and real food (banana, rice ball, PB&J) to hit 30–60 g", zh: "果膠、軟糖、運動飲料、真食物（香蕉、飯糰、花生果醬三明治）混合，達到 30–60g" } },
    ],
  },
];

// ============================================================
// Gel nutrition database (carbs in grams per sachet)
// Source: dailyrunningco.com/energy-gels-comparison-table/ + AminoVital Red Shot (Ajinomoto JP)
// ============================================================
type Gel = { name: string; carbs: number; caffeine?: number };
const GEL_DB: Record<string, Gel[]> = {
  "AminoVital": [
    { name: "Red Shot (Pro 45g pouch)", carbs: 26, caffeine: 80 },
  ],
  "CLIF Shot": [
    { name: "Vanilla", carbs: 25 },
    { name: "Citrus (caf)", carbs: 25, caffeine: 25 },
    { name: "Mocha (caf)", carbs: 24, caffeine: 50 },
    { name: "Chocolate", carbs: 23 },
    { name: "Chocolate Cherry (caf)", carbs: 23, caffeine: 100 },
    { name: "Strawberry (caf)", carbs: 25, caffeine: 25 },
    { name: "Double Espresso (caf)", carbs: 24, caffeine: 100 },
    { name: "Razz", carbs: 24 },
  ],
  "GU Energy": [
    { name: "Cola Me Happy", carbs: 22 },
    { name: "Tri-Berry (caf)", carbs: 23, caffeine: 20 },
    { name: "Vanilla Bean (caf)", carbs: 22, caffeine: 20 },
    { name: "Chocolate Outrage (caf)", carbs: 21, caffeine: 20 },
    { name: "Strawberry Banana", carbs: 23 },
    { name: "Salted Caramel (caf)", carbs: 22, caffeine: 20 },
    { name: "Jet Blackberry (caf)", carbs: 22, caffeine: 40 },
    { name: "Espresso Love (caf)", carbs: 23, caffeine: 40 },
    { name: "Caramel Macchiato (caf)", carbs: 22, caffeine: 40 },
  ],
  "GU Roctane": [
    { name: "Cold Brew Coffee (caf)", carbs: 21, caffeine: 70 },
    { name: "Blueberry Pomegranate (caf)", carbs: 21, caffeine: 35 },
    { name: "Vanilla Orange (caf)", carbs: 21, caffeine: 35 },
    { name: "Sea Salt Chocolate (caf)", carbs: 21, caffeine: 35 },
    { name: "Salted Lime (caf)", carbs: 21, caffeine: 35 },
  ],
  "Huma": [
    { name: "Strawberry", carbs: 22 },
    { name: "Apple Cinnamon", carbs: 22 },
    { name: "Café Mocha (caf)", carbs: 25, caffeine: 50 },
    { name: "Chocolate (caf)", carbs: 25, caffeine: 25 },
    { name: "Lemonade (caf)", carbs: 22, caffeine: 25 },
    { name: "Plus Berries & Pomegranate", carbs: 21 },
    { name: "Plus Strawberry Lemonade (caf)", carbs: 21, caffeine: 25 },
  ],
  "KODA Nutrition": [
    { name: "Lemon Lime", carbs: 30 },
    { name: "Wild Berry", carbs: 30 },
    { name: "Green Plum (caf)", carbs: 30, caffeine: 80 },
    { name: "Cappuccino (caf)", carbs: 30, caffeine: 80 },
    { name: "Cola Vanilla (caf)", carbs: 30, caffeine: 80 },
  ],
  "Mag-On": [
    { name: "AO Mikan (caf)", carbs: 30, caffeine: 25 },
    { name: "Pink Grapefruit (caf)", carbs: 30, caffeine: 25 },
    { name: "Lemon (caf)", carbs: 30, caffeine: 25 },
    { name: "Apple", carbs: 30 },
    { name: "Ume", carbs: 30 },
  ],
  "Maurten": [
    { name: "Gel 100", carbs: 25 },
    { name: "Gel 100 Caf 100", carbs: 25, caffeine: 100 },
  ],
  "PURE Nutrition": [
    { name: "Manuka Honey", carbs: 23 },
    { name: "Raspberry (caf)", carbs: 25, caffeine: 30 },
    { name: "Lemon Lime", carbs: 25 },
    { name: "Lemon Lime (caf)", carbs: 25, caffeine: 30 },
    { name: "Espresso (caf)", carbs: 22, caffeine: 30 },
  ],
  "SiS GO Isotonic": [
    { name: "Apple", carbs: 22 },
    { name: "Lemon & Lime", carbs: 22 },
    { name: "Orange", carbs: 22 },
    { name: "Tropical", carbs: 22 },
  ],
  "TORQ": [
    { name: "Cherry Bakewell", carbs: 29 },
    { name: "Apple Crumble", carbs: 29 },
    { name: "Lemon Drizzle", carbs: 29 },
    { name: "Caramel Latte (caf)", carbs: 29, caffeine: 89 },
    { name: "Banoffee (caf)", carbs: 29, caffeine: 89 },
  ],
  "Unived Elite": [
    { name: "Berry Blast", carbs: 45 },
    { name: "Melon Sea Salt", carbs: 45 },
    { name: "Choco Fudge (caf)", carbs: 45, caffeine: 50 },
    { name: "Double Espresso (caf)", carbs: 45, caffeine: 100 },
  ],
  "Veloforte": [
    { name: "Riba Blackcurrant", carbs: 22 },
    { name: "Doppio Coffee (caf)", carbs: 22, caffeine: 75 },
    { name: "Primo Beetroot Lemon", carbs: 22 },
  ],
};

// Race carb-rate brackets (g/h, midpoint of published range)
function carbsPerHourForFinishTime(distance: "HM" | "FM", totalMin: number): { rate: number; bracket: string } {
  if (distance === "HM") {
    if (totalMin < 75) return { rate: 62, bracket: "Sub 1:15" };
    if (totalMin < 90) return { rate: 52, bracket: "Sub 1:30" };
    if (totalMin < 105) return { rate: 45, bracket: "Sub 1:45" };
    if (totalMin < 120) return { rate: 39, bracket: "Sub 2:00" };
    return { rate: 35, bracket: "Sub 2:15+" };
  }
  if (totalMin < 150) return { rate: 75, bracket: "Sub 2:30" };
  if (totalMin < 180) return { rate: 63, bracket: "Sub 3:00" };
  if (totalMin < 210) return { rate: 54, bracket: "Sub 3:30" };
  if (totalMin < 240) return { rate: 47, bracket: "Sub 4:00" };
  return { rate: 42, bracket: "Sub 4:30+" };
}

function parseTimeToMin(s: string): number | null {
  // Accept H:MM:SS or MM:SS
  const parts = s.trim().split(":").map((x) => x.trim());
  if (parts.some((p) => p === "" || isNaN(Number(p)))) return null;
  if (parts.length === 3) return Number(parts[0]) * 60 + Number(parts[1]) + Number(parts[2]) / 60;
  if (parts.length === 2) return Number(parts[0]) + Number(parts[1]) / 60;
  return null;
}
function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const s = Math.round((min - Math.floor(min)) * 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ============================================================
// Calculator
// ============================================================
export const RaceFuelCalculator = ({ isZh }: { isZh: boolean }) => {
  const [distance, setDistance] = useState<"HM" | "FM">("HM");
  const [brand, setBrand] = useState<string>("Maurten");
  const [flavor, setFlavor] = useState<string>("Gel 100");
  const [customCarbs, setCustomCarbs] = useState<string>("");
  const [paceStr, setPaceStr] = useState<string>(""); // "5:30"
  const [timeStr, setTimeStr] = useState<string>(""); // "1:55:00"
  const [stationsStr, setStationsStr] = useState<string>("");

  const totalKm = distance === "HM" ? 21.0975 : 42.195;

  // When distance changes, recompute time from the existing pace so the plan re-renders.
  useEffect(() => {
    const pm = parseTimeToMin(paceStr);
    if (pm && pm > 0) setTimeStr(fmtMin(pm * totalKm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance]);
  const brandGels = GEL_DB[brand] || [];
  const selectedGel = brandGels.find((g) => g.name === flavor);
  const gelCarbs = customCarbs ? Number(customCarbs) : selectedGel?.carbs ?? 0;

  // Sync pace ↔ time
  const handlePaceChange = (v: string) => {
    setPaceStr(v);
    const pm = parseTimeToMin(v);
    if (pm && pm > 0) setTimeStr(fmtMin(pm * totalKm));
  };
  const handleTimeChange = (v: string) => {
    setTimeStr(v);
    const tm = parseTimeToMin(v);
    if (tm && tm > 0) setPaceStr(fmtPace(tm / totalKm));
  };

  const totalMin = parseTimeToMin(timeStr);
  const paceMin = parseTimeToMin(paceStr);

  const stations = useMemo(() => {
    return stationsStr
      .split(/[,\s]+/)
      .map((s) => Number(s))
      .filter((n) => !isNaN(n) && n > 0 && n < totalKm)
      .sort((a, b) => a - b);
  }, [stationsStr, totalKm]);

  const plan = useMemo(() => {
    if (!totalMin || !gelCarbs || gelCarbs <= 0) return null;
    const { rate, bracket } = carbsPerHourForFinishTime(distance, totalMin);
    const totalCarbsNeeded = (rate * totalMin) / 60;

    // Revamped logic:
    // 1) Always take 1 gel 15 min pre-race. Its carbs hit the bloodstream within
    //    ~15 min, so they peak right around the gun — subtract it from the in-race
    //    carb requirement before sizing the in-race gel count.
    // 2) Size in-race gels to top up the remaining carb need.
    // 3) Start in-race gels at the 30-min mark (when the pre-race fuel runs out),
    //    and finish by ~92% of the race so the last gel still has time to absorb.
    const preRaceGelCarbs = gelCarbs;
    const inRaceCarbsNeeded = Math.max(0, totalCarbsNeeded - preRaceGelCarbs);
    const numInRaceGels = Math.max(1, Math.ceil(inRaceCarbsNeeded / gelCarbs));

    // Time window for in-race gels: 30 min in → finish minus 30 min.
    // Rationale: gels take ~10–15 min to absorb and then deliver energy for
    // ~20–30 min, so a gel taken inside the final 30 min is mostly wasted.
    // For ultras where 30 min is a tiny fraction, fall back to 92% cutoff.
    const firstMin = 30;
    const lastMin = Math.max(firstMin + 1, Math.min(totalMin - 30, totalMin * 0.92));
    const idealKm: number[] = [];
    for (let i = 0; i < numInRaceGels; i++) {
      const t = numInRaceGels === 1
        ? (firstMin + lastMin) / 2
        : firstMin + ((lastMin - firstMin) * i) / (numInRaceGels - 1);
      idealKm.push((t / totalMin) * totalKm);
    }
    // align to water stations if provided
    const usedStations = new Set<number>();
    const inRaceSchedule = idealKm.map((target) => {
      let km = target;
      let aligned = false;
      if (stations.length) {
        let best: number | null = null;
        let bestDist = Infinity;
        for (const st of stations) {
          if (usedStations.has(st)) continue;
          const d = Math.abs(st - target);
          if (d < bestDist && d <= 2.5) { best = st; bestDist = d; }
        }
        if (best !== null) { km = best; usedStations.add(best); aligned = true; }
      }
      const min = paceMin ? km * paceMin : (km / totalKm) * totalMin;
      return { targetKm: target, km, aligned, min, preRace: false as const };
    });
    const schedule = [
      { targetKm: 0, km: 0, aligned: false, min: -15, preRace: true as const },
      ...inRaceSchedule,
    ];
    const numGels = numInRaceGels + 1;
    return { rate, bracket, totalCarbsNeeded, numGels, numInRaceGels, schedule };
  }, [totalMin, gelCarbs, distance, totalKm, stations, paceMin]);

  return (
    <div className="space-y-4">
      {/* Distance */}
      <div>
        <Label className="text-xs font-semibold">{isZh ? "1. 比賽距離" : "1. Race distance"}</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {(["HM", "FM"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDistance(d)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${distance === d ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}
            >
              {d === "HM" ? (isZh ? "半馬 21.1 km" : "Half Marathon 21.1 km") : (isZh ? "全馬 42.2 km" : "Full Marathon 42.2 km")}
            </button>
          ))}
        </div>
      </div>

      {/* Gel selection */}
      <div>
        <Label className="text-xs font-semibold">{isZh ? "2. 你的果膠" : "2. Your gel"}</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <Select value={brand} onValueChange={(v) => { setBrand(v); setFlavor(GEL_DB[v]?.[0]?.name ?? ""); setCustomCarbs(""); }}>
            <SelectTrigger><SelectValue placeholder={isZh ? "品牌" : "Brand"} /></SelectTrigger>
            <SelectContent>{Object.keys(GEL_DB).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={flavor} onValueChange={(v) => { setFlavor(v); setCustomCarbs(""); }}>
            <SelectTrigger><SelectValue placeholder={isZh ? "口味" : "Flavor"} /></SelectTrigger>
            <SelectContent>{brandGels.map((g) => <SelectItem key={g.name} value={g.name}>{g.name} · {g.carbs}g{g.caffeine ? ` · ${g.caffeine}mg caf` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          <Label className="text-[11px] text-muted-foreground">
            {isZh ? "找不到？輸入碳水克數（看包裝營養標示「碳水化合物 / Carbohydrate」每包數值）" : "Not listed? Enter carbs per sachet (look at the nutrition label — \"Carbohydrate\" per serving)"}
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder={isZh ? "例：25" : "e.g. 25"}
            value={customCarbs}
            onChange={(e) => setCustomCarbs(e.target.value)}
            className="mt-1 h-9"
          />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {isZh ? "使用碳水量：" : "Using: "}<span className="font-semibold text-foreground">{gelCarbs || "—"} g</span> / {isZh ? "包" : "gel"}
        </div>
      </div>

      {/* Pace / time */}
      <div>
        <Label className="text-xs font-semibold">{isZh ? "3. 目標配速或完賽時間（擇一）" : "3. Target pace or finish time (either one)"}</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">{isZh ? "配速 (min/km)" : "Pace (min/km)"}</div>
            <Input placeholder="5:30" value={paceStr} onChange={(e) => handlePaceChange(e.target.value)} className="h-9 font-mono" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">{isZh ? "完賽時間 (h:mm:ss)" : "Finish time (h:mm:ss)"}</div>
            <Input placeholder="1:55:00" value={timeStr} onChange={(e) => handleTimeChange(e.target.value)} className="h-9 font-mono" />
          </div>
        </div>
      </div>

      {/* Water stations (optional) */}
      <div>
        <Label className="text-xs font-semibold">{isZh ? "4. 水站位置（選填）" : "4. Water stations (optional)"}</Label>
        <div className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
          {isZh ? "若你知道路線水站，輸入會更精準。用逗號分隔每個水站的公里數。" : "Optional — if you know the route's water stations, the plan will align gels with water. Comma-separate the km marks."}
        </div>
        <Input
          placeholder={isZh ? "例：5, 10, 15, 17.5" : "e.g. 5, 10, 15, 17.5"}
          value={stationsStr}
          onChange={(e) => setStationsStr(e.target.value)}
          className="h-9 font-mono"
        />
      </div>

      {/* Result */}
      {plan && (
        <div className="bg-muted/40 border border-border rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Calculator size={14} className="text-primary" />
            <h4 className="text-sm font-bold">{isZh ? "你的補給計劃" : "Your fueling plan"}</h4>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="bg-card border border-border rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{isZh ? "目標速率" : "Target rate"}</div>
              <div className="text-sm font-bold">{plan.rate} g/h</div>
              <div className="text-[10px] text-muted-foreground">{plan.bracket}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{isZh ? "總碳水" : "Total carbs"}</div>
              <div className="text-sm font-bold">{Math.round(plan.totalCarbsNeeded)} g</div>
              <div className="text-[10px] text-muted-foreground">{fmtMin(totalMin!)}</div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-2">
              <div className="text-[10px] text-primary uppercase tracking-wider">{isZh ? "果膠數量" : "Gels"}</div>
              <div className="text-sm font-bold text-primary">{plan.numGels}</div>
              <div className="text-[10px] text-muted-foreground">@ {gelCarbs} g</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">{isZh ? "第" : "Gel"}</th>
                  <th className="text-left px-2 py-1.5 font-semibold">{isZh ? "公里" : "Km"}</th>
                  <th className="text-left px-2 py-1.5 font-semibold">{isZh ? "時間" : "Time"}</th>
                  <th className="text-left px-2 py-1.5 font-semibold">{isZh ? "累積碳水" : "Cum. carbs"}</th>
                </tr>
              </thead>
              <tbody>
                {plan.schedule.map((s, i) => (
                  <tr key={i} className={`border-t border-border ${s.preRace ? "bg-amber-500/5" : ""}`}>
                    <td className="px-2 py-1.5 font-semibold">
                      {s.preRace ? <span className="text-amber-600 dark:text-amber-400">{isZh ? "賽前" : "Pre"}</span> : `#${i}`}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {s.preRace
                        ? <span className="text-muted-foreground">{isZh ? "起跑線" : "Start line"}</span>
                        : <>{s.km.toFixed(1)}{s.aligned && <span className="ml-1 text-sky-500" title={isZh ? "對齊水站" : "Aligned to water station"}>💧</span>}</>}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">
                      {s.preRace ? (isZh ? "起跑前 15 分" : "−15 min") : fmtMin(s.min)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{Math.round((i + 1) * gelCarbs)} g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
            {isZh
              ? `賽前 15 分鐘先吞 1 包（含咖啡因更佳）— 它的碳水會在起跑時剛好進入血液，等於幫你「延後」第一包賽中果膠。${stations.length > 0 ? "💧 表示已對齊到你輸入的水站。" : "賽中果膠均勻分布於 30 分後至「終點前 30 分鐘」之間 — 終點前才吞的果膠來不及吸收。"}每包搭配 150–200 ml 水。`
              : `Take 1 gel 15 min before the gun (caffeinated is ideal) — its carbs hit your bloodstream as you start, so you can delay your first in-race gel. ${stations.length > 0 ? "💧 = aligned to your water station. " : "In-race gels are spaced from the 30-min mark to ~30 min before the finish — gels taken any later won't absorb in time. "}Wash each down with 150–200 ml water.`}
          </p>

          <div className="mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed">
              {isZh
                ? "此計算器僅供粗略參考，依據公開運動營養指南推算。每位跑者體質不同 — 流汗量、腸胃耐受度與賽日狀況皆會影響實際需求。務必在賽前長跑訓練中反覆測試此計劃，切勿在比賽當天才首次嘗試新的補給策略。"
                : "This calculator is a rough estimate based on published sports-nutrition guidelines. Every runner is different — sweat rate, gut tolerance, and race-day conditions all change your needs. Test this plan on multiple long runs before race day. Never try a brand-new fueling strategy for the first time in a race."}
            </p>
          </div>
        </div>
      )}

      {!plan && (
        <div className="text-[11px] text-muted-foreground bg-muted/30 border border-dashed border-border rounded-lg p-3 text-center">
          {isZh ? "輸入配速或完賽時間後產生個人化補給計劃" : "Enter pace or finish time above to generate your personalised plan"}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Collapsible section wrapper
// ============================================================
const Section = ({
  title,
  icon: Icon,
  iconColor = "text-primary",
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Flame;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="bg-card border border-border rounded-xl overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor} />
          <span className="font-display font-bold text-sm">{title}</span>
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const FuelingGuide = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";

  return (
    <div className="px-5 pt-2 pb-8 max-w-lg mx-auto">
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
              ? "用對的時間、對的碳水量，跑得更遠、撞牆更晚。展開下方分頁查看細節。"
              : "Right carbs, right timing — run further, hit the wall later. Tap any section below to expand."}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">


        {/* === What's in a gel === */}
        <Section title={isZh ? "果膠裡有什麼？" : "What's in a Sports Gel?"} icon={Beaker}>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            {isZh
              ? "市面果膠成分大同小異 — 重點看每包碳水克數，而不是品牌。"
              : "Most sports gels share the same building blocks — what matters is the carbs per sachet, not the logo."}
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="font-semibold mb-0.5">{isZh ? "雙碳水組合" : "Dual carbs"}</div>
              <div className="text-muted-foreground">{isZh ? "麥芽糊精 + 果糖（2:1）— 吸收更快" : "Maltodextrin + fructose (2:1) — faster uptake"}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="font-semibold mb-0.5">{isZh ? "電解質" : "Electrolytes"}</div>
              <div className="text-muted-foreground">{isZh ? "鈉、鉀 — 預防抽筋" : "Sodium, potassium — cramp defence"}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="font-semibold mb-0.5">{isZh ? "咖啡因（選用）" : "Caffeine (optional)"}</div>
              <div className="text-muted-foreground">{isZh ? "每包 25–100 mg" : "25–100 mg per gel"}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="font-semibold mb-0.5">{isZh ? "水分搭配" : "Take with water"}</div>
              <div className="text-muted-foreground">{isZh ? "每包配 150–200 ml 水" : "150–200 ml water per gel"}</div>
            </div>
          </div>
        </Section>

        {/* === Carbs per hour === */}
        <Section title={isZh ? "每小時碳水攝取" : "Carbs per Hour"} icon={Info}>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "短於" : "Under"} 60 min</div>
              <div className="text-sm font-semibold">{isZh ? "只需喝水" : "Water is enough"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">0 {isZh ? "包" : "gels"}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">60–90 min</div>
              <div className="text-sm font-semibold">30–60 g {isZh ? "碳水/小時" : "carbs/h"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">1–2 {isZh ? "包/小時" : "gels/h"}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "超過" : "Over"} 90 min</div>
              <div className="text-sm font-semibold">60–90 g {isZh ? "碳水/小時" : "carbs/h"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">2–3 {isZh ? "包/小時" : "gels/h"}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{isZh ? "精英級" : "Elite"}</div>
              <div className="text-sm font-semibold">90–120 g {isZh ? "碳水/小時" : "carbs/h"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">3–4 {isZh ? "包/小時" : "gels/h"}</div>
            </div>
          </div>
        </Section>

        {/* === Training fueling === */}
        <Section title={isZh ? "訓練日補給" : "Training Fueling"} icon={Apple} iconColor="text-emerald-500">
          <div className="space-y-3">
            {trainingSessions.map((s, i) => {
              const Icon = s.icon;
              const c = isZh ? s.zh : s.en;
              return (
                <div key={i} className="bg-muted/30 border border-border rounded-xl p-3">
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className={`shrink-0 w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center border border-border`}>
                      <Icon size={16} className={s.color} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-xs leading-tight">{c.title}</h3>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{c.desc}</p>
                    </div>
                  </div>
                  <div className="space-y-1 pl-1">
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
        </Section>

        {/* === Race day fueling === */}
        <Section title={isZh ? "比賽日補給" : "Race Day Fueling"} icon={Trophy} iconColor="text-warning">
          <div className="space-y-3">
            {races.map((r, i) => {
              const Icon = r.icon;
              const c = isZh ? r.zh : r.en;
              return (
                <div key={i} className="bg-muted/30 border border-border rounded-xl overflow-hidden">
                  <div className={`${r.bg} px-3 py-2.5 border-b border-border flex items-start gap-2.5`}>
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-background flex items-center justify-center border border-border">
                      <Icon size={16} className={r.color} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-xs leading-tight">{c.title}</h3>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{c.tag}</div>
                      <div className={`text-[11px] font-semibold ${r.color} mt-0.5`}>{isZh ? r.carbs.zh : r.carbs.en}</div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
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
                            <div key={k} className="flex justify-between bg-card rounded-md px-2 py-1 text-[11px]">
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
        </Section>

        {/* === Hydration === */}
        <Section title={isZh ? "水分與電解質" : "Hydration & Electrolytes"} icon={Droplet} iconColor="text-sky-500">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isZh
              ? "炎熱潮濕時每小時 500–750 ml 水並加電解質。深色尿液 = 補水不足。每包果膠搭配 150–200 ml 水，避免腸胃不適。"
              : "In heat/humidity: 500–750 ml/h with electrolytes. Dark urine = under-hydrated. Take each gel with 150–200 ml water to prevent GI issues."}
          </p>
        </Section>

        {/* === Caffeine === */}
        <Section title={isZh ? "咖啡因策略" : "Caffeine Strategy"} icon={Coffee} iconColor="text-amber-600">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isZh
              ? "目標 3–6 mg/kg 體重。賽前 30–45 分鐘或最後 1/3 段使用咖啡因果膠效果最佳。長距離可分次攝取避免心悸。"
              : "Aim 3–6 mg per kg bodyweight. Take caffeine 30–45 min pre-race or in the final third. Split doses across long races to avoid jitters."}
          </p>
        </Section>

        {/* === Disclaimer === */}
        <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-xl p-3">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isZh
              ? "本指南整合多項運動營養研究，僅作教育用途。請在訓練中試用補給策略，比賽前勿嘗試新產品。如有特殊醫療狀況請諮詢專業人士。"
              : "Based on general sports-nutrition research. Educational reference only — always test fueling in training, never try anything new on race day. Consult a professional for medical concerns."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FuelingGuide;
