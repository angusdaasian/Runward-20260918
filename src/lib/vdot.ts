// Daniel's Running Formula calculations
// Running Score = VDOT equivalent

function percentVO2(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes);
}

function vo2Cost(velocity: number): number {
  return -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
}

export function calculateRunningScore(distanceMeters: number, timeSeconds: number): number {
  const minutes = timeSeconds / 60;
  const velocity = distanceMeters / minutes;
  const vo2 = vo2Cost(velocity);
  const pct = percentVO2(minutes);
  return vo2 / pct;
}

export function predictTime(runningScore: number, distanceMeters: number): number {
  let lo = distanceMeters / 600;
  let hi = distanceMeters / 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const score = calculateRunningScore(distanceMeters, mid * 60);
    if (score < runningScore) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2 * 60;
}

function vo2ToVelocity(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - vo2;
  const discriminant = b * b - 4 * a * c;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

// Training pace definitions with %VO2max
interface TrainingPaceDef {
  name: string;
  nameZh: string;
  minPct: number;
  maxPct: number;
}

const mainPaces: TrainingPaceDef[] = [
  { name: "Easy", nameZh: "輕鬆跑", minPct: 0.59, maxPct: 0.74 },
  { name: "Marathon", nameZh: "馬拉松配速", minPct: 0.75, maxPct: 0.84 },
  { name: "Threshold", nameZh: "乳酸閾值", minPct: 0.83, maxPct: 0.88 },
  { name: "Interval", nameZh: "間歇訓練", minPct: 0.95, maxPct: 1.0 },
  { name: "Repetition", nameZh: "重複訓練", minPct: 1.05, maxPct: 1.1 },
];

export interface MainPaceResult {
  name: string;
  nameZh: string;
  milePace: string;
  kmPace: string;
  lapPace: string;
  hasRange: boolean;
}

export function getMainPaces(runningScore: number): MainPaceResult[] {
  return mainPaces.map((tp) => {
    const velMin = vo2ToVelocity(runningScore * tp.minPct);
    const velMax = vo2ToVelocity(runningScore * tp.maxPct);

    const mileTimeFast = 1609.34 / velMax * 60;
    const mileTimeSlow = 1609.34 / velMin * 60;
    const kmTimeFast = 1000 / velMax * 60;
    const kmTimeSlow = 1000 / velMin * 60;
    const lapTimeFast = 400 / velMax * 60;
    const lapTimeSlow = 400 / velMin * 60;

    const isRange = tp.name === "Easy";

    return {
      name: tp.name,
      nameZh: tp.nameZh,
      milePace: isRange
        ? `${formatTimeSec(mileTimeFast)} ~ ${formatTimeSec(mileTimeSlow)}`
        : formatTimeSec((mileTimeFast + mileTimeSlow) / 2),
      kmPace: isRange
        ? `${formatTimeSec(kmTimeFast)} ~ ${formatTimeSec(kmTimeSlow)}`
        : formatTimeSec((kmTimeFast + kmTimeSlow) / 2),
      lapPace: isRange
        ? `${formatTimeSec(lapTimeFast)} ~ ${formatTimeSec(lapTimeSlow)}`
        : formatTimeSec((lapTimeFast + lapTimeSlow) / 2),
      hasRange: isRange,
    };
  });
}

// Interval paces for specific distances
interface IntervalPaceDef {
  name: string;
  nameZh: string;
  pct: number;
}

const midDistPaces: IntervalPaceDef[] = [
  { name: "Threshold", nameZh: "乳酸閾值", pct: 0.855 },
  { name: "Interval", nameZh: "間歇訓練", pct: 0.975 },
  { name: "Repetition", nameZh: "重複訓練", pct: 1.075 },
];

const shortDistPaces: IntervalPaceDef[] = [
  { name: "Interval", nameZh: "間歇訓練", pct: 0.975 },
  { name: "Repetition", nameZh: "重複訓練", pct: 1.075 },
  { name: "Fast Reps", nameZh: "快速重複", pct: 1.15 },
];

export interface DistancePaceResult {
  name: string;
  nameZh: string;
  times: string[]; // time for each distance column
}

export function getMidDistancePaces(runningScore: number): DistancePaceResult[] {
  const distances = [1200, 800, 600];
  return midDistPaces.map((p) => {
    const vel = vo2ToVelocity(runningScore * p.pct);
    return {
      name: p.name,
      nameZh: p.nameZh,
      times: distances.map((d) => formatTimeSec(d / vel * 60)),
    };
  });
}

export function getShortDistancePaces(runningScore: number): DistancePaceResult[] {
  const distances = [400, 300, 200];
  return shortDistPaces.map((p) => {
    const vel = vo2ToVelocity(runningScore * p.pct);
    return {
      name: p.name,
      nameZh: p.nameZh,
      times: distances.map((d) => formatTimeSec(d / vel * 60)),
    };
  });
}

function formatTimeSec(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  if (m === 0) return `${s}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatPace(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const raceDistances = [
  { name: "Marathon", nameZh: "馬拉松", meters: 42195 },
  { name: "Half Marathon", nameZh: "半馬拉松", meters: 21097.5 },
  { name: "10Mi", nameZh: "10英里", meters: 16093.4 },
  { name: "15K", nameZh: "15公里", meters: 15000 },
  { name: "10K", nameZh: "10公里", meters: 10000 },
  { name: "8K", nameZh: "8公里", meters: 8000 },
  { name: "6K", nameZh: "6公里", meters: 6000 },
  { name: "5K", nameZh: "5公里", meters: 5000 },
  { name: "2Mi", nameZh: "2英里", meters: 3218.69 },
  { name: "3200m", nameZh: "3200米", meters: 3200 },
  { name: "3K", nameZh: "3公里", meters: 3000 },
  { name: "1Mi", nameZh: "1英里", meters: 1609.34 },
  { name: "1600m", nameZh: "1600米", meters: 1600 },
  { name: "1500m", nameZh: "1500米", meters: 1500 },
];

export const roadRaceDistances = [
  { name: "Marathon", nameZh: "馬拉松", meters: 42195 },
  { name: "Half Marathon", nameZh: "半馬拉松", meters: 21097.5 },
  { name: "10Mi", nameZh: "10英里", meters: 16093.4 },
  { name: "15K", nameZh: "15公里", meters: 15000 },
  { name: "10K", nameZh: "10公里", meters: 10000 },
  { name: "8K", nameZh: "8公里", meters: 8000 },
  { name: "6K", nameZh: "6公里", meters: 6000 },
  { name: "5K", nameZh: "5公里", meters: 5000 },
];

export const trackRaceDistances = [
  { name: "10000m", nameZh: "10000米", meters: 10000 },
  { name: "5000m", nameZh: "5000米", meters: 5000 },
  { name: "3200m", nameZh: "3200米", meters: 3200 },
  { name: "3000m", nameZh: "3000米", meters: 3000 },
  { name: "1Mi", nameZh: "1英里", meters: 1609.34 },
  { name: "1600m", nameZh: "1600米", meters: 1600 },
  { name: "1500m", nameZh: "1500米", meters: 1500 },
  { name: "800m", nameZh: "800米", meters: 800 },
  { name: "400m", nameZh: "400米", meters: 400 },
];

export const inputDistances = [
  { label: "Marathon", labelZh: "馬拉松", meters: 42195 },
  { label: "Half Marathon", labelZh: "半馬拉松", meters: 21097.5 },
  { label: "15K", labelZh: "15公里", meters: 15000 },
  { label: "10K", labelZh: "10公里", meters: 10000 },
  { label: "5K", labelZh: "5公里", meters: 5000 },
  { label: "3K", labelZh: "3公里", meters: 3000 },
  { label: "1500m", labelZh: "1500米", meters: 1500 },
  { label: "1 Mile", labelZh: "1英里", meters: 1609.34 },
];
