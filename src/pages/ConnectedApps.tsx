import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

type Authz = {
  id: string;
  app_id: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  app?: {
    name: string;
    website_url: string | null;
    description: string | null;
  };
};

export default function ConnectedApps() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Authz[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  const load = async () => {
    const { data, error } = await supabase
      .from("oauth_authorizations")
      .select("id,app_id,scopes,created_at,last_used_at,revoked_at,oauth_apps(name,website_url,description)")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []).map((r: any) => ({ ...r, app: r.oauth_apps })));
  };

  useEffect(() => { if (user) load(); }, [user]);

  const revoke = async (id: string) => {
    setBusy(id);
    const { error } = await supabase
      .from("oauth_authorizations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Access revoked");
    load();
  };

  if (loading || !user) return <div className="p-8">Loading…</div>;

  const active = rows.filter((r) => !r.revoked_at);
  const past = rows.filter((r) => r.revoked_at);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-lg font-semibold">Connected apps</h1>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Third-party apps you've granted access to your Runward data. Revoking immediately stops API access and webhook deliveries.
        </p>

        {active.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No connected apps.</CardContent></Card>
        )}

        {active.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {r.app?.name ?? "Unknown app"}
                <Badge variant="default">active</Badge>
              </CardTitle>
              <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => revoke(r.id)}>
                Revoke
              </Button>
            </CardHeader>
            <CardContent className="text-sm space-y-1 text-muted-foreground">
              {r.app?.description && <p>{r.app.description}</p>}
              {r.app?.website_url && <a className="text-primary underline" href={r.app.website_url} target="_blank" rel="noreferrer">{r.app.website_url}</a>}
              <div className="text-xs">Scopes: {r.scopes.join(", ")}</div>
              <div className="text-xs">Connected: {new Date(r.created_at).toLocaleDateString()}</div>
              {r.last_used_at && <div className="text-xs">Last used: {new Date(r.last_used_at).toLocaleDateString()}</div>}
            </CardContent>
          </Card>
        ))}

        {past.length > 0 && (
          <>
            <h2 className="text-sm font-semibold pt-4 text-muted-foreground">Revoked</h2>
            {past.map((r) => (
              <Card key={r.id} className="opacity-60">
                <CardHeader><CardTitle className="text-base">{r.app?.name ?? "Unknown app"}</CardTitle></CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Revoked {r.revoked_at ? new Date(r.revoked_at).toLocaleDateString() : ""}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
