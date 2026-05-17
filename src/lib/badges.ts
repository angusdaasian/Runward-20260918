import type { StravaActivity } from "@/hooks/use-activities";

// Badge images
import imgFirstSteps from "@/assets/badges/first_steps.png";
import imgGettingStarted from "@/assets/badges/getting_started.png";
import imgDedicatedRunner from "@/assets/badges/dedicated_runner.png";
import imgCenturyClub from "@/assets/badges/century_club.png";
import imgMarathonVeteran from "@/assets/badges/marathon_veteran.png";
import imgWeekWarrior from "@/assets/badges/week_warrior.png";
import imgMonthlyMaster from "@/assets/badges/monthly_master.png";
import imgUnstoppable from "@/assets/badges/unstoppable.png";
import imgSub6 from "@/assets/badges/sub_6.png";
import imgSub5 from "@/assets/badges/sub_5.png";
import imgSpeedster from "@/assets/badges/speedster.png";
import imgSprintKing from "@/assets/badges/sprint_king.png";
import imgHalfMarathon from "@/assets/badges/half_marathon_hero.png";
import imgMarathonLegend from "@/assets/badges/marathon_legend.png";
import imgUltraRunner from "@/assets/badges/ultra_runner.png";
import imgEnduranceBeast from "@/assets/badges/endurance_beast.png";
import imgFiftyKWeek from "@/assets/badges/fifty_k_week.png";
import imgHundredKWeek from "@/assets/badges/hundred_k_week.png";
import imgCenturyMonth from "@/assets/badges/century_month.png";
import imgVolumeKing from "@/assets/badges/volume_king.png";
import imgFrequencyKing from "@/assets/badges/frequency_king.png";
import imgHillClimber from "@/assets/badges/hill_climber.png";
import imgMountainGoat from "@/assets/badges/mountain_goat.png";
import imgEverest from "@/assets/badges/everest_challenge.png";
import imgSteepClimber from "@/assets/badges/steep_climber.png";
import imgEarlyBird from "@/assets/badges/early_bird.png";
import imgNightRunner from "@/assets/badges/night_runner.png";
import imgMidnightRunner from "@/assets/badges/midnight_runner.png";
import imgNewYear from "@/assets/badges/new_year_runner.png";
import imgChristmas from "@/assets/badges/christmas_runner.png";
import imgCollector from "@/assets/badges/badge_collector.png";
import imgHoarder from "@/assets/badges/badge_hoarder.png";
import imgCompletionist from "@/assets/badges/completionist.png";
import imgEarlyAdopter from "@/assets/badges/early_adopter.png";
import imgFoundingMember from "@/assets/badges/founding_member.png";
import imgSpeedDemon from "@/assets/badges/speed_demon.png";
import imgMarathonPace from "@/assets/badges/marathon_pace.png";
import imgNegativeSplit from "@/assets/badges/negative_split.png";
import imgThirtyK from "@/assets/badges/thirty_k_club.png";
import imgHundredK from "@/assets/badges/hundred_k_club.png";
import imgMayChallenge from "@/assets/badges/may_challenge.png";
import imgSummerChallenge from "@/assets/badges/summer_challenge.png";
import imgBackToSchool from "@/assets/badges/back_to_school.png";
import imgAppBirthday from "@/assets/badges/app_birthday.png";
import imgOneYearParty from "@/assets/badges/one_year_party.png";
import imgRainRunner from "@/assets/badges/rain_runner.png";
import imgHotWeather from "@/assets/badges/hot_weather.png";
import imgColdWeather from "@/assets/badges/cold_weather.png";

/** App launch / anniversary anchor date — used for App Birthday */
export const APP_LAUNCH_DATE = "2025-05-01";

export type BadgeCategory =
  | "distance"
  | "single_run"
  | "performance"
  | "streak"
  | "pace"
  | "volume"
  | "elevation"
  | "time"
  | "weather"
  | "holiday"
  | "seasonal"
  | "anniversary"
  | "meta"
  | "special";

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  image: string;
  en: { name: string; desc: string };
  zh: { name: string; desc: string };
  /** Target value for progress bar (in the metric's natural unit) */
  target: number;
  /** Short unit label shown after numbers */
  unit?: string;
}

