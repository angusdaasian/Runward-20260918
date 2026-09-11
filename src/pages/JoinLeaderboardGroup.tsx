import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export default function JoinLeaderboardGroup() {
  const { code = "" } = useParams(); const { user, loading: authLoading } = useAuth(); const navigate = useNavigate();
  const [group, setGroup] = useState<{ name: string; emoji: string | null; member_count: number } | null>(null); const [loading, setLoading] = useState(true); const [joining, setJoining] = useState(false);
  useEffect(() => { if (authLoading || !user) { setLoading(false); return; } supabase.rpc("get_group_by_code", { p_code: code }).then(({ data }) => { setGroup(data?.[0] || null); setLoading(false); }); }, [authLoading, code, user]);
  const join = async () => { setJoining(true); const { error } = await supabase.rpc("join_group_by_code", { p_code: code }); if (!error) navigate("/"); else setJoining(false); };
  return <main className="flex min-h-screen items-center justify-center bg-background p-5"><section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center"><Users className="mx-auto text-primary" size={32} />{loading || authLoading ? <Loader2 className="mx-auto mt-5 animate-spin" /> : !user ? <><h1 className="mt-4 text-xl font-bold">Sign in to join</h1><p className="mt-2 text-sm text-muted-foreground">Open this invitation again after signing in to Runward.</p><Button className="mt-5" asChild><Link to="/">Open Runward</Link></Button></> : group ? <><div className="mt-4 text-3xl">{group.emoji || "🏃"}</div><h1 className="mt-2 text-xl font-bold">{group.name}</h1><p className="mt-2 text-sm text-muted-foreground">{group.member_count} members</p><Button className="mt-5 w-full" onClick={join} disabled={joining}>{joining ? <Loader2 className="animate-spin" /> : "Join leaderboard"}</Button></> : <><h1 className="mt-4 text-xl font-bold">Invitation unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This link is invalid or has been replaced.</p></>}</section></main>;
}