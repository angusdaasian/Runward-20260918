import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function OAuthAuthorize() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [appInfo, setAppInfo] = useState<{ name: string; description?: string | null; website_url?: string | null } | null>(null);
  const [scopes, setScopes] = useState<string[]>(["activity:read"]);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const client_id = params.get("client_id") ?? "";
  const redirect_uri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const code_challenge = params.get("code_challenge") ?? "";
  const code_challenge_method = params.get("code_challenge_method") ?? "S256";
  const scope = params.get("scope") ?? "activity:read";
  const response_type = params.get("response_type") ?? "code";

  useEffect(() => {
    if (!loading && !user) {
      const here = window.location.pathname + window.location.search;
      navigate(`/auth?redirect=${encodeURIComponent(here)}`);
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!client_id || !redirect_uri) { setErr("Missing client_id or redirect_uri"); return; }
    if (response_type !== "code") { setErr("response_type must be 'code'"); return; }
    if (!code_challenge || code_challenge_method !== "S256") { setErr("PKCE (S256) is required"); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("oauth-authorize?action=inspect", {
        body: { client_id, redirect_uri },
      });
      if (error || (data as any)?.error) {
        setErr((data as any)?.error ?? error?.message ?? "Invalid app");
        return;
      }
      setAppInfo((data as any).app);
      setScopes((data as any).scopes ?? ["activity:read"]);
    })();
  }, [client_id, redirect_uri, response_type, code_challenge, code_challenge_method]);

  const allow = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("oauth-authorize?action=grant", {
      body: { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    window.location.href = (data as any).redirect;
  };

  const deny = () => {
    const sep = redirect_uri.includes("?") ? "&" : "?";
    const p = new URLSearchParams({ error: "access_denied" });
    if (state) p.set("state", state);
    window.location.href = `${redirect_uri}${sep}${p.toString()}`;
  };

  if (loading) return <div className="p-8">Loading…</div>;
  if (err) return <div className="p-8 text-destructive">{err}</div>;
  if (!appInfo) return <div className="p-8">Loading app…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize {appInfo.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {appInfo.description && <p className="text-sm text-muted-foreground">{appInfo.description}</p>}
          <div>
            <p className="text-sm font-medium mb-2">This app will be able to:</p>
            <ul className="list-disc pl-5 text-sm">
              {scopes.includes("activity:read") && <li>Read your activities and basic profile</li>}
            </ul>
          </div>
          <div className="text-xs text-muted-foreground">
            You can revoke access anytime from your Runward settings.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={deny}>Deny</Button>
            <Button className="flex-1" onClick={allow} disabled={submitting}>Allow</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