export const BADGES: BadgeDef[] = [
  // ── Distance milestones (lifetime km) ──────────────────────────────
  { id: "first_steps", category: "distance", image: imgFirstSteps, target: 10, unit: "km",
    en: { name: "First Steps",      desc: "Run 10 km in total" },
    zh: { name: "起步",             desc: "累計跑量 10 公里" } },
  { id: "getting_started", category: "distance", image: imgGettingStarted, target: 50, unit: "km",
    en: { name: "Getting Started",  desc: "Run 50 km in total" },
    zh: { name: "漸入佳境",         desc: "累計跑量 50 公里" } },
  { id: "dedicated_runner", category: "distance", image: imgDedicatedRunner, target: 100, unit: "km",
    en: { name: "Dedicated Runner", desc: "Run 100 km in total" },
    zh: { name: "認真跑者",         desc: "累計跑量 100 公里" } },
  { id: "century_club", category: "distance", image: imgCenturyClub, target: 500, unit: "km",
    en: { name: "Century Club",     desc: "Run 500 km in total" },
    zh: { name: "百里俱樂部",       desc: "累計跑量 500 公里" } },
  { id: "marathon_veteran", category: "distance", image: imgMarathonVeteran, target: 1000, unit: "km",
    en: { name: "Marathon Veteran", desc: "Run 1,000 km in total" },
    zh: { name: "馬拉松老將",       desc: "累計跑量 1,000 公里" } },

  // ── Single-run distance challenges ────────────────────────────────
  { id: "endurance_beast", category: "single_run", image: imgEnduranceBeast, target: 1,
    en: { name: "Endurance Beast",  desc: "Run 20 km or more in a single run" },
    zh: { name: "耐力猛獸",         desc: "單次跑步 20 公里以上" } },
  { id: "half_marathon_hero", category: "single_run", image: imgHalfMarathon, target: 1,
    en: { name: "Half Marathon Hero", desc: "Complete a 21.1 km run" },
    zh: { name: "半馬英雄",         desc: "完成單次 21.1 公里" } },
  { id: "marathon_legend", category: "single_run", image: imgMarathonLegend, target: 1,
    en: { name: "Marathon Legend",  desc: "Complete a 42.2 km run" },
    zh: { name: "全馬傳奇",         desc: "完成單次 42.2 公里" } },
  { id: "ultra_runner", category: "single_run", image: imgUltraRunner, target: 1,
    en: { name: "Ultra Runner",     desc: "Complete a 50 km+ run" },
    zh: { name: "超馬跑者",         desc: "完成單次 50 公里以上" } },
  { id: "thirty_k_club", category: "single_run", image: imgThirtyK, target: 1,
    en: { name: "30K Club",         desc: "Complete a 30 km single run" },
    zh: { name: "30K 俱樂部",       desc: "完成單次 30 公里" } },
  { id: "hundred_k_club", category: "single_run", image: imgHundredK, target: 1,
    en: { name: "100K Ultra",       desc: "Complete a 100 km single run" },
    zh: { name: "百公里超馬",       desc: "完成單次 100 公里" } },

  // ── Performance (pace × distance, PRs) ────────────────────────────
  { id: "speed_demon", category: "performance", image: imgSpeedDemon, target: 1,
    en: { name: "Speed Demon",      desc: "Average sub 4:30/km on a run (≥1 km)" },
    zh: { name: "速度惡魔",         desc: "單次跑步均速破 4:30/km" } },
  { id: "marathon_pace", category: "performance", image: imgMarathonPace, target: 1,
    en: { name: "Marathon Pace",    desc: "Average sub 5:00/km on a run of 10 km+" },
    zh: { name: "馬拉松配速",       desc: "10 公里以上均速破 5:00/km" } },
  { id: "negative_split", category: "performance", image: imgNegativeSplit, target: 1,
    en: { name: "Negative Split",   desc: "Second half faster than first on a 10 km+ run" },
    zh: { name: "後段加速",         desc: "10 公里以上下半段比前半段更快" } },

  // ── Streaks (consecutive days) ────────────────────────────────────
  { id: "week_warrior", category: "streak", image: imgWeekWarrior, target: 7, unit: "days",
    en: { name: "Week Warrior",     desc: "Run 7 days in a row" },
    zh: { name: "週度戰士",         desc: "連續 7 天有跑步" } },
  { id: "monthly_master", category: "streak", image: imgMonthlyMaster, target: 30, unit: "days",
    en: { name: "Monthly Master",   desc: "Run 30 days in a row" },
    zh: { name: "月度大師",         desc: "連續 30 天有跑步" } },
  { id: "unstoppable", category: "streak", image: imgUnstoppable, target: 100, unit: "days",
    en: { name: "Unstoppable",      desc: "Run 100 days in a row" },
    zh: { name: "無人能擋",         desc: "連續 100 天有跑步" } },

  // ── Pace (binary unlocks) ─────────────────────────────────────────
  { id: "sub_6", category: "pace", image: imgSub6, target: 1,
    en: { name: "Sub-6:00/km",      desc: "Average sub 6:00/km on any run (≥1 km)" },
    zh: { name: "破 6 配速",        desc: "首次跑出 6:00/km 以內" } },
  { id: "sub_5", category: "pace", image: imgSub5, target: 1,
    en: { name: "Sub-5:00/km",      desc: "Average sub 5:00/km on any run (≥1 km)" },
    zh: { name: "破 5 配速",        desc: "首次跑出 5:00/km 以內" } },
  { id: "speedster", category: "pace", image: imgSpeedster, target: 1,
    en: { name: "Speedster",        desc: "Average sub 4:00/km on any run (≥1 km)" },
    zh: { name: "速度狂人",         desc: "首次跑出 4:00/km 以內" } },
  { id: "sprint_king", category: "pace", image: imgSprintKing, target: 1,
    en: { name: "Sprint King",      desc: "Average sub 3:30/km on any run (≥1 km)" },
    zh: { name: "衝刺之王",         desc: "首次跑出 3:30/km 以內" } },

  // ── Volume windows (rolling weekly / calendar month) ──────────────
  { id: "fifty_k_week", category: "volume", image: imgFiftyKWeek, target: 50, unit: "km",
    en: { name: "50K Week",         desc: "Run 50 km in any 7-day window" },
    zh: { name: "50K 週",           desc: "任一連續 7 天累積 50 公里" } },
  { id: "hundred_k_week", category: "volume", image: imgHundredKWeek, target: 100, unit: "km",
    en: { name: "100K Week",        desc: "Run 100 km in any 7-day window" },
    zh: { name: "100K 週",          desc: "任一連續 7 天累積 100 公里" } },
  { id: "century_month", category: "volume", image: imgCenturyMonth, target: 100, unit: "km",
    en: { name: "Century Month",    desc: "Run 100 km in a single calendar month" },
    zh: { name: "百里月",           desc: "單月累積 100 公里" } },
  { id: "volume_king", category: "volume", image: imgVolumeKing, target: 200, unit: "km",
    en: { name: "Volume King",      desc: "Run 200 km in a single calendar month" },
    zh: { name: "里程之王",         desc: "單月累積 200 公里" } },
  { id: "frequency_king", category: "volume", image: imgFrequencyKing, target: 25, unit: "runs",
    en: { name: "Frequency King",   desc: "25+ runs in a single calendar month" },
    zh: { name: "頻率之王",         desc: "單月跑步 25 次以上" } },

  // ── Elevation ─────────────────────────────────────────────────────
  { id: "hill_climber", category: "elevation", image: imgHillClimber, target: 100, unit: "m",
    en: { name: "Hill Climber",     desc: "Climb 100 m total elevation" },
    zh: { name: "登坡者",           desc: "累計爬升 100 公尺" } },
  { id: "mountain_goat", category: "elevation", image: imgMountainGoat, target: 1000, unit: "m",
    en: { name: "Mountain Goat",    desc: "Climb 1,000 m total elevation" },
    zh: { name: "山羊腳力",         desc: "累計爬升 1,000 公尺" } },
  { id: "everest_challenge", category: "elevation", image: imgEverest, target: 8848, unit: "m",
    en: { name: "Everest Challenge", desc: "Climb 8,848 m total — Everest height" },
    zh: { name: "聖母峰挑戰",       desc: "累計爬升 8,848 公尺（聖母峰高度）" } },
  { id: "steep_climber", category: "elevation", image: imgSteepClimber, target: 1,
    en: { name: "Steep Climber",    desc: "Single run with 500 m+ elevation gain" },
    zh: { name: "陡坡王者",         desc: "單次爬升超過 500 公尺" } },

  // ── Time of day ───────────────────────────────────────────────────
  { id: "early_bird", category: "time", image: imgEarlyBird, target: 10, unit: "runs",
    en: { name: "Early Bird",       desc: "10 runs started before 6:00 AM" },
    zh: { name: "早鳥俱樂部",       desc: "10 次清晨 6 點前出發" } },
  { id: "night_runner", category: "time", image: imgNightRunner, target: 10, unit: "runs",
    en: { name: "Night Runner",     desc: "10 runs started after 9:00 PM" },
    zh: { name: "夜跑俠",           desc: "10 次晚上 9 點後出發" } },
  { id: "midnight_runner", category: "time", image: imgMidnightRunner, target: 1,
    en: { name: "Midnight Runner",  desc: "Ran at midnight (between 23:30–00:30)" },
    zh: { name: "午夜跑者",         desc: "午夜時段（23:30–00:30）跑步" } },

  // ── Holidays ──────────────────────────────────────────────────────
  { id: "new_year_runner", category: "holiday", image: imgNewYear, target: 1,
    en: { name: "New Year Runner",  desc: "Run on January 1st" },
    zh: { name: "元旦跑者",         desc: "於 1 月 1 日跑步" } },
  { id: "christmas_runner", category: "holiday", image: imgChristmas, target: 1,
    en: { name: "Santa's Helper",   desc: "Run on December 25th" },
    zh: { name: "聖誕小幫手",       desc: "於 12 月 25 日跑步" } },

  // ── Weather ───────────────────────────────────────────────────────
  { id: "rain_runner", category: "weather", image: imgRainRunner, target: 5, unit: "runs",
    en: { name: "Rain Runner",      desc: "Complete 5 runs in the rain" },
    zh: { name: "雨中跑者",         desc: "完成 5 次雨中跑步" } },
  { id: "hot_weather", category: "weather", image: imgHotWeather, target: 3, unit: "runs",
    en: { name: "Hot Weather Warrior", desc: "Complete 3 runs at 30°C or hotter" },
    zh: { name: "高溫戰士",         desc: "完成 3 次 30°C 以上跑步" } },
  { id: "cold_weather", category: "weather", image: imgColdWeather, target: 3, unit: "runs",
    en: { name: "Cold Weather Warrior", desc: "Complete 3 runs at 5°C or colder" },
    zh: { name: "低溫戰士",         desc: "完成 3 次 5°C 以下跑步" } },

  // ── Seasonal monthly challenges ───────────────────────────────────
  { id: "may_challenge", category: "seasonal", image: imgMayChallenge, target: 100, unit: "km",
    en: { name: "May Challenge",    desc: "Run 100 km during the month of May" },
    zh: { name: "五月挑戰",         desc: "於 5 月累積 100 公里" } },
  { id: "summer_challenge", category: "seasonal", image: imgSummerChallenge, target: 300, unit: "km",
    en: { name: "Summer Challenge", desc: "Run 300 km across June–August" },
    zh: { name: "夏季挑戰",         desc: "6–8 月累積 300 公里" } },
  { id: "back_to_school", category: "seasonal", image: imgBackToSchool, target: 50, unit: "km",
    en: { name: "Back to School",   desc: "Run 50 km during September" },
    zh: { name: "開學季",           desc: "於 9 月累積 50 公里" } },

  // ── Anniversary ───────────────────────────────────────────────────
  { id: "app_birthday", category: "anniversary", image: imgAppBirthday, target: 1,
    en: { name: "App Birthday",     desc: "Run on the app's anniversary date (May 1)" },
    zh: { name: "App 生日",         desc: "於 App 週年日跑步（5 月 1 日）" } },
  { id: "one_year_party", category: "anniversary", image: imgOneYearParty, target: 1,
    en: { name: "One Year Party",   desc: "Active member for 365+ days" },
    zh: { name: "一週年派對",       desc: "成為會員滿 365 天" } },

  // ── Meta (badge counts — must stay last in array) ─────────────────
  { id: "badge_collector", category: "meta", image: imgCollector, target: 10, unit: "badges",
    en: { name: "Collector",        desc: "Unlock 10 badges" },
    zh: { name: "收藏家",           desc: "解鎖 10 個徽章" } },
  { id: "badge_hoarder", category: "meta", image: imgHoarder, target: 25, unit: "badges",
    en: { name: "Hoarder",          desc: "Unlock 25 badges" },
    zh: { name: "藏寶者",           desc: "解鎖 25 個徽章" } },
  { id: "completionist", category: "meta", image: imgCompletionist, target: 45, unit: "badges",
    en: { name: "Completionist",    desc: "Unlock every badge" },
    zh: { name: "全收集",           desc: "解鎖所有徽章" } },

  // ── Special / exclusive ───────────────────────────────────────────
  { id: "early_adopter", category: "special", image: imgEarlyAdopter, target: 1,
    en: { name: "Early Adopter",    desc: "Subscribed before our first 100 members" },
    zh: { name: "早期支持者",       desc: "前 100 位訂閱會員" } },
  { id: "founding_member", category: "special", image: imgFoundingMember, target: 1,
    en: { name: "Founding Member",  desc: "Subscribed before June 2025" },
    zh: { name: "創始會員",         desc: "於 2025 年 6 月前訂閱" } },
];

