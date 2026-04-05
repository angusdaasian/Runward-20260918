import freePlan5k from "@/assets/free-plan-5k.jpg";
import freePlan10k from "@/assets/free-plan-10k.jpg";
import freePlanHm from "@/assets/free-plan-hm.jpg";
import freePlanFm from "@/assets/free-plan-fm.jpg";
import onboardingBg from "@/assets/onboarding-bg.jpg";

const allImages = [freePlan5k, freePlan10k, freePlanHm, freePlanFm, onboardingBg];

let preloaded = false;

/** Preload all critical app images into the browser cache */
export function preloadAllImages() {
  if (preloaded) return;
  preloaded = true;
  allImages.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

/** Preload a specific image URL */
export function preloadImage(src: string) {
  const img = new Image();
  img.src = src;
}
