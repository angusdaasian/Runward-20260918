import { useCallback, useEffect, useRef } from "react";
import despia from "despia-native";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { toast } from "sonner";

export function useDespiaPurchases() {
  const { user } = useAuth();
  const { refreshSubscription } = usePremium();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redeemPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback((ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>) => {
    if (ref.current) {
      clearInterval(ref.current);
      ref.current = null;
    }
  }, []);

  // Set up global onRevenueCatPurchase callback
  useEffect(() => {
    (window as any).onRevenueCatPurchase = (data: any) => {
      console.log("onRevenueCatPurchase called:", data);
      // Start polling backend to check if webhook has updated user status
      stopPolling(pollingRef);
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        const updated = await refreshSubscription();
        if (updated || attempts >= 30) {
          stopPolling(pollingRef);
        }
      }, 2000);
    };

    return () => {
      delete (window as any).onRevenueCatPurchase;
      stopPolling(pollingRef);
      stopPolling(redeemPollingRef);
    };
  }, [refreshSubscription, stopPolling]);

  const launchPaywall = useCallback(
    (offering: string = "default", locale: string = "en") => {
      if (!user) return;

      // Force browser locale hints before launching native paywall
      if (locale === "zh_Hant") {
        document.documentElement.lang = "zh_Hant";
        try {
          Object.defineProperty(navigator, "language", { value: "zh_Hant", configurable: true });
          Object.defineProperty(navigator, "languages", { value: ["zh_Hant", "zh"], configurable: true });
        } catch (e) {
          console.warn("[Paywall] Could not override navigator.language:", e);
        }
      } else {
        document.documentElement.lang = "en";
      }

      console.log("[Paywall] document.lang:", document.documentElement.lang, "| navigator.language:", navigator.language, "| navigator.languages:", navigator.languages);
      console.log("[Paywall] Launching with locale:", locale, "| offering:", offering, "| user:", user.id);
      despia(`revenuecat://launchPaywall?external_id=${user.id}&offering=${offering}&locale=${locale}`);
    },
    [user]
  );

  const restorePurchases = useCallback(async () => {
    try {
      const data = await despia("getpurchasehistory://", ["restoredData"]);
      return data?.restoredData ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Open the App Store offer code redemption URL with a prefilled code,
   * then poll for entitlement changes when the user returns.
   */
  const redeemOfferCode = useCallback(
    (code: string, lang: "en" | "zh" = "en") => {
      if (!user || !code.trim()) return;

      const trimmedCode = code.trim();
      const isAndroid = /android/i.test(navigator.userAgent);
      const redeemUrl = isAndroid
        ? `https://play.google.com/redeem?code=${encodeURIComponent(trimmedCode)}`
        : `https://apps.apple.com/redeem?ctx=offercodes&id=6761060757&code=${encodeURIComponent(trimmedCode)}`;

      console.log(`[Redeem] Opening ${isAndroid ? "Play Store" : "App Store"} offer code URL for user:`, user.id, "code:", trimmedCode);

      // Start polling BEFORE opening the link so we catch the entitlement change on return
      stopPolling(redeemPollingRef);
      let attempts = 0;
      redeemPollingRef.current = setInterval(async () => {
        attempts++;
        console.log(`[Redeem] Polling attempt ${attempts}…`);

        // Also try to sync purchases via RevenueCat
        try {
          despia("revenuecat://syncPurchases");
        } catch (e) {
          // silent – may not be available
        }

        const updated = await refreshSubscription();
        if (updated) {
          console.log("[Redeem] Premium entitlement detected after offer code!");
          stopPolling(redeemPollingRef);
          toast.success(
            lang === "zh" ? "🎉 兌換成功！已解鎖高級功能" : "🎉 Code redeemed! Premium features unlocked",
            { duration: 4000 }
          );
        } else if (attempts >= 90) {
          // Stop after ~3 minutes
          console.log("[Redeem] Polling timed out");
          stopPolling(redeemPollingRef);
        }
      }, 2000);

      // Open the App Store redemption URL
      window.open(redeemUrl, "_blank");
    },
    [user, refreshSubscription, stopPolling]
  );

  return { launchPaywall, restorePurchases, redeemOfferCode };
}
