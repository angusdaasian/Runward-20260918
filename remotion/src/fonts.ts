import { loadFont as loadNotoTC } from "@remotion/google-fonts/NotoSansTC";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

export const noto = loadNotoTC("normal", { weights: ["400", "500", "700", "900"] });
export const space = loadSpaceGrotesk("normal", { weights: ["500", "700"] });
