import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";

interface Announcement {
  id: string;
  title: string;
  message: string;
  title_zh: string | null;
  message_zh: string | null;
  is_active: boolean;
  created_at: string;
}

const AnnouncementManager = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [titleZh, setTitleZh] = useState("");
  const [messageZh, setMessageZh] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editTitleZh, setEditTitleZh] = useState("");
  const [editMessageZh, setEditMessageZh] = useState("");

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("id, title, message, title_zh, message_zh, is_active, created_at")
      .order("created_at", { ascending: false });
    setAnnouncements((data as Announcement[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !message.trim() || !user) return;
    setSaving(true);

    await supabase.from("announcements").update({ is_active: false }).eq("is_active", true);

    const { error } = await supabase.from("announcements").insert({
      title: title.trim(),
      message: message.trim(),
      title_zh: titleZh.trim() || null,
      message_zh: messageZh.trim() || null,
      is_active: true,
      created_by: user.id,
    });

    setSaving(false);
    if (error) {
      toast.error("Failed to create announcement");
    } else {
      toast.success("Announcement published!");
      setTitle("");
      setMessage("");
      setTitleZh("");
      setMessageZh("");
      fetchAnnouncements();
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    if (isActive) {
      await supabase.from("announcements").update({ is_active: false }).eq("is_active", true);
    }
    const { error } = await supabase.from("announcements").update({ is_active: isActive }).eq("id", id);
    if (error) {
      toast.error("Failed to update");
    } else {
      fetchAnnouncements();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Announcement deleted");
      fetchAnnouncements();
    }
  };

  const startEditing = (a: Announcement) => {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditMessage(a.message);
    setEditTitleZh(a.title_zh || "");
    setEditMessageZh(a.message_zh || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editTitle.trim() || !editMessage.trim()) return;
    const { error } = await supabase
      .from("announcements")
      .update({
        title: editTitle.trim(),
        message: editMessage.trim(),
        title_zh: editTitleZh.trim() || null,
        message_zh: editMessageZh.trim() || null,
      })
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to update announcement");
    } else {
      toast.success("Announcement updated!");
      setEditingId(null);
      fetchAnnouncements();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" /> Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
          <h3 className="text-sm font-semibold text-foreground">New Announcement</h3>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Title (English)</Label>
            <Input placeholder="e.g. New Feature!" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Message (English)</Label>
            <Textarea placeholder="Message body..." value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">標題 (中文 — optional)</Label>
            <Input placeholder="例如：新功能！" value={titleZh} onChange={(e) => setTitleZh(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">內容 (中文 — optional)</Label>
            <Textarea placeholder="中文訊息內容..." value={messageZh} onChange={(e) => setMessageZh(e.target.value)} maxLength={500} rows={3} />
          </div>
          <Button onClick={handleCreate} disabled={saving || !title.trim() || !message.trim()} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {saving ? "Publishing..." : "Publish Announcement"}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No announcements yet</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) =>
              editingId === a.id ? (
                <div key={a.id} className="p-3 rounded-lg border-2 border-primary bg-card space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Title (English)</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Message (English)</Label>
                    <Textarea value={editMessage} onChange={(e) => setEditMessage(e.target.value)} maxLength={500} rows={3} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">標題 (中文)</Label>
                    <Input value={editTitleZh} onChange={(e) => setEditTitleZh(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">內容 (中文)</Label>
                    <Textarea value={editMessageZh} onChange={(e) => setEditMessageZh(e.target.value)} maxLength={500} rows={3} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} disabled={!editTitle.trim() || !editMessage.trim()}>
                      <Check className="h-4 w-4 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEditing}>
                      <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground truncate">{a.title}</span>
                      {a.is_active && <Badge className="bg-primary text-primary-foreground text-[10px]">Active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.message}</p>
                    {a.title_zh && <p className="text-xs text-muted-foreground mt-1 opacity-70">中文: {a.title_zh}</p>}
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      {new Date(a.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditing(a)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`toggle-${a.id}`} className="text-[10px] text-muted-foreground">
                        {a.is_active ? "On" : "Off"}
                      </Label>
                      <Switch id={`toggle-${a.id}`} checked={a.is_active} onCheckedChange={(checked) => handleToggle(a.id, checked)} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AnnouncementManager;
