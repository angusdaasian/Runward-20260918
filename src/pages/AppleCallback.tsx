import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AppleCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Check for error in query params
      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get("error");
      if (errorParam) {
        console.error("[AppleCallback] Error from callback:", errorParam);
        setError(errorParam);
        return;
      }

      // Extract tokens from hash (set by the edge function redirect)
      const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      console.log("[AppleCallback] Hash params:", {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type: hashParams.get("type"),
      });

      if (accessToken && refreshToken) {
        console.log("[AppleCallback] Setting Supabase session from tokens...");
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error("[AppleCallback] setSession error:", sessionError);
          setError(sessionError.message);
          return;
        }

        console.log("[AppleCallback] Session set successfully, redirecting home");
        navigate("/", { replace: true });
        return;
      }

      setError("No authentication tokens received from Apple");
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center">
        <p className="text-destructive font-medium mb-4">Sign-in failed</p>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <button
          onClick={() => navigate("/", { replace: true })}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
};

export default AppleCallback;
