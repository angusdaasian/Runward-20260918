export const RANK_TIERS = ["Bronze", "Silver", "Gold", "Diamond"] as const;
export const DIVISIONS = ["V", "IV", "III", "II", "I"] as const;
export const XP_PER_DIVISION = 2000;

export type RankTier = (typeof RANK_TIERS)[number];
export type Division = (typeof DIVISIONS)[number];

export interface RankInfo {
  tier: RankTier;
  division: Division;
  totalXpForRank: number;
  xpInCurrentDivision: number;
  xpToNextDivision: number;
}

const TIER_COLORS: Record<RankTier, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Diamond: "#B9F2FF",
};

const TIER_BG: Record<RankTier, string> = {
  Bronze: "rgba(205,127,50,0.15)",
  Silver: "rgba(192,192,192,0.15)",
  Gold: "rgba(255,215,0,0.15)",
  Diamond: "rgba(185,242,255,0.15)",
};

export function getTierColor(tier: RankTier) {
  return TIER_COLORS[tier] || TIER_COLORS.Bronze;
}

export function getTierBg(tier: RankTier) {
  return TIER_BG[tier] || TIER_BG.Bronze;
}

export function getRankFromXP(monthlyXp: number): RankInfo {
  const divisionIndex = Math.min(
    Math.floor(monthlyXp / XP_PER_DIVISION),
    RANK_TIERS.length * DIVISIONS.length - 1
  );
  const tierIndex = Math.min(Math.floor(divisionIndex / DIVISIONS.length), RANK_TIERS.length - 1);
  const divIndex = divisionIndex % DIVISIONS.length;

  return {
    tier: RANK_TIERS[tierIndex],
    division: DIVISIONS[divIndex],
    totalXpForRank: divisionIndex * XP_PER_DIVISION,
    xpInCurrentDivision: monthlyXp - divisionIndex * XP_PER_DIVISION,
    xpToNextDivision: XP_PER_DIVISION,
  };
}

export function formatRank(tier: string, division: string) {
  return `${tier} ${division}`;
}

export function getSeasonEndDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export function getSeasonCountdown(): { days: number; hours: number; minutes: number } {
  const end = getSeasonEndDate();
  const now = new Date();
  const diff = Math.max(0, end.getTime() - now.getTime());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
  };
}
