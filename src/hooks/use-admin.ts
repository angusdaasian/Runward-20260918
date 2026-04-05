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
