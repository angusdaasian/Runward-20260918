import bronzeEmblem from "@/assets/ranks/bronze.png";
import silverEmblem from "@/assets/ranks/silver.png";
import goldEmblem from "@/assets/ranks/gold.png";
import diamondEmblem from "@/assets/ranks/diamond.png";
import type { RankTier } from "@/lib/ranks";

export const RANK_EMBLEMS: Record<RankTier, string> = {
  Bronze: bronzeEmblem,
  Silver: silverEmblem,
  Gold: goldEmblem,
  Diamond: diamondEmblem,
};
