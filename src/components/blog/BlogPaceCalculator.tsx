import { useMemo, useState } from "react";
import { Calculator, ChevronDown } from "lucide-react";
import {
  calculateRunningScore,
  predictTime,
  getMainPaces,
  getMidDistancePaces,
  getShortDistancePaces,
  formatTime,
  formatPace,
} from "@/lib/vdot";

export type RaceKey = "10K" | "HM" | "FM";

const RACES: Record<RaceKey, { meters: number; label: string; labelZh: string; defaults: [number, number, number] }> = {
  "10K": { meters: 10000, label: "10K", labelZh: "10 公里", defaults: [0, 55, 0] },
  HM: { meters: 21097.5, label: "Half Marathon", labelZh: "半馬拉松", defaults: [2, 0, 0] },
  FM: { meters: 42195, label: "Marathon", labelZh: "全程馬拉松", defaults: [4, 15, 0] },
};

const T = {
  en: {
    toggle: "Calculate your training paces",
    goal: "Goal finish time",
    h: "h",
    m: "min",
    s: "sec",
    paces: "Your training paces (per km)",
    equiv: "Equivalent race times at this fitness",
    reps: "Interval / rep session targets",
    pace: "Pace",
    note: "Easy pace is a range on purpose — run the slow end when tired. Rep times are per repetition, not per km.",
    invalid: "Enter a realistic goal time to see your paces.",
    goalPace: "Goal race pace",
    appNote:
      "This is a general estimate from a single goal time. For paces tailored to your actual training data, use the Pace & Prediction tool in the Runward app.",
    names: {
      Easy: "Easy",
      Marathon: "Marathon pace",
      Threshold: "Threshold / tempo",
      Interval: "Interval (≈5K pace)",
      Repetition: "Reps (faster than 5K)",
      "Fast Reps": "Fast reps / strides",
    } as Record<string, string>,
  },
  zh: {
    toggle: "計算你的訓練配速",
    goal: "目標完成時間",
    h: "小時",
    m: "分",
    s: "秒",
    paces: "你的訓練配速（每公里）",
    equiv: "同等體能下的各距離預測成績",
    reps: "間歇 / 重複跑目標時間",
    pace: "配速",
    note: "輕鬆跑刻意以區間顯示：疲累時跑慢端。重複跑時間為每一組的時間，不是每公里。",
    invalid: "請輸入合理的目標時間以計算配速。",
    goalPace: "比賽目標配速",
    appNote:
      "以上為根據單一目標時間的概括估算。想得到貼合你真實訓練數據的配速，請使用 Runward 應用程式內的「配速與預測」工具。",
    names: {
      Easy: "輕鬆跑",
      Marathon: "馬拉松配速",
      Threshold: "乳酸閾值 / 節奏跑",
      Interval: "間歇（約 5 公里配速）",
      Repetition: "重複跑（快於 5 公里配速）",
      "Fast Reps": "快速重複 / 強度跑",
    } as Record<string, string>,
  },
};

const EQUIV = [
  { meters: 5000, label: "5K", labelZh: "5 公里" },
  { meters: 10000, label: "10K", labelZh: "10 公里" },
  { meters: 21097.5, label: "Half", labelZh: "半馬" },
  { meters: 42195, label: "Marathon", labelZh: "全馬" },
];

const BlogPaceCalculator = ({ race, lang, defaultOpen = false }: { race: RaceKey; lang: "en" | "zh"; defaultOpen?: boolean }) => {
  const cfg = RACES[race];
  const t = T[lang];
  const [open, setOpen] = useState(defaultOpen);

  const [h, setH] = useState(String(cfg.defaults[0]));
  const [m, setM] = useState(String(cfg.defaults[1]));
  const [s, setS] = useState(String(cfg.defaults[2]));

  const totalSeconds =
    (parseInt(h || "0", 10) || 0) * 3600 + (parseInt(m || "0", 10) || 0) * 60 + (parseInt(s || "0", 10) || 0);

  const result = useMemo(() => {
    if (totalSeconds < 600 || totalSeconds > 9 * 3600) return null;
    const score = calculateRunningScore(cfg.meters, totalSeconds);
    if (!isFinite(score) || score < 20 || score > 90) return null;
    return {
      score,
      main: getMainPaces(score),
      mid: getMidDistancePaces(score),
      short: getShortDistancePaces(score),
      equiv: EQUIV.map((e) => ({ ...e, time: formatTime(predictTime(score, e.meters)) })),
      goalPace: formatPace((totalSeconds / cfg.meters) * 1000),
    };
  }, [totalSeconds, cfg.meters]);

  const numberInput = (
    value: string,
    setValue: (v: string) => void,
    label: string,
    max: number,
  ) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );

  return (
    <section className="not-prose my-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 text-left transition-colors hover:bg-card"
      >
        <span className="flex items-center gap-2.5">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <Calculator size={18} />
          </span>
          <span className="font-display text-base font-bold text-foreground">{t.toggle}</span>
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
          <div className="text-sm font-semibold text-foreground">
            {t.goal} — {lang === "zh" ? cfg.labelZh : cfg.label}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            {numberInput(h, setH, t.h, 9)}
            {numberInput(m, setM, t.m, 59)}
            {numberInput(s, setS, t.s, 59)}
            {result && (
              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">{t.goalPace}</div>
                <div className="font-display text-2xl font-bold text-primary">
                  {result.goalPace}
                  <span className="text-sm font-normal text-muted-foreground"> /km</span>
                </div>
              </div>
            )}
          </div>

          {!result ? (
            <p className="mt-5 text-sm text-muted-foreground">{t.invalid}</p>
          ) : (
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t.paces}</h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {result.main.map((p) => (
                        <tr key={p.name} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 text-foreground">{t.names[p.name] ?? p.name}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-foreground">
                            {p.kmPace} /km
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">{t.reps}</h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">{t.pace}</th>
                        <th className="px-3 py-2 text-right font-semibold">1200m</th>
                        <th className="px-3 py-2 text-right font-semibold">800m</th>
                        <th className="px-3 py-2 text-right font-semibold">600m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mid.map((p) => (
                        <tr key={p.name} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 text-foreground">{t.names[p.name] ?? p.name}</td>
                          {p.times.map((time, i) => (
                            <td key={i} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-foreground">
                              {time}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">{t.pace}</th>
                        <th className="px-3 py-2 text-right font-semibold">400m</th>
                        <th className="px-3 py-2 text-right font-semibold">300m</th>
                        <th className="px-3 py-2 text-right font-semibold">200m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.short.map((p) => (
                        <tr key={p.name} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 text-foreground">{t.names[p.name] ?? p.name}</td>
                          {p.times.map((time, i) => (
                            <td key={i} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-foreground">
                              {time}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">{t.equiv}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {result.equiv.map((e) => (
                    <div key={e.label} className="rounded-xl border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground">{lang === "zh" ? e.labelZh : e.label}</div>
                      <div className="font-display text-lg font-bold text-foreground">{e.time}</div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t.note}</p>
            </div>
          )}

          <p className="mt-5 border-t border-border/60 pt-3 text-xs italic text-muted-foreground">{t.appNote}</p>
        </div>
      )}
    </section>
  );
};

export default BlogPaceCalculator;
