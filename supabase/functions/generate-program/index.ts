import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Vertex AI helper ──
async function callVertexAI(opts: { apiKey: string; model?: string; messages: Array<{ role: string; content: any }> }): Promise<Response> {
  const VERTEX_MODEL_MAP: Record<string, string> = {
    "google/gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
    "google/gemini-3.1-flash-preview": "gemini-3.1-flash-preview",
    "google/gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
  };
  const model = VERTEX_MODEL_MAP[opts.model || ""] || (opts.model || "gemini-3.1-pro-preview").replace(/^google\//, "");
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${opts.apiKey}`;
  const systemParts: any[] = [];
  const contents: any[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") { systemParts.push({ text: typeof m.content === "string" ? m.content : "" }); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: typeof m.content === "string" ? m.content : String(m.content) }] });
  }
  const body: any = {
    contents,
    generationConfig: {
      // Medium thinking budget to keep latency under edge function CPU limit
      thinkingConfig: { thinkingBudget: 4096 },
      maxOutputTokens: 16384,
      temperature: 0.7,
    },
  };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  const vRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!vRes.ok) return new Response(await vRes.text(), { status: vRes.status });
  const vData = await vRes.json();
  const text = vData?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, distance, targetTime, raceDate, startDate, weeks, daysPerWeek, weeklyKm, longRunDay, restDays, raceName, raceCity, raceCountry, lang, races, trailDistanceKm, trailElevationM, trailTargetEph } = await req.json();

    // Normalise race schedule. Expect [{name, race_date, category, priority}]
    const raceList: Array<{ name: string; race_date: string; category?: string; priority?: string }> =
      Array.isArray(races) ? races.filter((r: any) => r && r.race_date && r.name) : [];
    raceList.sort((a, b) => a.race_date.localeCompare(b.race_date));
    const distanceForCategory = (category?: string): number | null => {
      const c = String(category || "").trim().toUpperCase();
      if (c === "5K") return 5;
      if (c === "10K") return 10;
      if (["HM", "HALF", "HALF MARATHON"].includes(c)) return 21.1;
      if (["FM", "FULL", "FULL MARATHON", "MARATHON"].includes(c)) return 42.2;
      return null;
    };
    const raceScheduleBlock = raceList.length
      ? `\nRACE SCHEDULE (the runner has these races on the calendar — adapt the plan accordingly):\n${raceList
          .map(
            (r) =>
              `- ${r.race_date} · ${r.name}${r.category ? ` (${r.category})` : ""} — priority ${r.priority || "none"}`,
          )
          .join("\n")}\n\nRACE-AWARE RULES:\n- The "A" priority race is the GOAL race; structure the entire plan to peak for it (use Race Date above).\n- For each "B" race: insert a short mini-taper (1 reduced volume week before, with the 2 days post-race kept easy/recovery). Replace the race day workout with a "Race" type entry titled with the race name and distance from its category.\n- For each "C" race: treat as a hard training run / tune-up. Schedule it as a "Race" type entry on the day; the day after must be Recovery or Rest. No special week-level taper.\n- The +10% weekly mileage rule may be temporarily relaxed during a race week's deload (volume can drop more than 10%). It still applies to all build weeks.\n- For every race in the schedule, the day entry on the race date MUST have type "Race", title equal to the race name, distance_km equal to the race category distance (5K=5, 10K=10, HM=21.1, FM=42.2), color "#E91E63", and a description noting it's a priority ${"{A|B|C}"} race. Race dates override the normal long-run/rest-day preference.\n`
      : "";

    const isZh = lang === "zh";
    const isTrailRace = distance === "TR" || distance === "Trail Race";
    const trailKm = Number(trailDistanceKm) || 0;
    const trailEle = Number(trailElevationM) || 0;
    const parseHours = (value?: string): number => {
      const parts = String(value || "").split(":").map((n) => Number(n));
      if (parts.length === 3) return Math.max(0.1, parts[0] + parts[1] / 60 + parts[2] / 3600);
      if (parts.length === 2) return Math.max(0.1, isTrailRace ? parts[0] + parts[1] / 60 : parts[0] / 60 + parts[1] / 3600);
      return Math.max(0.1, Number(value) || 1);
    };
    const targetHours = parseHours(targetTime);
    const raceEffortPoints = trailKm + trailEle / 100;
    const raceEph = Number(trailTargetEph) || (targetHours > 0 ? raceEffortPoints / targetHours : 0);
    const verticalPerKm = trailKm > 0 ? trailEle / trailKm : 0;
    const requestedWeeklyKm = Number(weeklyKm) || 30;
    const effectiveWeeklyKm = isTrailRace ? Math.max(requestedWeeklyKm, Math.round(trailKm * 1.15), 45) : requestedWeeklyKm;
    const distanceFull = isTrailRace
      ? (isZh ? `越野賽 ${trailKm}公里 / 爬升 ${trailEle}米` : `Trail Race ${trailKm}km / ${trailEle}m elevation`)
      : (distance === "10K" ? "10K" : distance === "HM" ? (isZh ? "半馬拉松" : "Half Marathon") : (isZh ? "全馬拉松" : "Full Marathon"));

    const repairTrailRacePlan = (planData: any[]): any[] => {
      if (!isTrailRace || !Array.isArray(planData) || trailKm <= 0) return planData;
      const totalWeeks = Math.max(planData.length, 1);
      const prefLongDay = longRunDay || "Sun";
      const fmtEph = (v: number) => Math.round(v * 10) / 10;
      const trailTitle = (kind: "long" | "hill" | "race") => {
        if (isZh) return kind === "race" ? "越野賽日" : kind === "hill" ? "越野爬升課" : "越野長課";
        return kind === "race" ? "Trail Race Day" : kind === "hill" ? "Trail Hill Session" : "Trail Long Run";
      };
      const trailDesc = (km: number, ele: number, eph: number, kind: "long" | "hill" | "race") => {
        if (isZh) {
          const purpose = kind === "hill" ? "加入爬坡重複或起伏路段，建立垂直耐力與下坡控制。" : kind === "race" ? "按越野賽努力分配體力，以 EpH 控制強度而非平路配速。" : "在越野路面完成長課，練習補給、上坡步行/跑步切換及下坡技術。";
          return `${km}km · 爬升 ${Math.round(ele)}m · 目標 EpH ${fmtEph(eph)}。${purpose}`;
        }
        const purpose = kind === "hill" ? "Use hill repeats or rolling trail to build vertical endurance and downhill control." : kind === "race" ? "Race by effort using EpH instead of flat road pace." : "Run on trails; practice fueling, climb pacing, power-hike transitions, and descents.";
        return `${km}km · ${Math.round(ele)}m ascent · target EpH ${fmtEph(eph)}. ${purpose}`;
      };
      const isRestDay = (d: any) => !d || d.type === "Rest";
      const weekFactor = (weekIdx: number) => {
        if (weekIdx >= totalWeeks - 1) return 0.45;
        if (weekIdx >= totalWeeks - 2) return 0.62;
        const peakIdx = Math.max(1, totalWeeks - 4);
        const build = 0.48 + (Math.min(weekIdx, peakIdx) / peakIdx) * 0.52;
        return weekIdx % 4 === 3 && weekIdx < peakIdx ? build * 0.72 : build;
      };
      const toTrail = (day: any, weekIdx: number, kind: "long" | "hill" | "race") => {
        const factor = weekFactor(weekIdx);
        const weekTarget = effectiveWeeklyKm * factor;
        const peakLong = Math.min(trailKm * 0.72, effectiveWeeklyKm * 0.58);
        const baseLong = Math.max(10, Math.min(trailKm * 0.32, peakLong * 0.55));
        const peakIdx = Math.max(1, totalWeeks - 4);
        const longProgress = baseLong + (peakLong - baseLong) * Math.min(weekIdx, peakIdx) / peakIdx;
        const km = kind === "race"
          ? trailKm
          : kind === "hill"
            ? Math.max(5, Math.min(14, weekTarget * 0.18))
            : Math.max(8, Math.min(peakLong, longProgress * (weekIdx % 4 === 3 && weekIdx < peakIdx ? 0.75 : 1) * (weekIdx >= totalWeeks - 2 ? factor / 0.62 : 1)));
        const roundedKm = Math.round(km * 10) / 10;
        const eleBase = kind === "race" ? trailEle : roundedKm * verticalPerKm * (kind === "hill" ? 1.35 : 1);
        const ele = Math.max(kind === "race" ? trailEle : 50, Math.round(eleBase / 10) * 10);
        const eph = fmtEph(kind === "race" ? raceEph : raceEph * (kind === "hill" ? 0.95 : weekIdx >= totalWeeks - 3 ? 0.9 : 0.78));
        return {
          ...day,
          type: kind === "race" ? "Trail Race" : "Trail Run",
          title: trailTitle(kind),
          description: trailDesc(roundedKm, ele, eph, kind),
          distance_km: roundedKm,
          pace: null,
          color: kind === "race" ? "#65A30D" : "#84CC16",
          elevation_m: ele,
          eph,
        };
      };
      const toInterval = (day: any, weekIdx: number) => {
        const reps = weekIdx >= totalWeeks - 2 ? 4 : weekIdx % 3 === 0 ? 6 : 5;
        const dist = weekIdx % 2 === 0 ? "800m" : "1000m";
        const title = isZh ? "速度間歇" : "Road Speed Intervals";
        const description = isZh
          ? `${dist} x ${reps}, rest 2:00 between sets。以 Z5 努力跑，保持跑姿效率；配速不用由越野賽平均速度推算。`
          : `${dist} x ${reps}, rest 2:00 between sets. Run at Z5 effort; do not derive pace from trail race average speed.`;
        return { ...day, type: "Interval", title, description, distance_km: weekIdx >= totalWeeks - 2 ? 5 : 7, pace: null, color: "#F44336", elevation_m: null, eph: null };
      };
      const toEasy = (day: any, kind: "easy" | "recovery" = "easy") => ({
        ...day,
        type: kind === "recovery" ? "Recovery" : "Easy Run",
        title: isZh ? (kind === "recovery" ? "恢復跑" : "輕鬆跑") : (kind === "recovery" ? "Recovery Run" : "Easy Run"),
        description: isZh ? (kind === "recovery" ? "Z1-Z2 非常輕鬆恢復跑，不按越野賽平均配速執行。" : "Z2 輕鬆跑，專注恢復與跑姿效率，不按越野賽平均配速執行。") : (kind === "recovery" ? "Very easy Z1-Z2 recovery run; do not use trail race average pace." : "Easy Z2 run for aerobic support; do not use trail race average pace."),
        pace: null,
        color: kind === "recovery" ? "#9C27B0" : "#4CAF50",
        elevation_m: null,
        eph: null,
      });

      return planData.map((week: any, weekIdx: number) => {
        const days = Array.isArray(week?.days) ? week.days.map((d: any) => ({ ...d })) : [];
        const raceIdx = days.findIndex((d: any) => d?.date === raceDate);
        if (raceIdx >= 0) days[raceIdx] = toTrail(days[raceIdx], weekIdx, "race");

        for (const d of days) {
          const isTrailDay = d?.type === "Trail Run" || d?.type === "Trail Race";
          if (!isTrailDay) {
            if (d) { d.elevation_m = null; d.eph = null; }
            continue;
          }
          if (d.type === "Trail Race") continue;
          const km = Number(d.distance_km) || 0;
          if (!(Number(d.elevation_m) > 0)) d.elevation_m = Math.round((km * verticalPerKm) / 10) * 10;
          if (!(Number(d.eph) > 0)) d.eph = fmtEph(raceEph * 0.78);
          d.pace = null;
          d.description = trailDesc(km, Number(d.elevation_m) || 0, Number(d.eph) || 0, "long");
        }

        const hasTrailRaceWeek = days.some((d: any) => d?.type === "Trail Race");
        const preferredIdx = hasTrailRaceWeek ? -1 : days.findIndex((d: any) => d?.day === prefLongDay && !isRestDay(d));
        const longIdx = days.findIndex((d: any) => d?.type === "Long Run" || d?.type === "Long" || d?.type === "Trail Run");
        const fallbackIdx = days.reduce((best: number, d: any, idx: number) => {
          if (isRestDay(d) || d?.type === "Trail Race") return best;
          return best < 0 || (Number(d.distance_km) || 0) > (Number(days[best]?.distance_km) || 0) ? idx : best;
        }, -1);
        const forcedLongIdx = hasTrailRaceWeek ? -1 : preferredIdx >= 0 ? preferredIdx : longIdx >= 0 ? longIdx : fallbackIdx;
        if (forcedLongIdx >= 0 && days[forcedLongIdx]?.type !== "Trail Race") days[forcedLongIdx] = toTrail(days[forcedLongIdx], weekIdx, "long");

        if (!hasTrailRaceWeek && weekIdx % 2 === 1 && weekIdx < totalWeeks - 2) {
          const hillIdx = days.findIndex((d: any, idx: number) => idx !== forcedLongIdx && !isRestDay(d) && !["Trail Run", "Trail Race", "Race", "Long Run", "Long"].includes(d.type));
          if (hillIdx >= 0) days[hillIdx] = toTrail(days[hillIdx], weekIdx, "hill");
        }
        if (!hasTrailRaceWeek && weekIdx < totalWeeks - 2) {
          const intervalIdx = days.findIndex((d: any, idx: number) => idx !== forcedLongIdx && !isRestDay(d) && !["Trail Run", "Trail Race", "Race"].includes(d.type));
          if (intervalIdx >= 0) days[intervalIdx] = toInterval(days[intervalIdx], weekIdx);
        }
        for (let i = 0; i < days.length; i++) {
          if (!days[i] || ["Rest", "Trail Run", "Trail Race", "Interval", "Cross Training"].includes(days[i].type)) continue;
          days[i] = toEasy(days[i], days[i].type === "Recovery" || i > forcedLongIdx ? "recovery" : "easy");
        }

        return { ...week, days };
      });
    };

    const buildDeterministicTrailRacePlan = (): any[] => {
      const totalWeeks = Math.max(1, Number(weeks) || 12);
      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const safeDaysPerWeek = Math.max(2, Math.min(7, Number(daysPerWeek) || 4));
      const restSet = new Set(Array.isArray(restDays) ? restDays : ["Mon"]);
      restSet.delete(longRunDay || "Sun");
      const baseStr = (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) ? startDate : new Date().toISOString().slice(0, 10);
      const base = new Date(baseStr + "T00:00:00Z");
      const dayLabelAt = (offset: number) => labels[(new Date(base.getTime() + offset * 86400000).getUTCDay() + 6) % 7];
      const fmt = (n: number) => Math.round(n * 10) / 10;
      const trailTitle = (kind: "long" | "hill" | "race" | "short") => isZh
        ? (kind === "race" ? "越野賽日" : kind === "hill" ? "越野爬升課" : kind === "short" ? "越野技術跑" : "越野長課")
        : (kind === "race" ? "Trail Race Day" : kind === "hill" ? "Trail Hill Session" : kind === "short" ? "Trail Skills Run" : "Trail Long Run");
      const trailDesc = (km: number, ele: number, eph: number, kind: "long" | "hill" | "race" | "short") => {
        if (isZh) {
          const purpose = kind === "race"
            ? "按越野賽努力分配體力，以 EpH 控制強度而非平路配速。"
            : kind === "hill"
              ? "在爬坡重複、起伏山徑或上坡節奏中累積垂直爬升，練習下坡控制。"
              : kind === "short"
                ? "輕鬆越野，專注步頻、落腳、下坡技術及補給節奏。"
                : "在越野路面完成長課，練習補給、上坡跑走切換、下坡控制及比賽裝備。";
          return `${fmt(km)}km · 爬升 ${Math.round(ele)}m · 目標 EpH ${fmt(eph)}。${purpose}`;
        }
        const purpose = kind === "race"
          ? "Race by effort using EpH instead of flat road pace."
          : kind === "hill"
            ? "Accumulate vertical on hill repeats, rolling trail, or uphill tempo; practise downhill control."
            : kind === "short"
              ? "Easy trail skills run focused on cadence, footing, descending, and fueling rhythm."
              : "Long run on trails; practise fueling, climb run/hike transitions, descents, and race kit.";
        return `${fmt(km)}km · ${Math.round(ele)}m ascent · target EpH ${fmt(eph)}. ${purpose}`;
      };
      const easyDay = (label: string, kind: "easy" | "recovery" = "easy", km = 6) => ({
        day: label,
        type: kind === "recovery" ? "Recovery" : "Easy Run",
        title: isZh ? (kind === "recovery" ? "恢復跑" : "輕鬆跑") : (kind === "recovery" ? "Recovery Run" : "Easy Run"),
        description: isZh ? (kind === "recovery" ? "Z1-Z2 非常輕鬆恢復跑，不按越野賽平均配速執行。" : "Z2 輕鬆跑，維持有氧與恢復，不按越野賽平均配速執行。") : (kind === "recovery" ? "Very easy Z1-Z2 recovery run; do not use trail-race average pace." : "Easy Z2 run for aerobic support; do not use trail-race average pace."),
        distance_km: fmt(km),
        pace: null,
        color: kind === "recovery" ? "#9C27B0" : "#4CAF50",
        elevation_m: null,
        eph: null,
      });
      const restDay = (label: string) => ({ day: label, type: "Rest", title: isZh ? "休息" : "Rest", description: isZh ? "全日休息恢復。" : "Full rest day for recovery.", distance_km: null, pace: null, color: "#607D8B", elevation_m: null, eph: null });
      const intervalDay = (label: string, weekIdx: number) => {
        const reps = weekIdx >= totalWeeks - 2 ? 4 : weekIdx % 3 === 0 ? 6 : 5;
        const dist = weekIdx % 2 === 0 ? "800m" : "1000m";
        return { day: label, type: "Interval", title: isZh ? "速度間歇" : "Road Speed Intervals", description: isZh ? `${dist} x ${reps} at 5K effort, rest 2:00 between sets。只作跑姿效率與速度維持，不用越野賽平均配速推算。` : `${dist} x ${reps} at 5K effort, rest 2:00 between sets. Leg-speed support only; do not derive pace from trail race average speed.`, distance_km: weekIdx >= totalWeeks - 2 ? 5 : 7, pace: null, color: "#F44336", elevation_m: null, eph: null };
      };
      const trailDay = (label: string, weekIdx: number, kind: "long" | "hill" | "race" | "short") => {
        const peakIdx = Math.max(1, totalWeeks - 4);
        const buildRatio = Math.min(weekIdx, peakIdx) / peakIdx;
        const peakLong = Math.min(trailKm * 0.72, effectiveWeeklyKm * 0.6);
        const baseLong = Math.max(10, Math.min(trailKm * 0.28, peakLong * 0.45));
        const recovery = weekIdx % 4 === 3 && weekIdx < peakIdx;
        let km = baseLong + (peakLong - baseLong) * buildRatio;
        if (recovery) km *= 0.76;
        if (weekIdx === totalWeeks - 2) km = Math.min(km, trailKm * 0.32);
        if (weekIdx >= totalWeeks - 1) km = Math.min(km, trailKm * 0.16);
        if (kind === "hill") km = Math.max(6, Math.min(14, effectiveWeeklyKm * (0.13 + buildRatio * 0.08)));
        if (kind === "short") km = Math.max(5, Math.min(10, effectiveWeeklyKm * 0.12));
        if (kind === "race") km = trailKm;
        const roundedKm = fmt(km);
        const ratio = kind === "hill" ? verticalPerKm * 1.35 : kind === "short" ? verticalPerKm * 0.75 : verticalPerKm;
        const ele = kind === "race" ? trailEle : Math.max(80, Math.round((roundedKm * ratio) / 10) * 10);
        const eph = kind === "race" ? raceEph : raceEph * (kind === "hill" ? 0.93 : kind === "short" ? 0.68 : weekIdx >= totalWeeks - 3 ? 0.86 : 0.76);
        return { day: label, type: kind === "race" ? "Trail Race" : "Trail Run", title: trailTitle(kind), description: trailDesc(roundedKm, ele, eph, kind), distance_km: roundedKm, pace: null, color: kind === "race" ? "#65A30D" : "#84CC16", elevation_m: ele, eph: fmt(eph) };
      };

      return Array.from({ length: totalWeeks }, (_, weekIdx) => {
        const days = labels.map((_, dayIdx) => {
          const label = dayLabelAt(weekIdx * 7 + dayIdx);
          return restSet.has(label) ? restDay(label) : easyDay(label, "easy", 6);
        });
        const raceIdx = days.findIndex((_, dayIdx) => {
          const dt = new Date(base.getTime() + ((weekIdx * 7 + dayIdx) * 86400000));
          return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}` === raceDate;
        });
        const runIdxs = days.map((d, idx) => d.type !== "Rest" ? idx : -1).filter((idx) => idx >= 0);
        const active = new Set<number>();
        const longIdx = raceIdx >= 0 ? raceIdx : runIdxs.find((idx) => days[idx].day === (longRunDay || "Sun")) ?? runIdxs[runIdxs.length - 1] ?? 6;
        active.add(longIdx);
        const qualityIdx = runIdxs.find((idx) => idx !== longIdx) ?? -1;
        const hillIdx = runIdxs.find((idx) => idx !== longIdx && idx !== qualityIdx) ?? -1;
        if (raceIdx >= 0) {
          days[raceIdx] = trailDay(days[raceIdx].day, weekIdx, "race");
        } else {
          days[longIdx] = trailDay(days[longIdx].day, weekIdx, "long");
          if (weekIdx % 2 === 1 && weekIdx < totalWeeks - 2 && hillIdx >= 0) { days[hillIdx] = trailDay(days[hillIdx].day, weekIdx, "hill"); active.add(hillIdx); }
          if (weekIdx < totalWeeks - 2 && qualityIdx >= 0) { days[qualityIdx] = intervalDay(days[qualityIdx].day, weekIdx); active.add(qualityIdx); }
          if (weekIdx % 2 === 0 && hillIdx >= 0 && !active.has(hillIdx)) { days[hillIdx] = trailDay(days[hillIdx].day, weekIdx, "short"); active.add(hillIdx); }
        }
        for (const idx of runIdxs) {
          if (active.size >= safeDaysPerWeek) break;
          active.add(idx);
        }
        for (const idx of runIdxs) {
          if (!active.has(idx)) days[idx] = restDay(days[idx].day);
          else if (!["Trail Run", "Trail Race", "Interval"].includes(days[idx].type)) days[idx] = easyDay(days[idx].day, idx > longIdx ? "recovery" : "easy", weekIdx >= totalWeeks - 1 ? 4 : 6 + Math.min(4, weekIdx * 0.3));
        }
        return { week: weekIdx + 1, days };
      });
    };

    const finalizePlanData = (input: any[]): any[] => {
      const planData = Array.isArray(input) ? input : [];
      const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const baseStr = (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate))
        ? startDate
        : new Date().toISOString().slice(0, 10);
      const rawBase = new Date(baseStr + "T00:00:00Z");
      // Snap to Monday of the week containing the start date so plan weeks always start on Monday.
      const offsetToMon = (rawBase.getUTCDay() + 6) % 7;
      const base = new Date(rawBase.getTime() - offsetToMon * 86400000);
      if (!isNaN(base.getTime())) {
        for (let w = 0; w < planData.length; w++) {
          const week = planData[w];
          if (!week || !Array.isArray(week.days)) continue;
          while (week.days.length < 7) {
            week.days.push({ day: DAY_LABELS[week.days.length], type: "Rest", title: "Rest", description: "", distance_km: null, pace: null, color: "#607D8B", elevation_m: null, eph: null });
          }
          if (week.days.length > 7) week.days.length = 7;
          for (let d = 0; d < 7; d++) {
            const dt = new Date(base.getTime() + ((w * 7 + d) * 86400000));
            const yyyy = dt.getUTCFullYear();
            const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(dt.getUTCDate()).padStart(2, "0");
            week.days[d].date = `${yyyy}-${mm}-${dd}`;
            week.days[d].day = DAY_LABELS[(dt.getUTCDay() + 6) % 7];
          }
          week.startDate = week.days[0].date;
          week.week = w + 1;
        }

        const daysFlat = planData.flatMap((week: any) => Array.isArray(week?.days) ? week.days : []);
        for (let i = 0; i < daysFlat.length; i++) {
          const race = raceList.find((r) => r.race_date === daysFlat[i]?.date);
          if (!race) continue;
          const priority = ["A", "B", "C"].includes(String(race.priority)) ? String(race.priority) : "none";
          daysFlat[i] = Object.assign(daysFlat[i], {
            type: "Race",
            title: race.name,
            description: isZh
              ? `${race.name}（${priority === "none" ? "未設定" : priority} 優先級）。此日按賽事行程安排為比賽。`
              : `${race.name} (${priority === "none" ? "unprioritized" : `${priority}-priority`} race). Scheduled from the runner's race calendar.`,
            distance_km: distanceForCategory(race.category),
            color: "#E91E63",
          });
          if (daysFlat[i + 1] && !["Rest", "Recovery"].includes(daysFlat[i + 1].type)) {
            daysFlat[i + 1] = Object.assign(daysFlat[i + 1], {
              type: "Recovery",
              title: isZh ? "賽後恢復" : "Post-race Recovery",
              description: isZh ? "非常輕鬆的賽後恢復跑。" : "Very easy post-race recovery run.",
              color: "#9C27B0",
            });
          }
        }
      }
      return repairTrailRacePlan(planData);
    };

    const langInstruction = isZh
      ? `All "title" and "description" fields MUST be written in Traditional Chinese (繁體中文, Hong Kong variant). The "type" and "day" fields should remain in English.`
      : `All "title" and "description" fields should be in English.`;

    if (isTrailRace) {
      const planData = finalizePlanData(buildDeterministicTrailRacePlan());
      return new Response(JSON.stringify({ plan: planData, raw: "deterministic-trail-race-plan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trailBlock = isTrailRace
      ? `\nTRAIL RACE PROGRAM REQUIREMENTS (STRICT):\n- Target race: ${trailKm} km with ${trailEle} m of total elevation gain.\n- Every week MUST include at least ONE "Trail Run" day (rolling/hill terrain) — ideally the long run is run on trails, especially in build weeks.\n- Every 2nd week MUST include a hill/trail-specific quality session: hill repeats (e.g. 6-10 × 90 sec uphill hard, jog down), or a Trail Run with progressive vertical (target eph close to race eph). Alternate between hill repeats and a tempo on rolling trail.\n- Keep ONE weekly road interval session for VO2max/leg speed (e.g. 5×1km, 6×800m) — written as "Interval" with proper "{dist}m x {reps} at {pace}/km, rest {time} between sets" format.\n- Include "Easy Run" days on road or flat trail for recovery between hard/trail sessions.\n- Long trail runs should progressively build BOTH distance AND elevation week to week (still respecting the +10% volume rule on distance; vertical may grow ~15-20% per build week from a sensible base).\n- For each "Trail Run" and "Trail Race" day include numeric "elevation_m" and "eph" (EpH = distance_km + elevation_m/100 per hour). Target race EpH = ${trailKm + trailEle / 100} effort points over the goal finish time of ${targetTime} (use this to derive workout eph targets).\n- Peak long trail run distance ≈ 60-75% of race distance with proportional elevation; reach this 3-4 weeks before race day, then taper.\n- The final 2 weeks taper: reduce volume AND vertical sharply; keep short race-pace EpH efforts on trail to stay sharp.\n`
      : "";
    const correctedTrailBlock = isTrailRace
      ? `\nTRAIL RACE PROGRAM REQUIREMENTS (STRICT — MUST FOLLOW):\n- Target race: ${trailKm} km with ${trailEle} m total ascent, target finish ${targetTime}. Race effort = ${raceEffortPoints.toFixed(1)} effort points; race EpH = ${raceEph.toFixed(1)}.\n- DO NOT build this like a road marathon plan. The plan must be trail-specific and vertical-specific.\n- EVERY week must include at least ONE "Trail Run". In normal build weeks, make the preferred long-run day ("${longRunDay || "Sun"}") a Trail Run, not a road Long Run.\n- Trail Run / Trail Race days MUST have pace: null, numeric elevation_m > 0, and numeric eph > 0. Never prescribe trail sessions by flat road pace.\n- Weekly Trail Run long runs must progressively build BOTH km and elevation. Use course specificity: about ${Math.round(verticalPerKm)} m ascent per km as the race ratio, with hill weeks up to ~120-140% of that ratio.\n- Every 2nd week must include a second trail-specific quality workout: hill repeats, uphill tempo, rolling trail progression, downhill technique, or hiking-on-climbs practice. This workout type should also be "Trail Run" with elevation_m and eph.\n- Keep at most ONE road Interval workout per week for speed economy. Intervals should not dominate the plan and should not be based on the trail race finish pace.\n- Include easy/recovery runs, but not as the main stimulus. The key stimuli are: trail long run, vertical gain, hill strength, downhill conditioning, fueling practice.\n- Peak trail long run should reach about 60-75% of race distance (${Math.round(trailKm * 0.6)}-${Math.round(trailKm * 0.75)} km) with proportional elevation 3-4 weeks before race day, then taper.\n- Final 2 weeks: reduce distance and vertical sharply while keeping short trail EpH efforts.\n- The race-day entry must be type "Trail Race", distance_km ${trailKm}, elevation_m ${trailEle}, eph ${raceEph.toFixed(1)}, pace null, color "#65A30D".\n`
      : "";

    const prompt = `Create a ${weeks}-week running training program.
Goal: ${goal}
Race: ${distanceFull}
Target time: ${targetTime}
Race date: ${raceDate}
${raceName ? `Target race event: "${raceName}"${raceCity ? ` in ${raceCity}${raceCountry ? `, ${raceCountry}` : ""}` : ""}. Tailor the plan to this specific race — consider its typical course profile (hills, flat, elevation), climate/weather for the race date, and any well-known characteristics of this event when shaping long runs, race-pace sessions, and the taper. Briefly mention the race-specific rationale in the description of key workouts (e.g. hill sessions if the course is hilly, heat acclimation if the race is in a hot climate).` : ""}
Running days per week: ${daysPerWeek || 4}
Preferred weekly volume: approximately ${effectiveWeeklyKm} km per week (adjust progressively; raised from user input when needed for trail-race specificity)

${langInstruction}
${raceScheduleBlock}
${correctedTrailBlock || trailBlock}

Structure it as a JSON array of weeks. Each week has a "week" number and "days" array (exactly 7 days per week, ordered Monday → Sunday). DO NOT include "date" or "startDate" fields — the system assigns calendar dates after generation. Just give 7 ordered day entries per week.
Each day has: "day" (Mon/Tue/Wed/Thu/Fri/Sat/Sun, in order), "type" (one of: "Easy Run", "Tempo Run", "Interval", "Long Run", "Recovery", "Rest", "Cross Training", "Race Pace", "Progression Run", "Trail Run", "Trail Race", "Race"), "title" (short workout name), "description" (see format rules below), "distance_km" (number or null for rest), "pace" (target pace per km as string like "5:30/km" or null for rest/trail), "color" (hex color for the workout type: #4CAF50 for Easy, #FF9800 for Tempo, #F44336 for Interval, #2196F3 for Long Run, #9C27B0 for Recovery, #607D8B for Rest, #00BCD4 for Cross Training, #E91E63 for Race Pace, #FF5722 for Progression, #84CC16 for Trail Run, #65A30D for Trail Race, #E91E63 for Race). For "Trail Run" and "Trail Race" days ALSO include numeric fields "elevation_m" (total ascent in meters) and "eph" (target Effort per Hour, where EpH = distance_km + elevation_m/100 per hour). For all other types, set "elevation_m" and "eph" to null.

WORKOUT TYPE DESCRIPTIONS (include a brief note of the type purpose in description):
- Easy Run: Comfortable conversational pace to build aerobic base.
- Tempo Run: Sustained comfortably hard effort at lactate threshold pace for 20-40 min.
- Interval: High-intensity repeats to develop VO2max. CRITICAL: The description field for ALL Interval workouts MUST follow EXACTLY this pattern: "{distance} x {reps} at {pace}/km, rest {duration} between sets". Examples: "800m x 6 at 4:00/km, rest 2:00 between sets", "400m x 10 at 4:15/km, rest 1:30 between sets", "1000m x 5 at 3:50/km, rest 2:30 between sets". Do NOT write paragraph-style or sentence-style descriptions for Interval workouts. ONLY the set notation format is acceptable.
- Long Run: Extended distance at easy-to-moderate pace for endurance.
- Recovery: Very easy short run for active recovery.
- Cross Training: Non-running cardio (cycling, swimming, etc.) for active recovery.
- Race Pace: Running at your target race pace to build race-day confidence.
- Progression Run: Start easy and gradually increase pace through the run, finishing at tempo or race pace.
- Trail Run: Off-road run with elevation. Effort is guided by EpH instead of flat pace. Specify distance_km, elevation_m, and a target eph.
- Trail Race: Trail race effort. Specify distance_km, elevation_m, and target eph for the race effort.
- Rest: Full rest day for recovery.

IMPORTANT: The runner wants to train exactly ${daysPerWeek || 4} days per week. The remaining days should be Rest days. Distribute the weekly volume across the running days.

WEEKLY MILEAGE PROGRESSION RULES (MUST follow strictly):
- Peak weekly volume target: approximately ${effectiveWeeklyKm} km (reach this near the end of the build phase, before the taper).
- 10% rule: weekly mileage MUST NOT increase by more than 10% from the previous week. Calculate week N km ≤ 1.10 × week (N-1) km. This is a safety/injury-prevention hard constraint.
- 3:1 build/taper cycle: structure training in repeating 4-week blocks of 3 build weeks followed by 1 recovery/down week. In each block: weeks 1, 2, 3 progressively increase mileage (each ≤ +10%), and week 4 is a recovery week reduced by ~20-30% from week 3 to allow adaptation.
- Final taper: the last 2 weeks before race date are a dedicated taper. Week (N-1) ≈ 70-80% of peak; race week ≈ 40-50% of peak with the race itself on race day.
- Start the program at a sensible base (e.g. ~50-60% of target peak km) so the 10% rule can be respected across all weeks.
- Verify your generated plan: for every consecutive non-recovery week pair, (next_week_km / prev_week_km) ≤ 1.10. If a week would violate this, reduce its volume.

CRITICAL SCHEDULING CONSTRAINTS (apply to EVERY week of the plan):
- The runner's preferred LONG RUN day is "${longRunDay || "Sun"}". ${isTrailRace ? 'For this trail race plan, schedule this as a "Trail Run" long run every build week, not a road "Long Run".' : 'Schedule the "Long Run" workout on this day every week (except optional taper/race week adjustments).'}
- The runner's preferred REST day(s) are: ${Array.isArray(restDays) && restDays.length ? restDays.map((d: string) => `"${d}"`).join(", ") : '"Mon"'}. These days MUST be "Rest" type every week.
- Place quality sessions (Tempo, Interval, Progression, Race Pace) on non-rest days, ideally with at least one easy/recovery day between hard efforts and before the long run.

IMPORTANT: Use a VARIETY of workout types throughout the plan. Do NOT only use Easy Run, Tempo Run, Interval, Long Run, and Rest. You MUST include Cross Training days (especially for recovery days) and Progression Run sessions (at least once every 2-3 weeks). A good plan uses ALL available workout types across the training cycle.

IMPORTANT: ${isTrailRace ? "For this trail race plan, do NOT calculate easy/recovery paces from the trail race finishing time. Use effort/HR wording for easy/recovery runs. Keep only optional road interval structure for leg speed, and set Trail Run / Trail Race pace to null with elevation_m + eph." : "For road/non-trail workouts, calculate and include appropriate pace per km based on road training effort. For Trail Run and Trail Race workouts, set pace to null and use elevation_m + eph instead."}

The program will start on ${startDate || "today"} (week 1, day 1 = Monday of that week's training cycle) and end on/around the race date ${raceDate}. Be progressive, practical, include taper in the last 1-2 weeks. Use km for distances.

Return ONLY valid JSON, no markdown, no explanation.`;

    const VERTEX_API_KEY = Deno.env.get("GOOGLE_VERTEX_API_KEY");
    if (!VERTEX_API_KEY) throw new Error("GOOGLE_VERTEX_API_KEY not configured");

    let response: Response | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        response = await callVertexAI({
          apiKey: VERTEX_API_KEY,
          model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert running coach. Return ONLY valid JSON arrays. No markdown, no code fences, no explanation. Just raw JSON.",
          },
          { role: "user", content: prompt },
        ],
      });

      if (response.ok || (response.status !== 502 && response.status !== 503)) break;

      console.warn(`AI gateway returned ${response.status}, retrying (${attempt + 1}/${maxRetries})...`);
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (!response || !response.ok) {
      const errText = await response?.text() || "No response";
      console.error("AI gateway error:", response?.status, errText);

      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response?.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${response?.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "[]";

    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Validate JSON
    let planData;
    try {
      planData = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response as JSON:", content.substring(0, 500));
      planData = [];
    }

    // Trail race plans are business-critical and the model sometimes returns
    // malformed/empty JSON for long vertical plans. Never let that erase the
    // user's active plan; fall back to a deterministic trail-specific build.
    if (isTrailRace && (!Array.isArray(planData) || planData.length === 0)) {
      console.warn("AI returned empty trail race plan; using deterministic fallback");
      planData = buildDeterministicTrailRacePlan();
    }

    // Post-process: validate interval descriptions follow set format
    const intervalPattern = /^\d+m?\s*x\s*\d+/i;
    if (Array.isArray(planData)) {
      for (const week of planData) {
        if (week?.days && Array.isArray(week.days)) {
          for (const day of week.days) {
            if (day.type === "Interval" && day.description && !intervalPattern.test(day.description.trim())) {
              // Try to extract numbers from the description and reformat
              const distMatch = day.description.match(/(\d+)\s*m/i);
              const repMatch = day.description.match(/x\s*(\d+)|(\d+)\s*(reps|repeats|sets)/i);
              const paceMatch = day.description.match(/(\d+:\d+)\/km/);
              const restMatch = day.description.match(/rest\s*(\d+:\d+|\d+\s*min)/i);
              if (distMatch && repMatch) {
                const dist = distMatch[1];
                const reps = repMatch[1] || repMatch[2];
                const pace = paceMatch ? ` at ${paceMatch[1]}/km` : (day.pace ? ` at ${day.pace}` : "");
                const rest = restMatch ? `, rest ${restMatch[1]} between sets` : "";
                day.description = `${dist}m x ${reps}${pace}${rest}`;
              }
            }
          }
        }
      }
    }

    // Post-process: assign dates, reconcile races, and enforce trail metrics.
    planData = finalizePlanData(planData);

    return new Response(JSON.stringify({ plan: planData, raw: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-program error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
