// plan-auto-adjust
//
// Three jobs in one function:
//
//  1. action:"detect"      — look at the current week of a runner's active plan, decide whether
//                            real training drifted far enough from the assignment to justify a
//                            rewrite, and if so regenerate the remaining weeks with Gemini.
//  2. action:"recalibrate" — full-program audit: reconcile every past day against what actually
//                            happened, then rebuild all remaining weeks from that real baseline
//                            (and report an honest target time).
//  3. action:"revert"      — restore the plan snapshot taken before the latest applied adjustment.
//
// Cron mode: POST with header x-webhook-key: <WEBHOOK_AUTH_KEY> and body { cron: true } to run
// "detect" for a bounded batch of opted-in plans.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildVertexAuth } from "../_shared/vertex-auth.ts";
import {
  auditPlanHistory,
  classifyDeviation,
  fetchActivities,
  parseDurationStr,
  fmtDuration,
  parseJsonLoose,
  predictTimeFromVdot,
  raceDistanceMeters,
  recentVdotFromActivities,
  shouldAdjust,
  type DayDeviation,
  type NormActivity,
  type PlanAudit,
  type WeekPlan,
} from "../_shared/planAdherence.ts";
import {
  alignPastDaysToActual,
  applyDaySwaps,
  detectWeekSwaps,
  enforceAdjustedSchedule,
  habitLines,
  swapLines,
  weekdayHabits,
  type DaySwap,
} from "../_shared/planDaySwaps.ts";
import {
  buildLoadContext,
  fetchHrvContext,
  loadContextLines,
  type LoadContext,
} from "../_shared/planLoadContext.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ---------- HKT date helpers (the app treats HKT as the runner's day boundary) ----------