export interface BadgeProgress {
  id: string;
  unlocked: boolean;
  value: number;
  target: number;
}

export interface BadgeContext {
  activities: StravaActivity[];
  isEarlyAdopter?: boolean;
  premiumActivatedAt?: string | null;
}

// ─── helpers ────────────────────────────────────────────────────────
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

function computeStreak(activities: StravaActivity[]): number {
  if (!activities.length) return 0;
  const days = new Set<string>();
  for (const a of activities) days.add(dayKey(new Date(a.start_date)));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function bestPaceSecPerKm(activities: StravaActivity[]): number {
  let best = Infinity;
  for (const a of activities) {
    if (!a.average_speed || a.average_speed <= 0) continue;
    if ((a.distance || 0) < 1000) continue;
    const sec = 1000 / a.average_speed;
    if (sec < best) best = sec;
  }
  return best;
}

/** Best single-run distance in meters */
function maxRunDistance(activities: StravaActivity[]): number {
  let max = 0;
  for (const a of activities) if ((a.distance || 0) > max) max = a.distance;
  return max;
}

/** Best single-run elevation gain in meters */
function maxRunElevation(activities: StravaActivity[]): number {
  let max = 0;
  for (const a of activities) if ((a.total_elevation_gain || 0) > max) max = a.total_elevation_gain;
  return max;
}

/** Best rolling N-day total distance in km */
function bestRollingDistanceKm(activities: StravaActivity[], windowDays: number): number {
  if (!activities.length) return 0;
  // bucket distance per day
  const byDay = new Map<number, number>();
  for (const a of activities) {
    const d = new Date(a.start_date);
    const k = Math.floor(d.getTime() / 86_400_000);
    byDay.set(k, (byDay.get(k) || 0) + (a.distance || 0));
  }
  const keys = [...byDay.keys()].sort((a, b) => a - b);
  let best = 0;
  for (let i = 0; i < keys.length; i++) {
    let sum = 0;
    const start = keys[i];
    for (let j = i; j < keys.length && keys[j] < start + windowDays; j++) sum += byDay.get(keys[j])!;
    if (sum > best) best = sum;
  }
  return best / 1000;
}

/** Best calendar-month total distance (km) and run count */
function bestCalendarMonth(activities: StravaActivity[]): { km: number; runs: number } {
  const distByMonth = new Map<string, number>();
  const countByMonth = new Map<string, number>();
  for (const a of activities) {
    const k = monthKey(new Date(a.start_date));
    distByMonth.set(k, (distByMonth.get(k) || 0) + (a.distance || 0));
    countByMonth.set(k, (countByMonth.get(k) || 0) + 1);
  }
  let km = 0, runs = 0;
  for (const v of distByMonth.values()) if (v / 1000 > km) km = v / 1000;
  for (const v of countByMonth.values()) if (v > runs) runs = v;
  return { km, runs };
}

function countByHour(activities: StravaActivity[], pred: (h: number, m: number) => boolean): number {
  let n = 0;
  for (const a of activities) {
    const d = new Date(a.start_date);
    if (pred(d.getHours(), d.getMinutes())) n++;
  }
  return n;
}

function anyOnMonthDay(activities: StravaActivity[], month: number, day: number): boolean {
  for (const a of activities) {
    const d = new Date(a.start_date);
    if (d.getMonth() === month && d.getDate() === day) return true;
  }
  return false;
}

// Helpers for new categories
function bestPaceSecPerKmOver(activities: StravaActivity[], minMeters: number): number {
  let best = Infinity;
  for (const a of activities) {
    if (!a.average_speed || a.average_speed <= 0) continue;
    if ((a.distance || 0) < minMeters) continue;
    const sec = 1000 / a.average_speed;
    if (sec < best) best = sec;
  }
  return best;
}

function hasNegativeSplit(activities: StravaActivity[]): boolean {
  for (const a of activities) {
    if ((a.distance || 0) < 10000 || !a.distance_samples || a.distance_samples.length < 4) continue;
    const samples = a.distance_samples;
    const last = samples[samples.length - 1];
    const halfDist = last.d / 2;
    // find sample closest to halfDist
    let midIdx = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].d >= halfDist) { midIdx = i; break; }
    }
    const mid = samples[midIdx];
    if (!mid || mid.t <= 0 || last.t <= mid.t) continue;
    const firstHalfPace = mid.t / (mid.d / 1000);     // sec/km
    const secondHalfPace = (last.t - mid.t) / ((last.d - mid.d) / 1000);
    if (secondHalfPace < firstHalfPace) return true;
  }
  return false;
}

