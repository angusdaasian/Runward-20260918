import type { StravaActivity } from "@/hooks/use-activities";

export type BadgeCategory = "distance" | "streak" | "pace" | "elevation" | "special";

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  emoji: string;
  en: { name: string; desc: string };
  zh: { name: string; desc: string };
  /** Target value for progress bar (in the metric's natural unit) */
  target: number;
  /** Short unit label shown after numbers */
  unit?: string;
}

export const BADGES: BadgeDef[] = [
  // Distance (km)
  { id: "first_steps",        category: "distance", emoji: "🏃",   target: 10,    unit: "km",
    en: { name: "First Steps",       desc: "Run 10 km in total" },
    zh: { name: "起步",             desc: "累計跑量 10 公里" } },
  { id: "getting_started",    category: "distance", emoji: "🏃‍♂️", target: 50,    unit: "km",
    en: { name: "Getting Started",   desc: "Run 50 km in total" },
    zh: { name: "漸入佳境",         desc: "累計跑量 50 公里" } },
  { id: "dedicated_runner",   category: "distance", emoji: "🏃",   target: 100,   unit: "km",
    en: { name: "Dedicated Runner",  desc: "Run 100 km in total" },
    zh: { name: "認真跑者",         desc: "累計跑量 100 公里" } },
  { id: "century_club",       category: "distance", emoji: "🏃‍♂️", target: 500,   unit: "km",
    en: { name: "Century Club",      desc: "Run 500 km in total" },
    zh: { name: "百里俱樂部",       desc: "累計跑量 500 公里" } },
  { id: "marathon_veteran",   category: "distance", emoji: "🏃",   target: 1000,  unit: "km",
    en: { name: "Marathon Veteran",  desc: "Run 1,000 km in total" },
    zh: { name: "馬拉松老將",       desc: "累計跑量 1,000 公里" } },
  // Streak (days)
  { id: "week_warrior",       category: "streak", emoji: "🔥", target: 7,   unit: "days",
    en: { name: "Week Warrior",      desc: "Run 7 days in a row" },
    zh: { name: "週度戰士",         desc: "連續 7 天有跑步" } },
  { id: "monthly_master",     category: "streak", emoji: "🔥", target: 30,  unit: "days",
    en: { name: "Monthly Master",    desc: "Run 30 days in a row" },
    zh: { name: "月度大師",         desc: "連續 30 天有跑步" } },
  { id: "unstoppable",        category: "streak", emoji: "🔥", target: 100, unit: "days",
    en: { name: "Unstoppable",       desc: "Run 100 days in a row" },
    zh: { name: "無人能擋",         desc: "連續 100 天有跑步" } },
  // Pace (sec/km — lower is better; "progress" is binary)
  { id: "sub_6",              category: "pace", emoji: "⚡", target: 1,
    en: { name: "Sub-6:00/km",       desc: "Run any km at sub 6:00 pace" },
    zh: { name: "破 6 配速",        desc: "首次跑出 6:00/km 以內" } },
  { id: "sub_5",              category: "pace", emoji: "⚡", target: 1,
    en: { name: "Sub-5:00/km",       desc: "Run any km at sub 5:00 pace" },
    zh: { name: "破 5 配速",        desc: "首次跑出 5:00/km 以內" } },
  { id: "speedster",          category: "pace", emoji: "⚡", target: 1,
    en: { name: "Speedster",         desc: "Run any km at sub 4:00 pace" },
    zh: { name: "速度狂人",         desc: "首次跑出 4:00/km 以內" } },
  // Elevation (m)
  { id: "hill_climber",       category: "elevation", emoji: "⛰️", target: 100,  unit: "m",
    en: { name: "Hill Climber",      desc: "Climb 100 m total elevation" },
    zh: { name: "登坡者",           desc: "累計爬升 100 公尺" } },
  { id: "mountain_goat",      category: "elevation", emoji: "⛰️", target: 1000, unit: "m",
    en: { name: "Mountain Goat",     desc: "Climb 1,000 m total elevation" },
    zh: { name: "山羊腳力",         desc: "累計爬升 1,000 公尺" } },
  { id: "everest_challenge",  category: "elevation", emoji: "⛰️", target: 8848, unit: "m",
    en: { name: "Everest Challenge", desc: "Climb 8,848 m total — Everest height" },
    zh: { name: "聖母峰挑戰",       desc: "累計爬升 8,848 公尺（聖母峰高度）" } },
  // Special
  { id: "early_adopter",      category: "special", emoji: "⭐", target: 1,
    en: { name: "Early Adopter",     desc: "Subscribed before our first 100 members" },
    zh: { name: "早期支持者",       desc: "前 100 位訂閱會員" } },
  { id: "founding_member",    category: "special", emoji: "⭐", target: 1,
    en: { name: "Founding Member",   desc: "Subscribed before June 2025" },
    zh: { name: "創始會員",         desc: "於 2025 年 6 月前訂閱" } },
];

export interface BadgeProgress {
  id: string;
  unlocked: boolean;
  /** 0..target */
  value: number;
  target: number;
}

export interface BadgeContext {
  activities: StravaActivity[];
  isEarlyAdopter?: boolean;     // ranked < 100 of premium subs
  premiumActivatedAt?: string | null;
}

/** Longest run-day streak ending today (consecutive calendar days with ≥1 activity) */
function computeStreak(activities: StravaActivity[]): number {
  if (!activities.length) return 0;
  const days = new Set<string>();
  for (const a of activities) {
    const d = new Date(a.start_date);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date();
  // Allow today OR yesterday as start (in case they haven't run yet today)
  const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Best (lowest) per-km pace in sec/km from average_speed across all activities */
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

export function computeBadgeProgress(ctx: BadgeContext): Record<string, BadgeProgress> {
  const totalKm = ctx.activities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
  const totalElev = ctx.activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const streak = computeStreak(ctx.activities);
  const bestSec = bestPaceSecPerKm(ctx.activities);

  const out: Record<string, BadgeProgress> = {};
  for (const b of BADGES) {
    let value = 0;
    switch (b.id) {
      case "first_steps":
      case "getting_started":
      case "dedicated_runner":
      case "century_club":
      case "marathon_veteran":
        value = totalKm; break;
      case "week_warrior":
      case "monthly_master":
      case "unstoppable":
        value = streak; break;
      case "sub_6": value = bestSec <= 360 ? 1 : 0; break;
      case "sub_5": value = bestSec <= 300 ? 1 : 0; break;
      case "speedster": value = bestSec <= 240 ? 1 : 0; break;
      case "hill_climber":
      case "mountain_goat":
      case "everest_challenge":
        value = totalElev; break;
      case "early_adopter":
        value = ctx.isEarlyAdopter ? 1 : 0; break;
      case "founding_member":
        value = ctx.premiumActivatedAt && new Date(ctx.premiumActivatedAt) < new Date("2025-06-01") ? 1 : 0; break;
    }
    out[b.id] = {
      id: b.id,
      value: Math.min(value, b.target),
      target: b.target,
      unlocked: value >= b.target,
    };
  }
  return out;
}