function hktToday(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

// ---------- Vertex ----------

function vertexProject() {
  return Deno.env.get("GOOGLE_VERTEX_PROJECT_ID") || Deno.env.get("GOOGLE_CLOUD_PROJECT") || "inbound-isotope-500908-n8";
}
function vertexLocation() {
  return Deno.env.get("GOOGLE_VERTEX_LOCATION") || "global";
}

async function callGemini(system: string, user: string, model = "gemini-3-flash-preview", temperature = 0.6): Promise<string> {
  const apiKey = Deno.env.get("GOOGLE_VERTEX_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_VERTEX_API_KEY not configured");
  const base = `https://aiplatform.googleapis.com/v1/projects/${vertexProject()}/locations/${vertexLocation()}/publishers/google/models/${model}:generateContent`;
  const { url, headers } = await buildVertexAuth(base, apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 65535,
        responseMimeType: "application/json",
        temperature,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Vertex ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = await res.json();
  const finish = data?.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") console.warn("plan-auto-adjust finishReason:", finish);
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
}

/** Strip any finishing/goal/target-time talk the model slipped into a summary. */
function stripTargetTimeTalk(text: string | null): string | null {
  if (!text) return text;
  const sentences = text.split(/(?<=[.!?。！？])\s*/);
  const bad = /(target|goal|finish(ing)?|predicted|realistic)\s*(race\s*)?time|\b\d{1,2}:\d{2}(:\d{2})?\b|目標時間|完賽時間|預計時間|預測時間|成績目標/i;
  const kept = sentences.filter((s) => s.trim() && !bad.test(s));
  return (kept.join(" ").trim() || null);
}

/** Stable hash of everything that legitimately changes a recalibration outcome. */
async function inputFingerprint(
  plan: any,
  todayISO: string,
  audit: PlanAudit,
  activities: NormActivity[],
  kind: string,
  load?: LoadContext,
): Promise<string> {
  const acts = activities
    .map((a) => `${a.date}|${Math.round(a.distance_m)}|${Math.round(a.seconds)}|${a.avg_hr ?? ""}`)
    .sort()
    .join(";");
  const payload = JSON.stringify({
    kind,
    plan: plan.id,
    day: todayISO,
    race: plan.race_date ?? null,
    target: plan.target_time ?? null,
    totals: audit.totals,
    weeks: audit.weeks.map((w) => [w.week, w.planned_km, w.actual_km, w.completion_pct, w.missed_key_sessions]),
    load: load
      ? [
          load.volume_ceiling_km,
          load.volume_floor_km,
          load.tss.acute_7d,
          load.tss.chronic_28d_avg,
          load.hrv.status,
          load.hrv.hrv_delta_pct,
        ]
      : null,
    acts,
  });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}


// ---------- plan stitching ----------

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COLOR_BY_TYPE: Record<string, string> = {
  "Easy Run": "#4CAF50",
  "Tempo Run": "#FF9800",
  "Interval": "#F44336",
  "Long Run": "#2196F3",
  "Recovery": "#9C27B0",
  "Rest": "#607D8B",
  "Cross Training": "#00BCD4",
  "Race Pace": "#E91E63",
  "Progression Run": "#FF5722",
  "Trail Run": "#84CC16",
  "Trail Race": "#65A30D",
  "Race": "#E91E63",
};

/**
 * Overwrite weeks from `fromIndex` onward with AI-produced weeks, while keeping the
 * original calendar dates, week numbers and day labels intact. Race days already on the
 * calendar are preserved so a rewrite can never delete a race.
 */
function stitchFutureWeeks(
  before: WeekPlan[],
  aiWeeks: any[],
  fromIndex: number,
  protectFromDate?: string,
  completedDates = new Set<string>(),
): WeekPlan[] {
  const out: WeekPlan[] = JSON.parse(JSON.stringify(before));
  for (let i = 0; i < aiWeeks.length; i++) {
    const targetIdx = fromIndex + i;
    const target = out[targetIdx];
    if (!target || !Array.isArray(target.days)) continue;
    const src = aiWeeks[i];
    const srcDays = Array.isArray(src?.days) ? src.days : [];
    for (let d = 0; d < target.days.length && d < 7; d++) {
      const orig: any = target.days[d];
      const incoming = srcDays[d];
      if (!incoming) continue;
      // Never rewrite a day that already happened, or a calendar race.
      if (protectFromDate && orig.date && (orig.date < protectFromDate || completedDates.has(orig.date))) continue;
      if (orig.type === "Race" || orig.type === "Trail Race") continue;
      const type = String(incoming.type || orig.type || "Easy Run");
      const isRestType = /rest|off|休息/i.test(type);
      target.days[d] = {
        ...orig,
        type,
        title: incoming.title ?? orig.title,
        description: incoming.description ?? orig.description,
        // A Rest day never carries a distance or pace, even if the model omitted them
        // (otherwise a stale assignment would linger and be scored as "missed").
        distance_km: isRestType ? null : (incoming.distance_km === undefined ? orig.distance_km : incoming.distance_km),
        pace: isRestType ? null : (incoming.pace === undefined ? orig.pace : incoming.pace),
        // Never retain nested steps from the old workout when its type changes. This was
        // the source of "ghost" Interval sessions after an Interval became Recovery/Easy.
        sessions: isRestType || type !== String(orig.type ?? "")
          ? incoming.sessions
          : (incoming.sessions ?? orig.sessions),
        elevation_m: incoming.elevation_m ?? orig.elevation_m ?? null,
        eph: incoming.eph ?? orig.eph ?? null,
        // Color always follows the (possibly new) type so a rewritten session
        // never keeps the old workout's color (e.g. Easy green on an Interval).
        color: COLOR_BY_TYPE[type] || incoming.color || orig.color || "#4CAF50",
        // keep date + day label from the original calendar
        date: orig.date,
        day: orig.day ?? DAY_LABELS[d],
        auto_adjusted: true,
      };
    }
    out[targetIdx] = { ...target, week: target.week, startDate: target.startDate };
  }
  return out;
}

/** Annotate past days with what actually happened so the calendar tells the truth. */
function reconcilePastDays(plan: WeekPlan[], audit: PlanAudit, todayISO: string): WeekPlan[] {
  const byDate = new Map<string, DayDeviation>();
  for (const w of audit.weeks) for (const d of w.days) byDate.set(d.date, d);
  const out: WeekPlan[] = JSON.parse(JSON.stringify(plan));
  for (const w of out) {
    if (!Array.isArray(w.days)) continue;
    for (const day of w.days as any[]) {
      if (!day?.date || day.date >= todayISO) continue;
      const dev = byDate.get(day.date);
      if (!dev) continue;
      day.actual_km = dev.actual_km;
      day.actual_pace_sec = dev.actual_pace_sec;
      day.actual_avg_hr = dev.actual_avg_hr;
      day.adherence = dev.adherence;
      day.completed = dev.actual_km >= 0.5;
      day.reconciled_at = new Date().toISOString();
    }
  }
  return out;
}

// ---------- prompt building ----------

function weekSummaryLines(audit: PlanAudit, upToIndex: number): string {
  return audit.weeks
    .filter((w) => w.week_index <= upToIndex)
    .map((w) => {
      const missed = w.missed_key_sessions ? `, ${w.missed_key_sessions} key session(s) missed/downgraded` : "";
      const pace = w.avg_pace_sec_per_km
        ? `, avg pace ${Math.floor(w.avg_pace_sec_per_km / 60)}:${String(w.avg_pace_sec_per_km % 60).padStart(2, "0")}/km`
        : "";
      const hr = w.avg_hr ? `, avg HR ${w.avg_hr}` : "";
      return `- Week ${w.week} (${w.start_date} → ${w.end_date}): planned ${w.planned_km}km / ran ${w.actual_km}km (${w.completion_pct}% of sessions), longest ${w.longest_run_km}km${pace}${hr}${missed}`;
    })
    .join("\n");
}

function deviationLines(devs: DayDeviation[]): string {
  return devs
    .map((d) => {
      const assigned = d.assigned_km ? `${d.assigned_type ?? "run"} ${d.assigned_km}km${d.assigned_pace ? ` @ ${d.assigned_pace}` : ""}` : (d.assigned_type ?? "Rest");
      const actual = d.actual_km > 0
        ? `${d.actual_km}km${d.actual_pace_sec ? ` @ ${Math.floor(d.actual_pace_sec / 60)}:${String(Math.round(d.actual_pace_sec % 60)).padStart(2, "0")}/km` : ""}`
        : "nothing recorded";
      return `- ${d.date}: assigned ${assigned} → actual ${actual} [${d.adherence}${d.is_key_session ? ", KEY SESSION" : ""}]`;
    })
    .join("\n");
}

function futureWeekSkeleton(plan: WeekPlan[], fromIndex: number): string {
  return plan
    .slice(fromIndex)
    .map((w) => {
      const days = (Array.isArray(w.days) ? w.days : []) as any[];
      const locked = days
        .filter((d) => d.type === "Race" || d.type === "Trail Race")
        .map((d) => `${d.date} LOCKED RACE: ${d.title ?? d.type}`)
        .join("; ");
      return `- Week ${w.week}: ${days[0]?.date ?? "?"} → ${days[days.length - 1]?.date ?? "?"}${locked ? ` | ${locked}` : ""}`;
    })
    .join("\n");
}

// ---------- core adjust routine ----------

interface AdjustResult {
  status: string;
  reason?: string;
  adjustment_id?: string;
  weeks_rewritten?: number;
  day_swaps?: unknown;
  past_days_rewritten?: number;
  revised_target_time?: string | null;
  summary_en?: string | null;
  summary_zh?: string | null;
  audit?: unknown;
}

async function runAdjust(
  admin: any,
  plan: any,
  kind: "auto" | "recalibrate",
  opts: { dryRun?: boolean; force?: boolean; force_regenerate?: boolean } = {},
): Promise<AdjustResult> {
  const todayISO = hktToday();
  const planData: WeekPlan[] = Array.isArray(plan.plan_data) ? plan.plan_data : [];
  if (planData.length === 0) return { status: "skipped", reason: "Plan has no weeks." };

  const allDates = planData.flatMap((w) => (Array.isArray(w.days) ? (w.days as any[]) : []).map((d) => d.date)).filter(Boolean).sort();
  const planStart = allDates[0];
  const planEnd = allDates[allDates.length - 1];
  if (!planStart || !planEnd) return { status: "skipped", reason: "Plan has no dates." };
  if (planEnd < todayISO) return { status: "skipped", reason: "Plan has already finished." };

  // Pull every activity inside the plan window (plus a little slack for timezone edges).
  const activities: NormActivity[] = await fetchActivities(
    admin,
    plan.user_id,
    planStart + "T00:00:00Z",
    new Date(new Date(todayISO + "T00:00:00Z").getTime() + 2 * 86400000).toISOString(),
  );

  const audit = auditPlanHistory(planData, activities, todayISO);
  const curIdx = audit.current_week_index;
  const curWeek = audit.weeks[curIdx];

  // ── day-of-week rescheduling ──
  // Sessions the runner shifted to another day inside the same week are a preference, not a
  // miss: rewrite those past days so the calendar matches reality, and feed the runner's real
  // weekday habits to the model so current/future weeks land on the days they actually train.
  const swaps: DaySwap[] = audit.weeks.flatMap((w) => detectWeekSwaps(w.week_index, w.days, todayISO));
  const allPastDays: DayDeviation[] = audit.weeks.flatMap((w) => w.days).filter((d) => d.date < todayISO);
  const habits = weekdayHabits(allPastDays);
  const swapped = applyDaySwaps(planData, swaps);
  // Past weeks should read like a logbook, not a wish list: rewrite elapsed days to the
  // work that actually happened. This also stops a skipped hard session from standing
  // next to the rescheduled one (e.g. two intervals in the same week).
  const planIsZh = /[\u4e00-\u9fff]/.test(
    JSON.stringify(planData.slice(0, 2)).slice(0, 4000),
  );
  const aligned = alignPastDaysToActual(swapped, allPastDays, todayISO, planIsZh ? "zh" : "en");
  const basePlan = aligned.plan;

  // ── decide ──
  let reason = "Manual recalibration requested.";
  let reasonCode = "MANUAL_RECALIBRATE";
  if (kind === "auto") {
    const weeksLeft = planData.length - curIdx;
    const isTaper = weeksLeft <= 2;
    const daysSoFar = (curWeek?.days ?? []).filter((d) => d.date < todayISO);
    if (daysSoFar.length < 3 && !opts.force) {
      return { status: "skipped", reason: "Too early in the week to judge adherence." };
    }
    const decision = shouldAdjust(daysSoFar, { isTaper });
    if (!decision.should_adjust && !opts.force) {
      return { status: "no_change", reason: decision.reason };
    }
    reason = decision.reason;
    reasonCode = decision.reason_code;
  }

  // Rewrite from the *next* day onward: today and the future are fair game, the past is frozen.
  const fromIndex = curIdx;
  const remainingWeeks = planData.length - fromIndex;
  if (remainingWeeks <= 0) return { status: "skipped", reason: "No weeks left to adjust." };

  // ── honest target time ──
  const raceMeters = raceDistanceMeters(plan.distance);
  const vdot = recentVdotFromActivities(activities, kind === "recalibrate" ? 84 : 42, todayISO);
  const goalSecs = parseDurationStr(plan.target_time);
  let realisticTime: string | null = null;
  if (vdot && raceMeters) {
    const pred = predictTimeFromVdot(vdot, raceMeters);
    if (pred) realisticTime = fmtDuration(pred);
  }

  // ── load + recovery context ──
  // Volume decisions must come from real load (weekly km, TSS, acute:chronic) and recovery
  // (HRV / resting HR) AND from the plan's own intent (planned peak week), not from the
  // block average — otherwise a peak week gets rebuilt at base-phase mileage.
  const maxHrSeen = activities.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) || null;
  const thresholdPaceSec = vdot ? (() => {
    const t5k = predictTimeFromVdot(vdot, 5000);
    return t5k ? (t5k / 5) * 1.06 : null; // ~threshold pace ≈ 6% slower than 5k pace
  })() : null;
  const hrvCtx = await fetchHrvContext(admin, plan.user_id, todayISO);
  const load: LoadContext = buildLoadContext({
    planData,
    audit,
    activities,
    todayISO,
    fromIndex,
    hrv: hrvCtx,
    thresholdPaceSec,
    maxHr: maxHrSeen,
  });

  const isZh = true; // both summaries are generated; UI picks by locale

  const system =
    "You are an elite running coach who revises training plans. You return ONLY valid JSON, no markdown, no code fences, no commentary.";

  const commonRules = `
HARD RULES:
- Return exactly ${remainingWeeks} weeks, in order, matching the calendar skeleton below (week 1 of your output = the first week in the skeleton).
- Each week: { "week": <number>, "days": [7 day objects, Monday→Sunday] }.
- Each day: { "day": "Mon".."Sun", "type", "title", "description", "distance_km" (number or null), "pace" (e.g. "5:30/km", or null for Rest/Cross Training/Trail), "color" (hex), "elevation_m" (number or null), "eph" (number or null) }.
- DO NOT output "date" or "startDate" — the system keeps the existing calendar dates.
- Allowed types: "Easy Run", "Tempo Run", "Interval", "Long Run", "Recovery", "Rest", "Cross Training", "Race Pace", "Progression Run", "Trail Run", "Trail Race".
- Colors: #4CAF50 Easy, #FF9800 Tempo, #F44336 Interval, #2196F3 Long Run, #9C27B0 Recovery, #607D8B Rest, #00BCD4 Cross Training, #E91E63 Race Pace, #FF5722 Progression, #84CC16 Trail Run.
- The race date is FIXED. Days already marked as a LOCKED RACE in the skeleton must stay a race — do not schedule hard work the 2 days before them.
- VOLUME: obey the numeric guardrails in the LOAD & RECOVERY block. The first rebuilt week must be between ${load.volume_floor_km}km and ${load.volume_ceiling_km}km, then progress by at most 10% per week toward the plan's remaining peak (${load.planned_remaining_peak_km}km) before the taper. Do NOT "catch up" missed mileage, and do NOT cut a runner who is already holding high volume back to their block average.
- Do NOT reduce weekly volume below what the runner has actually been running unless (a) it is a taper week, (b) recovery status is "suppressed", or (c) the acute:chronic ratio is above 1.4. If none of those apply, keep building toward the original planned peak.
- If the runner has been running MORE than the plan asked with normal or elevated recovery, treat that as proven capacity: keep their volume and improve the structure/intensity distribution instead of lowering mileage.
- Keep the same number of running days per week the runner has actually been managing.

- YOU MAY AND SHOULD MOVE SESSIONS TO DIFFERENT WEEKDAYS. Use the runner's real weekday habits below: put key sessions (Tempo/Interval/Long Run) on the weekdays they consistently train hard or long, and put Rest on the weekdays they consistently do not run. Do not keep a session on a weekday the runner repeatedly skips.
- Keep at least one easy/rest day between two hard sessions after any reshuffle.
- Count the key sessions ALREADY COMPLETED earlier in the current week (see the day-by-day list). Do not schedule a second Tempo/Interval/Long Run in the remainder of that week if the same kind of session was already done — make the remaining days Easy Run, Recovery or Rest instead.
- Interval descriptions must use the format "{dist}m x {reps} at {pace}/km, rest {time} between sets".
- Preserve a proper taper in the final 2 weeks before the race.
- Write "title" and "description" in BOTH not required — write them in Traditional Chinese if the runner's plan text is Chinese, otherwise English. Match the language of the existing plan text shown below.

Also return, alongside "weeks":
- "summary_en": 2-3 sentences telling the runner plainly what changed and why.
- "summary_zh": the same explanation in Traditional Chinese.
- NEVER mention, estimate, revise or comment on a finishing time, goal time, target time or predicted race time anywhere in the summaries. Talk only about the training changes (volume, session types, weekdays, recovery).

Return a single JSON object: { "weeks": [...], "summary_en": "...", "summary_zh": "..." }`;


  const sampleText = JSON.stringify(
    (planData[fromIndex]?.days as any[])?.slice(0, 3)?.map((d) => ({ type: d.type, title: d.title, description: d.description })) ?? [],
  );

  let userPrompt: string;
  if (kind === "recalibrate") {
    userPrompt = `Recalibrate an in-progress running plan against what the runner ACTUALLY did.

PLAN
- Goal: ${plan.goal}
- Race: ${plan.distance}${plan.race_date ? ` on ${plan.race_date}` : ""}
- Original target time: ${plan.target_time}
- Total weeks: ${planData.length}; today is ${todayISO} (currently in week ${audit.weeks[curIdx]?.week ?? curIdx + 1})

WHAT ACTUALLY HAPPENED (full block audit)
${weekSummaryLines(audit, curIdx)}

Overall so far: planned ${audit.totals.planned_km}km, ran ${audit.totals.actual_km}km (${audit.totals.adherence_pct}% adherence), ${audit.totals.missed_key_sessions} key sessions missed or downgraded, longest run ${audit.totals.longest_run_km}km.
Estimated current fitness (VDOT) from best recent effort: ${vdot ?? "unknown"}. Use it to set training paces only — do not comment on race finishing times.


RUNNER'S REAL WEEKDAY HABITS (use these to schedule the weekdays)
${habitLines(habits)}

SESSIONS THE RUNNER SHIFTED TO ANOTHER DAY (already re-dated on the calendar for past weeks)
${swapLines(swaps)}

DEVIATIONS IN THE CURRENT WEEK
${deviationLines(curWeek?.days ?? []) || "- none"}

YOUR TASK
Rebuild the remaining ${remainingWeeks} weeks from the runner's REAL current fitness and their REAL weekly rhythm, not from the original assumptions. If they consistently do their hard or long work on different weekdays than the plan assumed, reschedule the weekdays to match them. If the block was under-executed, lower volume and intensity to a base the runner can actually hold. If it was over-executed, protect against injury rather than piling on more. Rebuild progression logically toward race day.

CALENDAR SKELETON (weeks you must fill, in order)
${futureWeekSkeleton(planData, fromIndex)}

EXISTING PLAN TEXT STYLE / LANGUAGE SAMPLE
${sampleText}
${commonRules}`;
  } else {
    userPrompt = `Adjust an in-progress running plan because this week's training drifted from the assignment.

PLAN
- Goal: ${plan.goal}
- Race: ${plan.distance}${plan.race_date ? ` on ${plan.race_date}` : ""}
- Target time: ${plan.target_time}
- Total weeks: ${planData.length}; today is ${todayISO} (currently in week ${audit.weeks[curIdx]?.week ?? curIdx + 1})

TRIGGER
${reason}

THIS WEEK, DAY BY DAY
${deviationLines(curWeek?.days ?? []) || "- none"}

RECENT WEEKS
${weekSummaryLines(audit, curIdx)}
RUNNER'S REAL WEEKDAY HABITS (use these to schedule the weekdays)
${habitLines(habits)}

SESSIONS THE RUNNER SHIFTED TO ANOTHER DAY (already re-dated on the calendar for past weeks)
${swapLines(swaps)}

Real recent load: ${audit.totals.recent_4w_km}km in the last 4 weeks (avg ${audit.totals.avg_weekly_km}km/week). Estimated fitness VDOT ${vdot ?? "unknown"} (use for training paces only; never comment on finishing times).

YOUR TASK
The runner cut short or skipped work — treat that as a signal of fatigue, illness, or life load, not laziness. Rebuild the remaining ${remainingWeeks} weeks so the next 3-5 days are gentler, moving sessions onto the weekdays the runner actually trains on, then progression resumes at a realistic level. Do NOT reschedule missed mileage into the coming days. Keep the race date and taper intact.

CALENDAR SKELETON (weeks you must fill, in order)
${futureWeekSkeleton(planData, fromIndex)}

EXISTING PLAN TEXT STYLE / LANGUAGE SAMPLE
${sampleText}
${commonRules}`;
  }

  if (opts.dryRun) {
    return {
      status: "dry_run",
      reason,
      weeks_rewritten: remainingWeeks,
      day_swaps: swaps,
      past_days_rewritten: aligned.rewritten,
      revised_target_time: realisticTime,
      audit: { totals: audit.totals, current_week: curWeek },
    };
  }

  // ── consistency gate ──────────────────────────────────────────────────────
  // Recalibration is a function of the runner's real training history, so clicking it
  // twice with no new runs must NOT produce a different plan (each rebuild otherwise
  // feeds on the previous rebuild and drifts). We fingerprint the inputs that legitimately
  // change the outcome — the day, the audit of what was actually run, and the activity
  // log itself — and short-circuit when an applied adjustment already used that exact input.
  const fingerprint = await inputFingerprint(plan, todayISO, audit, activities, kind);
  const { data: sameInput } = await admin
    .from("plan_auto_adjustments")
    .select("id,summary_en,summary_zh,triggered_at")
    .eq("plan_id", plan.id)
    .eq("status", "applied")
    .eq("input_fingerprint", fingerprint)
    .order("triggered_at", { ascending: false })
    .limit(1);
  const prior = sameInput?.[0];
  if (prior && !opts.force_regenerate) {
    return {
      status: "no_change",
      reason: "Your plan is already recalibrated against this training history — nothing new has been recorded since, so the result would be identical.",
      adjustment_id: prior.id,
      summary_en: prior.summary_en ?? null,
      summary_zh: prior.summary_zh ?? null,
      audit: { totals: audit.totals },
    };
  }

  // temperature 0 → same inputs give the same rebuild.
  const raw = await callGemini(system, userPrompt, "gemini-3-flash-preview", 0);
  const parsed = parseJsonLoose(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  const aiWeeks: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.weeks) ? parsed.weeks : [];
  if (aiWeeks.length === 0) {
    return { status: "failed", reason: "The coach model did not return a usable plan." };
  }

  // A run already recorded today is completed work, not a slot the regenerated plan may
  // overwrite. Protect all activity dates as well as earlier calendar days.
  const completedDates = new Set(activities.map((activity) => activity.date));
  let after = stitchFutureWeeks(basePlan, aiWeeks, fromIndex, todayISO, completedDates);
  after = enforceAdjustedSchedule(basePlan, after, todayISO, planIsZh ? "zh" : "en");
  if (kind === "recalibrate") after = reconcilePastDays(after, audit, todayISO);

  // We never surface a finishing time with adjustments — the plan keeps the runner's own
  // goal, and any target-time talk the model slipped into its summary is stripped out.
  const revised: string | null = null;
  const summaryEn = stripTargetTimeTalk(parsed?.summary_en ?? null);
  const summaryZh = stripTargetTimeTalk(parsed?.summary_zh ?? null);


  const { data: adj, error: adjErr } = await admin
    .from("plan_auto_adjustments")
    .insert({
      user_id: plan.user_id,
      plan_id: plan.id,
      kind,
      status: "applied",
      trigger_reason: `${reasonCode}: ${reason}`,
      deviation: { reason_code: reasonCode, days: curWeek?.days ?? [], day_swaps: swaps, past_days_rewritten: aligned.rewritten },
      audit: { totals: audit.totals, weeks: audit.weeks.map(({ days, ...w }) => w), vdot, fitness_based_time: realisticTime, weekday_habits: habits },
      plan_data_before: planData,
      plan_data_after: after,
      revised_target_time: revised,
      summary_en: summaryEn,
      summary_zh: summaryZh,
      input_fingerprint: fingerprint,
    })
    .select("id")
    .single();
  if (adjErr) throw new Error(`Failed to record adjustment: ${adjErr.message}`);

  const { error: upErr } = await admin
    .from("training_plans")
    .update({ plan_data: after })
    .eq("id", plan.id);
  if (upErr) throw new Error(`Failed to save adjusted plan: ${upErr.message}`);

  return {
    status: "applied",
    reason,
    adjustment_id: adj?.id,
    weeks_rewritten: aiWeeks.length,
    day_swaps: swaps,
    past_days_rewritten: aligned.rewritten,
    revised_target_time: revised,
    summary_en: summaryEn,
    summary_zh: summaryZh,
    audit: { totals: audit.totals },
  };
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const webhookKey = req.headers.get("x-webhook-key");
  const isCron = !!body.cron && !!webhookKey && webhookKey === Deno.env.get("WEBHOOK_AUTH_KEY");

  // ───────── cron: bounded batch of opted-in plans ─────────
  if (isCron) {
    const todayISO = hktToday();
    const limit = Math.min(Number(body.limit) || 25, 50);
    const { data: plans, error } = await admin
      .from("training_plans")
      .select("id,user_id,goal,distance,target_time,race_date,weeks,plan_data,auto_adjust_enabled")
      .eq("auto_adjust_enabled", true)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const plan of plans ?? []) {
      try {
        // Idempotency: at most one auto adjustment per plan per day.
        const { data: recent } = await admin
          .from("plan_auto_adjustments")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("kind", "auto")
          .gte("triggered_at", todayISO + "T00:00:00Z")
          .limit(1);
        if (recent && recent.length > 0) {
          results.push({ plan_id: plan.id, status: "skipped", reason: "Already evaluated today." });
          continue;
        }
        const r = await runAdjust(admin, plan, "auto", { dryRun: !!body.dry_run });
        results.push({ plan_id: plan.id, ...r });
      } catch (e) {
        console.error("auto-adjust failed", plan.id, e);
        results.push({ plan_id: plan.id, status: "error", reason: String((e as Error)?.message ?? e) });
      }
    }
    return json({ processed: results.length, results });
  }

  // ───────── user-authenticated actions ─────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const action = String(body.action || "detect");

  try {
    // Resolve the plan and confirm ownership.
    let planQuery = admin
      .from("training_plans")
      .select("id,user_id,goal,distance,target_time,race_date,weeks,plan_data,auto_adjust_enabled")
      .eq("user_id", user.id);
    if (body.plan_id) planQuery = planQuery.eq("id", body.plan_id);
    const { data: plans, error: planErr } = await planQuery.order("created_at", { ascending: false }).limit(1);
    if (planErr) return json({ error: planErr.message }, 500);
    const plan = plans?.[0];
    if (!plan) return json({ error: "No training plan found" }, 404);

    if (action === "revert") {
      const { data: last, error: lastErr } = await admin
        .from("plan_auto_adjustments")
        .select("id,plan_data_before")
        .eq("plan_id", plan.id)
        .eq("user_id", user.id)
        .eq("status", "applied")
        .order("triggered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastErr) return json({ error: lastErr.message }, 500);
      if (!last) return json({ status: "no_change", reason: "There is nothing to undo." });

      const { error: rErr } = await admin.from("training_plans").update({ plan_data: last.plan_data_before }).eq("id", plan.id);
      if (rErr) return json({ error: rErr.message }, 500);
      await admin.from("plan_auto_adjustments").update({ status: "reverted" }).eq("id", last.id);
      return json({ status: "reverted", adjustment_id: last.id });
    }

    if (action === "detect" || action === "recalibrate") {
      const kind = action === "recalibrate" ? "recalibrate" : "auto";
      const result = await runAdjust(admin, plan, kind as "auto" | "recalibrate", {
        dryRun: !!body.dry_run,
        force: kind === "auto" ? !!body.force : true,
        force_regenerate: !!body.force_regenerate,
      });
      return json(result);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("plan-auto-adjust error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
