import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Crown, Users } from "lucide-react";
import AnnouncementManager from "@/components/admin/AnnouncementManager";
import PromoBannerManager from "@/components/admin/PromoBannerManager";
import FeedbackManager from "@/components/admin/FeedbackManager";
import RaceManager from "@/components/admin/RaceManager";
import PendingRaceManager from "@/components/admin/PendingRaceManager";
import RewardCodeManager from "@/components/admin/RewardCodeManager";
import NotificationManager from "@/components/admin/NotificationManager";
import ValidicTestPanel from "@/components/admin/ValidicTestPanel";

interface UserRow {
  user_id: string;
  display_name: string | null;
  age: number | null;
  sex: string | null;
  runs_per_week: number | null;
  created_at: string;
  premium_plan: string | null;
  premium_expires: string | null;
  premium_activated: string | null;
  is_trial: boolean;
  rc_entitlement: string | null;
}

const AdminPanel = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminLoading && !authLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, adminLoading, authLoading, navigate]);

  const fetchUsers = async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, age, sex, runs_per_week, created_at");

    const { data: subs } = await supabase
      .from("premium_subscriptions")
      .select("user_id, plan, expires_at, activated_at, is_trial, rc_entitlement");

    if (!profiles) {
      setLoading(false);
      return;
    }

    const subMap = new Map(subs?.map((s) => [s.user_id, s]) || []);

    const rows: UserRow[] = profiles.map((p) => {
      const sub = subMap.get(p.user_id);
      return {
        user_id: p.user_id,
        display_name: p.display_name,
        age: p.age,
        sex: p.sex,
        runs_per_week: p.runs_per_week,
        created_at: p.created_at,
        premium_plan: sub?.plan || null,
        premium_expires: sub?.expires_at || null,
        premium_activated: sub?.activated_at || null,
        is_trial: sub?.is_trial || false,
        rc_entitlement: sub?.rc_entitlement || null,
      };
    });

    setUsers(rows);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
  }, [isAdmin]);

  const isPremiumActive = (expires: string | null) => {
    if (!expires) return false;
    return new Date(expires) > new Date();
  };

  if (adminLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{users.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Crown className="h-4 w-4" /> Premium Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {users.filter((u) => isPremiumActive(u.premium_expires)).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Free Users</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {users.filter((u) => !isPremiumActive(u.premium_expires)).length}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Sex</TableHead>
                      <TableHead>Runs/Week</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Subscribed</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const active = isPremiumActive(u.premium_expires);
                      const method = u.is_trial
                        ? "Trial"
                        : u.rc_entitlement === "premium"
                          ? "RevenueCat"
                          : u.rc_entitlement
                            ? u.rc_entitlement
                            : u.premium_plan
                              ? "Manual"
                              : "—";
                      return (
                        <TableRow key={u.user_id}>
                          <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                          <TableCell>{u.age ?? "—"}</TableCell>
                          <TableCell>{u.sex ?? "—"}</TableCell>
                          <TableCell>{u.runs_per_week ?? "—"}</TableCell>
                          <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {active ? (
                              <Badge className="bg-primary text-primary-foreground">Active</Badge>
                            ) : u.premium_plan ? (
                              <Badge variant="outline">Expired</Badge>
                            ) : (
                              <Badge variant="secondary">Free</Badge>
                            )}
                          </TableCell>
                          <TableCell>{u.premium_plan ?? "—"}</TableCell>
                          <TableCell>{method}</TableCell>
                          <TableCell>
                            {u.premium_activated ? new Date(u.premium_activated).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            {u.premium_expires ? new Date(u.premium_expires).toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <ValidicTestPanel />
        <NotificationManager />
        <AnnouncementManager />
        <PromoBannerManager />
        <RewardCodeManager />
        <RaceManager />
        <PendingRaceManager />
        <FeedbackManager />
      </div>
    </div>
  );
};

export default AdminPanel;
