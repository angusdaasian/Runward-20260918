import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Crown,
  Users,
  Bell,
  Megaphone,
  Image as ImageIcon,
  Gift,
  Flag,
  ClipboardList,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { toast } from "sonner";
import AnnouncementManager from "@/components/admin/AnnouncementManager";
import PromoBannerManager from "@/components/admin/PromoBannerManager";
import FeedbackManager from "@/components/admin/FeedbackManager";
import RaceManager from "@/components/admin/RaceManager";
import PendingRaceManager from "@/components/admin/PendingRaceManager";
import RewardCodeManager from "@/components/admin/RewardCodeManager";
import NotificationManager from "@/components/admin/NotificationManager";
import TerraSyncTester from "@/components/admin/TerraSyncTester";

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

type TabKey =
  | "users"
  | "notifications"
  | "announcements"
  | "promo"
  | "rewards"
  | "races"
  | "pending"
  | "feedback"
  | "terra";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "promo", label: "Promo Banners", icon: ImageIcon },
  { key: "rewards", label: "Reward Codes", icon: Gift },
  { key: "races", label: "Races", icon: Flag },
  { key: "pending", label: "Pending Races", icon: ClipboardList },
  { key: "feedback", label: "Feedback", icon: MessageSquare },
  { key: "terra", label: "Terra Sync", icon: RefreshCw },
];


const GRANTOR_USER_ID = "c7a7d1ca-c7bf-4288-bb9d-794006a04087";

const AdminPanel = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [restoring, setRestoring] = useState(false);
  const [grantTarget, setGrantTarget] = useState<UserRow | null>(null);
  const [grantDuration, setGrantDuration] = useState<"1week" | "2week" | "1month">("1month");
  const [grantSecret, setGrantSecret] = useState("");
  const [granting, setGranting] = useState(false);
  const canGrant = user?.id === GRANTOR_USER_ID;

  const handleGrantPremium = async () => {
    if (!grantTarget || !grantSecret) return;
    setGranting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-grant-premium", {
        body: { targetUserId: grantTarget.user_id, duration: grantDuration, secret: grantSecret },
      });
      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || error?.message || "Grant failed");
      }
      toast.success(`Granted premium to ${grantTarget.display_name || grantTarget.user_id}`);
      setGrantTarget(null);
      setGrantSecret("");
      fetchUsers();
    } catch (e: any) {
      toast.error(e?.message || "Failed to grant premium");
    } finally {
      setGranting(false);
    }
  };

  const AFFECTED_USER_IDS = [
    "0ed6a94b-1e42-479d-ad51-468c007310e8",
    "21c70699-36a0-4243-a511-f9d3fb558529",
    "3ea42539-f316-4e30-8a20-647cce23d9f1",
    "54576cb1-3ef4-4fff-8859-a0e610283def",
    "697e7d98-a790-40d5-b315-63eac7bf8181",
    "7c94df5c-c24d-4bef-95b2-39afefe98055",
    "b65fd88b-4e6a-4770-8afc-194143303e8a",
    "fb7a336f-8c6d-47b5-bdfd-75a2a524f109",
  ];

  const handleRestoreRC = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-restore-rc-subs", {
        body: { userIds: AFFECTED_USER_IDS },
      });
      if (error) throw error;
      const restored = (data as any)?.results?.filter((r: any) => r.ok)?.length ?? 0;
      toast.success(`Restored ${restored}/${AFFECTED_USER_IDS.length} subscribers`);
      fetchUsers();
    } catch (e: any) {
      toast.error(e?.message || "Failed to restore subscribers");
    } finally {
      setRestoring(false);
    }
  };

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

  const renderUsersTab = () => (
    <div className="space-y-6">
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                localStorage.removeItem("posture_used_date");
                localStorage.removeItem("posture_last_result");
                localStorage.removeItem("posture_last_lang");
                toast.success("Posture daily limit reset. Reloading...");
                setTimeout(() => window.location.reload(), 600);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Posture Limit
            </Button>
            <Button size="sm" variant="outline" onClick={handleRestoreRC} disabled={restoring}>
              <Crown className="h-4 w-4 mr-2" />
              {restoring ? "Restoring..." : "Restore RC Subscribers"}
            </Button>
          </div>
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
                    {canGrant && <TableHead>Grant</TableHead>}
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
                        {canGrant && (
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => setGrantTarget(u)}>
                              <Crown className="h-3 w-3 mr-1" />
                              Grant
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {canGrant && (
        <Dialog open={!!grantTarget} onOpenChange={(o) => { if (!o) { setGrantTarget(null); setGrantSecret(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Premium to {grantTarget?.display_name || grantTarget?.user_id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={grantDuration} onValueChange={(v) => setGrantDuration(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1week">1 Week</SelectItem>
                    <SelectItem value="2week">2 Weeks</SelectItem>
                    <SelectItem value="1month">1 Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Granting Secret</Label>
                <Input
                  type="password"
                  value={grantSecret}
                  onChange={(e) => setGrantSecret(e.target.value)}
                  placeholder="Enter secret"
                  autoComplete="off"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setGrantTarget(null); setGrantSecret(""); }}>Cancel</Button>
              <Button onClick={handleGrantPremium} disabled={granting || !grantSecret}>
                {granting ? "Granting..." : "Grant Premium"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  const renderTab = () => {
    switch (activeTab) {
      case "users":
        return renderUsersTab();
      case "notifications":
        return <NotificationManager />;
      case "announcements":
        return <AnnouncementManager />;
      case "promo":
        return <PromoBannerManager />;
      case "rewards":
        return <RewardCodeManager />;
      case "races":
        return <RaceManager />;
      case "pending":
        return <PendingRaceManager />;
      case "feedback":
        return <FeedbackManager />;
      case "terra":
        return <TerraSyncTester />;
    }
  };

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label ?? "Admin";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="offcanvas">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {TABS.map((tab) => (
                    <SidebarMenuItem key={tab.key}>
                      <SidebarMenuButton
                        isActive={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className="flex items-center gap-2"
                      >
                        <tab.icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-2 border-b border-border px-3">
            <SidebarTrigger />
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-foreground">
              Admin Panel · <span className="text-muted-foreground">{activeLabel}</span>
            </h1>
          </header>

          <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
            <div className="max-w-6xl mx-auto">{renderTab()}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminPanel;
