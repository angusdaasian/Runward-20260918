export const CITY_BADGE_TIERS = [1, 5, 10, 25, 50, 100] as const;

export interface CityBadge {
  tier: number;
  icon: string;
  label: string;
  labelZh: string;
}

const BADGES: Record<number, Omit<CityBadge, "tier">> = {
  1: { icon: "🥉", label: "Bronze", labelZh: "銅章" },
  5: { icon: "🥈", label: "Silver", labelZh: "銀章" },
  10: { icon: "🏅", label: "Gold", labelZh: "金章" },
  25: { icon: "🏆", label: "Platinum", labelZh: "白金" },
  50: { icon: "💎", label: "Diamond", labelZh: "鑽石" },
  100: { icon: "👑", label: "Conqueror", labelZh: "征服者" },
};

export function getCityBadge(percent: number): CityBadge | null {
  let earned: number | null = null;
  for (const t of CITY_BADGE_TIERS) {
    if (percent >= t) earned = t;
  }
  if (earned == null) return null;
  return { tier: earned, ...BADGES[earned] };
}

export function nextCityBadge(percent: number): number | null {
  for (const t of CITY_BADGE_TIERS) {
    if (percent < t) return t;
  }
  return null;
}
