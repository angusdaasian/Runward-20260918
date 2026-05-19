import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PremiumContextType {
  isPremium: boolean;
  isTrial: boolean;
  expiresAt: Date | null;
  plan: string | null;
  rcEntitlement: string | null;
  activatePremium: (plan: "monthly" | "yearly" | "code_annual") => Promise<boolean>;
  refreshSubscription: () => Promise<boolean>;
  onPurchaseConfirmed: (cb: () => void) => () => void;
  loading: boolean;
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  isTrial: false,
  expiresAt: null,
  plan: null,
  rcEntitlement: null,
  activatePremium: async () => false,
  refreshSubscription: async () => false,
  onPurchaseConfirmed: () => () => {},
  loading: false,
});

export const usePremium = () => useContext(PremiumContext);

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [rcEntitlement, setRcEntitlement] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const purchaseListeners = useRef<Set<() => void>>(new Set());

  const onPurchaseConfirmed = useCallback((cb: () => void) => {
    purchaseListeners.current.add(cb);
    return () => { purchaseListeners.current.delete(cb); };
  }, []);

  const notifyPurchaseListeners = useCallback(() => {
    purchaseListeners.current.forEach((cb) => cb());
  }, []);

  const fetchSubscription = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setIsPremium(false);
      setExpiresAt(null);
      setPlan(null);
      setRcEntitlement(null);
      return false;
    }

    // First check RevenueCat status via edge function (syncs DB)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        const rcRes = await supabase.functions.invoke("check-revenuecat-status", {
          headers: { Authorization: `Bearer ${token}` },
        });
    if (rcRes.data?.isPremium) {
          const wasNotPremium = !isPremium;
          setIsPremium(true);
          setExpiresAt(new Date(rcRes.data.expiresAt));
          setPlan(rcRes.data.plan);
          setRcEntitlement(rcRes.data.rcEntitlement || "premium");
          if (wasNotPremium) {
            // Sync profiles.is_premium flag
            if (user) {
              await supabase.from("profiles").update({ is_premium: true }).eq("user_id", user.id);
            }
            notifyPurchaseListeners();
          }
          return true;
        }
      }
    } catch (err) {
      console.warn("RevenueCat check failed, falling back to DB:", err);
    }

    // Fallback: check DB directly
    const { data } = await supabase
      .from("premium_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data && new Date(data.expires_at) > new Date()) {
      const wasNotPremium = !isPremium;
      setIsPremium(true);
      setExpiresAt(new Date(data.expires_at));
      setPlan(data.plan);
      setRcEntitlement(data.rc_entitlement || "premium");
      if (wasNotPremium) {
        await supabase.from("profiles").update({ is_premium: true }).eq("user_id", user.id);
        notifyPurchaseListeners();
      }
      return true;
    } else {
      setIsPremium(false);
      setExpiresAt(null);
      setPlan(null);
      setRcEntitlement(null);
      return false;
    }
  }, [user, isPremium, notifyPurchaseListeners]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const activatePremium = async (planType: "monthly" | "yearly" | "code_annual"): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setLoading(false); return false; }

      const { data, error } = await supabase.functions.invoke("activate-subscription", {
        headers: { Authorization: `Bearer ${token}` },
        body: { plan: planType },
      });

      setLoading(false);
      if (!error && data?.success) {
        setIsPremium(true);
        setExpiresAt(new Date(data.expires_at));
        setPlan(planType);
        setRcEntitlement("premium");
        if (user) {
          await supabase.from("profiles").update({ is_premium: true }).eq("user_id", user.id);
        }
        notifyPurchaseListeners();
        return true;
      }
      return false;
    } catch {
      setLoading(false);
      return false;
    }
  };

  return (
    <PremiumContext.Provider value={{ isPremium, isTrial, expiresAt, plan, rcEntitlement, activatePremium, refreshSubscription: fetchSubscription, onPurchaseConfirmed, loading }}>
      {children}
    </PremiumContext.Provider>
  );
};