function countWeather(activities: StravaActivity[], pred: (w: NonNullable<StravaActivity["weather"]>) => boolean): number {
  let n = 0;
  for (const a of activities) if (a.weather && pred(a.weather)) n++;
  return n;
}

function kmInMonthRange(activities: StravaActivity[], months: number[]): number {
  let km = 0;
  for (const a of activities) {
    const d = new Date(a.start_date);
    if (months.includes(d.getMonth())) km += (a.distance || 0);
  }
  return km / 1000;
}

// ─── main compute ───────────────────────────────────────────────────
export function computeBadgeProgress(ctx: BadgeContext): Record<string, BadgeProgress> {
  const totalKm = ctx.activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
  const totalElev = ctx.activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const streak = computeStreak(ctx.activities);
  const bestSec = bestPaceSecPerKm(ctx.activities);
  const bestSec10k = bestPaceSecPerKmOver(ctx.activities, 10000);
  const longestRunM = maxRunDistance(ctx.activities);
  const steepestM = maxRunElevation(ctx.activities);
  const best7 = bestRollingDistanceKm(ctx.activities, 7);
  const month = bestCalendarMonth(ctx.activities);
  const earlyBirdRuns = countByHour(ctx.activities, (h) => h < 6);
  const nightRuns = countByHour(ctx.activities, (h) => h >= 21);
  const midnight = countByHour(ctx.activities, (h, m) => (h === 23 && m >= 30) || h === 0 && m <= 30) > 0 ? 1 : 0;
  const newYear = anyOnMonthDay(ctx.activities, 0, 1) ? 1 : 0;
  const christmas = anyOnMonthDay(ctx.activities, 11, 25) ? 1 : 0;
  const appBirthday = anyOnMonthDay(ctx.activities, 4, 1) ? 1 : 0; // May 1
  const negSplit = hasNegativeSplit(ctx.activities) ? 1 : 0;

  // Weather counts
  const rainRuns = countWeather(ctx.activities, (w) => {
    const s = `${w.weather_type ?? ""} ${w.condition ?? ""}`.toLowerCase();
    return /rain|shower|drizzle|storm/.test(s);
  });
  const hotRuns = countWeather(ctx.activities, (w) => (w.temp ?? -Infinity) >= 30);
  const coldRuns = countWeather(ctx.activities, (w) => (w.temp ?? Infinity) <= 5);

  // Seasonal (any year)
  const mayKm = kmInMonthRange(ctx.activities, [4]);
  const summerKm = kmInMonthRange(ctx.activities, [5, 6, 7]);
  const septKm = kmInMonthRange(ctx.activities, [8]);

  // Anniversary: 365+ days as premium member
  const oneYear = ctx.premiumActivatedAt &&
    (Date.now() - new Date(ctx.premiumActivatedAt).getTime()) >= 365 * 86_400_000
    ? 1 : 0;

  const out: Record<string, BadgeProgress> = {};
  for (const b of BADGES) {
    let value = 0;
    switch (b.id) {
      // distance milestones
      case "first_steps":
      case "getting_started":
      case "dedicated_runner":
      case "century_club":
      case "marathon_veteran":
        value = totalKm; break;
      // single run
      case "endurance_beast":      value = longestRunM >= 20000 ? 1 : 0; break;
      case "half_marathon_hero":   value = longestRunM >= 21100 ? 1 : 0; break;
      case "marathon_legend":      value = longestRunM >= 42200 ? 1 : 0; break;
      case "ultra_runner":         value = longestRunM >= 50000 ? 1 : 0; break;
      case "thirty_k_club":        value = longestRunM >= 30000 ? 1 : 0; break;
      case "hundred_k_club":       value = longestRunM >= 100000 ? 1 : 0; break;
      // performance
      case "speed_demon":          value = bestSec <= 270 ? 1 : 0; break;
      case "marathon_pace":        value = bestSec10k <= 300 ? 1 : 0; break;
      case "negative_split":       value = negSplit; break;
      // streaks
      case "week_warrior":
      case "monthly_master":
      case "unstoppable":          value = streak; break;
      // pace
      case "sub_6":      value = bestSec <= 360 ? 1 : 0; break;
      case "sub_5":      value = bestSec <= 300 ? 1 : 0; break;
      case "speedster":  value = bestSec <= 240 ? 1 : 0; break;
      case "sprint_king":value = bestSec <= 210 ? 1 : 0; break;
      // volume
      case "fifty_k_week":    value = best7; break;
      case "hundred_k_week":  value = best7; break;
      case "century_month":   value = month.km; break;
      case "volume_king":     value = month.km; break;
      case "frequency_king":  value = month.runs; break;
      // elevation
      case "hill_climber":
      case "mountain_goat":
      case "everest_challenge":  value = totalElev; break;
      case "steep_climber":      value = steepestM >= 500 ? 1 : 0; break;
      // time
      case "early_bird":         value = earlyBirdRuns; break;
      case "night_runner":       value = nightRuns; break;
      case "midnight_runner":    value = midnight; break;
      // weather
      case "rain_runner":        value = rainRuns; break;
      case "hot_weather":        value = hotRuns; break;
      case "cold_weather":       value = coldRuns; break;
      // seasonal
      case "may_challenge":      value = mayKm; break;
      case "summer_challenge":   value = summerKm; break;
      case "back_to_school":     value = septKm; break;
      // anniversary
      case "app_birthday":       value = appBirthday; break;
      case "one_year_party":     value = oneYear; break;
      // holiday
      case "new_year_runner":    value = newYear; break;
      case "christmas_runner":   value = christmas; break;
      // special
      case "early_adopter":      value = ctx.isEarlyAdopter ? 1 : 0; break;
      case "founding_member":
        value = ctx.premiumActivatedAt && new Date(ctx.premiumActivatedAt) < new Date("2025-06-01") ? 1 : 0;
        break;
      // meta — handled in second pass
      case "badge_collector":
      case "badge_hoarder":
      case "completionist":
        value = 0; break;
    }
    out[b.id] = {
      id: b.id,
      value: Math.min(value, b.target),
      target: b.target,
      unlocked: value >= b.target,
    };
  }

  // Second pass: meta badges count other unlocked badges
  const unlockedNonMeta = Object.entries(out).filter(([id, p]) => {
    const def = BADGES.find((b) => b.id === id);
    return def && def.category !== "meta" && p.unlocked;
  }).length;
  for (const id of ["badge_collector", "badge_hoarder", "completionist"] as const) {
    const def = BADGES.find((b) => b.id === id)!;
    out[id] = {
      id,
      value: Math.min(unlockedNonMeta, def.target),
      target: def.target,
      unlocked: unlockedNonMeta >= def.target,
    };
  }

  return out;
}
