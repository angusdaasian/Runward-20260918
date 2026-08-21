import { useEffect, useMemo, useState } from "react";
import { Printer, RotateCcw, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

type Lang = "en" | "zh";
export type RaceDist = "10K" | "HM" | "FM";

interface Item {
  id: string;
  en: string;
  zh: string;
  /** races this item applies to; omitted = all */
  only?: RaceDist[];
}

interface Section {
  id: string;
  en: string;
  zh: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    id: "week",
    en: "Race week (T-7 to T-2)",
    zh: "賽前一週（T-7 至 T-2）",
    items: [
      { id: "w1", en: "Read the official race pack / athlete guide", zh: "細閱官方賽事手冊／選手指南" },
      { id: "w2", en: "Confirm bib collection time, place and required ID", zh: "確認取號碼布時間、地點及所需證件" },
      { id: "w3", en: "Check start wave, corral and baggage drop cut-off", zh: "確認起跑分區、時段與寄存行李截止時間" },
      { id: "w4", en: "Plan travel to start line (transport, road closures, arrival 60-90 min early)", zh: "規劃前往起點交通（封路、提早 60-90 分鐘到達）" },
      { id: "w5", en: "Check weather forecast and decide race outfit", zh: "查看天氣預報，決定比賽衣著" },
      { id: "w6", en: "Nothing new: shoes, kit and gels all tested in training", zh: "不試新裝備：跑鞋、衣物、能量膠均已在訓練中測試" },
      { id: "w7", en: "Trim toenails, treat any blisters or niggles", zh: "剪腳趾甲，處理水泡或小傷痛" },
      { id: "w8", en: "Carb-load plan for final 2-3 days", zh: "最後 2-3 天碳水加載計劃", only: ["HM", "FM"] },
      { id: "w9", en: "Write pace plan / splits and A-B-C goals", zh: "寫下配速計劃／分段時間及 A-B-C 目標" },
      { id: "w10", en: "Charge watch, headphones, power bank", zh: "為運動錶、耳機、行動電源充電" },
    ],
  },
  {
    id: "night",
    en: "Night before",
    zh: "賽前一晚",
    items: [
      { id: "n1", en: "Pin bib to race top (front, unfolded)", zh: "把號碼布別在比賽上衣正面（不要摺疊）" },
      { id: "n2", en: "Attach timing chip to shoe / confirm bib chip", zh: "計時晶片扣好在鞋上／確認號碼布晶片" },
      { id: "n3", en: "Lay out full flat-lay kit", zh: "把全套裝備排好備用" },
      { id: "n4", en: "Fill bottles / prepare pre-race drink", zh: "備好水壺／賽前飲料" },
      { id: "n5", en: "Pack gels in the exact number you'll carry", zh: "按計劃數量放好能量膠" },
      { id: "n6", en: "Set two alarms; plan wake-up 3 hours before start", zh: "設兩個鬧鐘；起跑前 3 小時起床" },
      { id: "n7", en: "Familiar, low-fibre dinner; hydrate but don't overdrink", zh: "吃熟悉、低纖維晚餐；補水但勿過量" },
      { id: "n8", en: "Screens off early, aim for lights out at usual time", zh: "早點關掉螢幕，按平時時間睡覺" },
    ],
  },
  {
    id: "wear",
    en: "What to wear",
    zh: "身上穿戴",
    items: [
      { id: "c1", en: "Race shoes (broken in, laces checked)", zh: "比賽跑鞋（已適應、鞋帶檢查好）" },
      { id: "c2", en: "Running socks (blister-tested)", zh: "跑步襪（已測試不磨腳）" },
      { id: "c3", en: "Race top with bib + shorts / tights", zh: "已別號碼布的上衣 + 短褲／緊身褲" },
      { id: "c4", en: "Sports bra / supportive underwear", zh: "運動內衣／合適內著" },
      { id: "c5", en: "GPS watch (charged, race screen set)", zh: "GPS 運動錶（已充電、設定好比賽畫面）" },
      { id: "c6", en: "Cap or visor + sunglasses", zh: "帽或遮陽帽 + 太陽眼鏡" },
      { id: "c7", en: "Anti-chafe balm / vaseline applied", zh: "已塗防摩擦膏／凡士林" },
      { id: "c8", en: "Sunscreen applied", zh: "已塗防曬" },
      { id: "c9", en: "Throwaway layer for the start corral", zh: "起跑區可丟棄保暖層" },
      { id: "c10", en: "Running belt / vest for gels", zh: "腰包／背心（放能量膠）", only: ["HM", "FM"] },
      { id: "c11", en: "Hydration flask if course support is thin", zh: "如補水站不足，自備水壺", only: ["FM"] },
    ],
  },
  {
    id: "fuel",
    en: "Fuel & hydration",
    zh: "補給與水分",
    items: [
      { id: "f1", en: "Pre-race breakfast 2-3 h before (tested in training)", zh: "起跑前 2-3 小時早餐（訓練中已試過）" },
      { id: "f2", en: "Small top-up snack 30-45 min before", zh: "起跑前 30-45 分鐘小量補充" },
      { id: "f3", en: "400-600 ml fluid in the 2 h before start", zh: "起跑前 2 小時內飲 400-600 毫升水" },
      { id: "f4", en: "Electrolyte tabs / salt for hot conditions", zh: "電解質片／鹽丸（天氣炎熱時）" },
      { id: "f5", en: "1 gel before start (optional)", zh: "起跑前 1 支能量膠（可選）", only: ["HM", "FM"] },
      { id: "f6", en: "Carry 1-2 gels", zh: "攜帶 1-2 支能量膠", only: ["10K"] },
      { id: "f7", en: "Carry 2-3 gels (one every 30-40 min)", zh: "攜帶 2-3 支能量膠（每 30-40 分鐘一支）", only: ["HM"] },
      { id: "f8", en: "Carry 4-6 gels; 60-90 g carbs per hour plan", zh: "攜帶 4-6 支能量膠；每小時 60-90 克碳水", only: ["FM"] },
      { id: "f9", en: "Know which aid stations serve water vs sports drink", zh: "知道各補水站供應水或運動飲品" },
      { id: "f10", en: "Post-race recovery food and drink packed", zh: "備好賽後恢復食物及飲料" },
    ],
  },
  {
    id: "bag",
    en: "Race bag / baggage drop",
    zh: "隨行袋／寄存行李",
    items: [
      { id: "b1", en: "Photo ID and bib confirmation email", zh: "身份證明及號碼布確認電郵" },
      { id: "b2", en: "Baggage tag attached", zh: "已貼上行李標籤" },
      { id: "b3", en: "Dry change of clothes + spare socks", zh: "乾爽替換衣物 + 備用襪" },
      { id: "b4", en: "Warm layer / space blanket for the finish", zh: "終點保暖衣物／保溫毯" },
      { id: "b5", en: "Towel, slippers or recovery sandals", zh: "毛巾、拖鞋或恢復鞋" },
      { id: "b6", en: "Phone, cash / card, transport card, keys", zh: "手機、現金／信用卡、交通卡、鎖匙" },
      { id: "b7", en: "Toilet paper / wet wipes", zh: "紙巾／濕紙巾" },
      { id: "b8", en: "Plasters, tape, blister pads, painkillers", zh: "膠布、肌內效貼、水泡貼、止痛藥" },
      { id: "b9", en: "Foam roller or massage ball (optional)", zh: "泡沫軸或按摩球（可選）" },
      { id: "b10", en: "Emergency contact written on bib back + medical notes", zh: "號碼布背面寫上緊急聯絡人及醫療資料" },
    ],
  },
  {
    id: "morning",
    en: "Race morning",
    zh: "比賽當日早上",
    items: [
      { id: "m1", en: "Eat breakfast on schedule", zh: "按時吃早餐" },
      { id: "m2", en: "Toilet stop before leaving home", zh: "出門前上廁所" },
      { id: "m3", en: "Bib, chip, watch, gels double-checked", zh: "再檢查號碼布、晶片、運動錶、能量膠" },
      { id: "m4", en: "Arrive early, drop bag, queue for toilets", zh: "提早到場、寄存行李、排隊上廁所" },
      { id: "m5", en: "10-15 min warm-up: easy jog, drills, strides", zh: "10-15 分鐘熱身：慢跑、動態操、快步跑" },
      { id: "m6", en: "Start watch GPS lock before entering corral", zh: "進入起跑區前先讓錶收到 GPS 訊號" },
      { id: "m7", en: "Line up in correct corral / pace group", zh: "在正確分區／配速組排隊" },
      { id: "m8", en: "First 3 km slower than goal pace — no adrenaline surge", zh: "首 3 公里比目標配速慢一點，別被氣氛帶快" },
    ],
  },
  {
    id: "after",
    en: "After the finish",
    zh: "完賽之後",
    items: [
      { id: "a1", en: "Keep walking 5-10 min, don't sit immediately", zh: "先步行 5-10 分鐘，別立即坐下" },
      { id: "a2", en: "Fluids + carbs and protein within 30-60 min", zh: "30-60 分鐘內補水、碳水及蛋白質" },
      { id: "a3", en: "Change into dry clothes", zh: "換上乾爽衣物" },
      { id: "a4", en: "Collect medal, bag and finish photos", zh: "領取獎牌、行李及完賽照片" },
      { id: "a5", en: "Log the race and how you felt (RPE, notes)", zh: "記錄比賽及感受（RPE、筆記）" },
      { id: "a6", en: "Plan easy recovery days before training again", zh: "安排輕鬆恢復日後再重啟訓練" },
    ],
  },
];

