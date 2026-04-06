import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Bell, Send, Users, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const NotificationManager = () => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"all" | "specific">("all");

  const sendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Missing fields", description: "Title and message are required.", variant: "destructive" });
      return;
    }

    if (mode === "specific" && !targetUserId.trim()) {
      toast({ title: "Missing user ID", description: "Please enter a user ID.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      let externalUserIds: string | string[];

      if (mode === "all") {
        const { data: profiles } = await supabase.from("profiles").select("user_id");
        if (!profiles || profiles.length === 0) {
          toast({ title: "No users found", variant: "destructive" });
          setSending(false);
          return;
        }
        externalUserIds = profiles.map((p) => p.user_id);
      } else {
        externalUserIds = targetUserId.trim();
      }

      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: { external_user_id: externalUserIds, title: title.trim(), message: message.trim() },
      });

      if (error) throw error;

      toast({ title: "Notification sent!", description: `Sent to ${mode === "all" ? "all users" : "specific user"}.` });
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

          <TabsContent value="specific" className="mt-4">
            <div className="space-y-2">
              <Label>User ID</Label>
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
