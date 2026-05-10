import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const check = async () => {
      // Temporarily hide admin UI for specific users (e.g. for video recording)
      const HIDE_ADMIN_FOR_DISPLAY_NAMES = ["6hhxbmqfy7"];
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.display_name && HIDE_ADMIN_FOR_DISPLAY_NAMES.includes(profile.display_name)) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("has_role" as any, {
        _user_id: user.id,
        _role: "admin",
      });
      setIsAdmin(!error && data === true);
      setLoading(false);
    };

    check();
  }, [user]);

  return { isAdmin, loading };
}