const STORAGE_KEY = "raceday_checklist_v1";

export default function RaceDayChecklist({ lang }: { lang: Lang }) {
  const zh = lang === "zh";
  const [race, setRace] = useState<RaceDist>("HM");
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setChecked(saved.checked ?? {});
        if (saved.race) setRace(saved.race);
        if (saved.raceName) setRaceName(saved.raceName);
        if (saved.raceDate) setRaceDate(saved.raceDate);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ checked, race, raceName, raceDate }));
    } catch {
      /* ignore quota */
    }
  }, [checked, race, raceName, raceDate]);

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((i) => !i.only || i.only.includes(race)),
      })),
    [race]
  );

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const done = sections.reduce((n, s) => n + s.items.filter((i) => checked[i.id]).length, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const raceLabel = (r: RaceDist) =>
    r === "10K" ? "10K" : r === "HM" ? (zh ? "半馬" : "Half Marathon") : zh ? "全馬" : "Marathon";

  return (
    <div className="race-checklist">
      {/* Controls — hidden when printing */}
      <div className="print:hidden">
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{zh ? "賽事距離" : "Race distance"}</label>
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
              {(["10K", "HM", "FM"] as RaceDist[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRace(r)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    race === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {raceLabel(r)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-muted-foreground mb-1.5">{zh ? "賽事名稱" : "Race name"}</label>
            <input
              value={raceName}
              onChange={(e) => setRaceName(e.target.value)}
              placeholder={zh ? "例如：香港馬拉松" : "e.g. Hong Kong Marathon"}
              className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{zh ? "比賽日期" : "Race date"}</label>
            <input
              type="date"
              value={raceDate}
              onChange={(e) => setRaceDate(e.target.value)}
              className="h-10 px-3 rounded-lg bg-card border border-border text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{zh ? `已完成 ${done} / ${total}` : `${done} of ${total} done`}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setChecked({})} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            {zh ? "重設" : "Reset"}
          </Button>
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            {zh ? "列印 / 儲存 PDF" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">
          {zh ? "比賽日檢查清單" : "Race Day Checklist"} — {raceLabel(race)}
        </h2>
        <p className="text-sm">
          {raceName || (zh ? "＿＿＿＿＿＿＿＿" : "________________")}
          {raceDate ? ` · ${raceDate}` : ""}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
        {sections.map((s) => (
          <section
            key={s.id}
            className="rounded-xl border border-border p-4 break-inside-avoid print:border-black/40"
          >
            <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4 text-primary print:hidden" />
              {zh ? s.zh : s.en}
            </h3>
            <ul className="space-y-2">
              {s.items.map((i) => (
                <li key={i.id}>
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[i.id]}
                      onChange={(e) => setChecked((c) => ({ ...c, [i.id]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <span className={checked[i.id] ? "text-muted-foreground line-through print:no-underline" : ""}>
                      {zh ? i.zh : i.en}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-5">
        {zh
          ? "清單會自動儲存在此瀏覽器。列印時只會輸出清單本身。"
          : "Your ticks are saved in this browser. Printing outputs the checklist only."}
      </p>
    </div>
  );
}
