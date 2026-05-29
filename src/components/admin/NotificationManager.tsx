import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Bell, Send, Users, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type UserOption = {
  user_id: string;
  display_name: string | null;
  isPremium: boolean;
};

type Filter = "all" | "premium" | "free";

const NotificationManager = () => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [audience, setAudience] = useState<"all" | "free" | "premium">("all");

  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      const [{ data: profiles }, { data: subs }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name"),
        supabase.from("premium_subscriptions").select("user_id, expires_at"),
      ]);
      const now = Date.now();
      const premiumSet = new Set(
        (subs || [])
          .filter((s: any) => s.expires_at && new Date(s.expires_at).getTime() > now)
          .map((s: any) => s.user_id)
      );
      const rows: UserOption[] = (profiles || []).map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        isPremium: premiumSet.has(p.user_id),
      }));
      rows.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
      setUsers(rows);
      setLoadingUsers(false);
    };
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    if (filter === "premium") return users.filter((u) => u.isPremium);
    if (filter === "free") return users.filter((u) => !u.isPremium);
    return users;
  }, [users, filter]);

  const selectedUser = users.find((u) => u.user_id === targetUserId);

  const sendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Missing fields", description: "Title and message are required.", variant: "destructive" });
      return;
    }

    if (mode === "specific" && !targetUserId.trim()) {
      toast({ title: "Missing user", description: "Please select a user.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      let externalUserIds: string | string[];

      if (mode === "all") {
        const pool =
          audience === "free" ? users.filter((u) => !u.isPremium)
          : audience === "premium" ? users.filter((u) => u.isPremium)
          : users;
        if (!pool.length) {
          toast({ title: "No users found", variant: "destructive" });
          setSending(false);
          return;
        }
        externalUserIds = pool.map((u) => u.user_id);
      } else {
        externalUserIds = targetUserId.trim();
      }

      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: { external_user_id: externalUserIds, title: title.trim(), message: message.trim() },
      });

      if (error) throw error;

      const audienceLabel = audience === "free" ? "all free users" : audience === "premium" ? "all premium users" : "all users";
      toast({ title: "Notification sent!", description: `Sent to ${mode === "all" ? audienceLabel : selectedUser?.display_name || "user"}.` });
      setTitle("");
      setMessage("");
      setTargetUserId("");
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "all" | "specific")}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1 gap-2">
              <Users className="h-4 w-4" /> All Users
            </TabsTrigger>
            <TabsTrigger value="specific" className="flex-1 gap-2">
              <User className="h-4 w-4" /> Specific User
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users ({users.length})</SelectItem>
                <SelectItem value="free">Free users only ({users.filter((u) => !u.isPremium).length})</SelectItem>
                <SelectItem value="premium">Premium users only ({users.filter((u) => u.isPremium).length})</SelectItem>
              </SelectContent>
            </Select>
          </TabsContent>


          <TabsContent value="specific" className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label>Filter</Label>
              <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users ({users.length})</SelectItem>
                  <SelectItem value="premium">
                    Premium only ({users.filter((u) => u.isPremium).length})
                  </SelectItem>
                  <SelectItem value="free">
                    Free only ({users.filter((u) => !u.isPremium).length})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>User</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                    disabled={loadingUsers}
                  >
                    {selectedUser
                      ? `${selectedUser.display_name || "Unnamed"} ${selectedUser.isPremium ? "· Premium" : "· Free"}`
                      : loadingUsers
                        ? "Loading users..."
                        : "Select a user..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name or ID..." />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      <CommandGroup>
                        {filteredUsers.map((u) => (
                          <CommandItem
                            key={u.user_id}
                            value={`${u.display_name || ""} ${u.user_id}`}
                            onSelect={() => {
                              setTargetUserId(u.user_id);
                              setOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                targetUserId === u.user_id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{u.display_name || "Unnamed"}</span>
                              <span className="text-xs text-muted-foreground">
                                {u.isPremium ? "Premium" : "Free"} · {u.user_id.slice(0, 8)}…
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Or paste User ID</Label>
              <Input
                placeholder="Enter user UUID..."
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label>Title</Label>
          <Input placeholder="Notification title..." value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea placeholder="Notification message..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
        </div>

        <Button onClick={sendNotification} disabled={sending} className="w-full gap-2">
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : `Send to ${mode === "all" ? "All Users" : "User"}`}
        </Button>
      </CardContent>
    </Card>
  );
};

export default NotificationManager;
