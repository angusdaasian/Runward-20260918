import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import PromoBanner, { clearPromoBannerSeen } from "@/components/PromoBanner";

interface PromoBanner {
  id: string;
  image_url: string;
  link_url: string | null;
  caption: string | null;
  caption_zh: string | null;
  display_order: number;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

// datetime-local needs "YYYY-MM-DDTHH:mm" in *local* time.
const toDatetimeLocal = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PromoBannerManager = () => {
  const { user } = useAuth();
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [captionZh, setCaptionZh] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [endsAt, setEndsAt] = useState(""); // datetime-local
  const [displayOrder, setDisplayOrder] = useState("0");

  // Edit dialog state
  const [editing, setEditing] = useState<PromoBanner | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editCaptionZh, setEditCaptionZh] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [editDisplayOrder, setEditDisplayOrder] = useState("0");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchBanners = async () => {
    const { data } = await supabase
      .from("promo_banners")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    setBanners((data as PromoBanner[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const handleUpload = async () => {
    if (!user) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose an image first");
      return;
    }
    if (!endsAt) {
      toast.error("Set a deadline");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filename = `banner-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("promo-banners")
        .upload(filename, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("promo-banners").getPublicUrl(filename);

      const { error: insErr } = await supabase.from("promo_banners").insert({
        image_url: pub.publicUrl,
        link_url: linkUrl.trim() || null,
        caption: caption.trim() || null,
        caption_zh: captionZh.trim() || null,
        display_order: parseInt(displayOrder, 10) || 0,
        ends_at: new Date(endsAt).toISOString(),
        is_active: true,
        created_by: user.id,
      });
      if (insErr) throw insErr;

      toast.success("Banner uploaded!");
      setCaption("");
      setCaptionZh("");
      setLinkUrl("");
      setEndsAt("");
      setDisplayOrder("0");
      if (fileRef.current) fileRef.current.value = "";
      fetchBanners();
    } catch (e: any) {
      toast.error(e.message || "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("promo_banners").update({ is_active: isActive }).eq("id", id);
    if (error) toast.error("Failed to update");
    else fetchBanners();
  };

  const openEdit = (b: PromoBanner) => {
    setEditing(b);
    setEditCaption(b.caption || "");
    setEditCaptionZh(b.caption_zh || "");
    setEditLinkUrl(b.link_url || "");
    setEditEndsAt(toDatetimeLocal(b.ends_at));
    setEditDisplayOrder(String(b.display_order));
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("promo_banners")
        .update({
          caption: editCaption.trim() || null,
          caption_zh: editCaptionZh.trim() || null,
          link_url: editLinkUrl.trim() || null,
          display_order: parseInt(editDisplayOrder, 10) || 0,
          ends_at: new Date(editEndsAt).toISOString(),
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Banner updated");
      setEditing(null);
      fetchBanners();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleQuickOrder = async (b: PromoBanner, delta: number) => {
    const newOrder = (b.display_order || 0) + delta;
    const { error } = await supabase
      .from("promo_banners")
      .update({ display_order: newOrder })
      .eq("id", b.id);
    if (error) toast.error("Failed to reorder");
    else fetchBanners();
  };

  const handleDelete = async (b: PromoBanner) => {
    if (!confirm("Delete this banner?")) return;
    // Try removing the image file (best-effort)
    try {
      const url = new URL(b.image_url);
      const idx = url.pathname.indexOf("/promo-banners/");
      if (idx >= 0) {
        const path = url.pathname.slice(idx + "/promo-banners/".length);
        await supabase.storage.from("promo-banners").remove([path]);
      }
    } catch {
      /* ignore */
    }
    const { error } = await supabase.from("promo_banners").delete().eq("id", b.id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      fetchBanners();
    }
  };

  const isExpired = (ends_at: string) => new Date(ends_at) < new Date();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" /> Promo Banners
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearPromoBannerSeen(user?.id);
            setPreviewing(true);
          }}
        >
          <Eye className="h-4 w-4 mr-1" /> Preview
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
          <h3 className="text-sm font-semibold text-foreground">Upload New Banner</h3>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Banner image is shown at its natural aspect ratio — any size works.
          </p>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Image</Label>
            <Input ref={fileRef} type="file" accept="image/*" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ends at (local time)</Label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Display order</Label>
              <Input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Link URL (optional)</Label>
            <Input
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Caption (English, optional)</Label>
            <Input
              placeholder="e.g. TCS London Marathon 2027 — Save the date"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">說明文字 (中文, optional)</Label>
            <Input
              placeholder="例如：TCS 倫敦馬拉松 2027 — 請記下日期"
              value={captionZh}
              onChange={(e) => setCaptionZh(e.target.value)}
              maxLength={200}
            />
          </div>

          <Button onClick={handleUpload} disabled={uploading} size="sm">
            {uploading ? (
              <>
                <Upload className="h-4 w-4 mr-1 animate-pulse" /> Uploading...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Upload Banner
              </>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : banners.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No banners yet</p>
        ) : (
          <div className="space-y-3">
            {banners.map((b) => {
              const expired = isExpired(b.ends_at);
              return (
                <div
                  key={b.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                >
                  <img
                    src={b.image_url}
                    alt={b.caption || "Banner"}
                    className="w-20 h-20 rounded-md object-contain shrink-0 bg-muted"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-foreground line-clamp-1">
                        {b.caption || "(no caption)"}
                      </span>
                      {b.is_active && !expired && (
                        <Badge className="bg-primary text-primary-foreground text-[10px]">
                          Active
                        </Badge>
                      )}
                      {expired && (
                        <Badge variant="outline" className="text-[10px]">
                          Expired
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-5 w-5 text-[10px]"
                        onClick={() => handleQuickOrder(b, -1)}
                        title="Move up (lower order)"
                      >
                        −
                      </Button>
                      <span className="text-[11px] text-muted-foreground px-1">
                        Order: {b.display_order}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-5 w-5 text-[10px]"
                        onClick={() => handleQuickOrder(b, 1)}
                        title="Move down (higher order)"
                      >
                        +
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Ends: {new Date(b.ends_at).toLocaleString()}
                    </p>
                    {b.link_url && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Link: {b.link_url}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`pb-${b.id}`} className="text-[10px] text-muted-foreground">
                        {b.is_active ? "On" : "Off"}
                      </Label>
                      <Switch
                        id={`pb-${b.id}`}
                        checked={b.is_active}
                        onCheckedChange={(v) => handleToggle(b.id, v)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(b)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDelete(b)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Promo Banner</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <img
                src={editing.image_url}
                alt={editing.caption || "Banner"}
                className="w-full max-h-48 object-contain rounded-md bg-muted"
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Display order</Label>
                  <Input
                    type="number"
                    value={editDisplayOrder}
                    onChange={(e) => setEditDisplayOrder(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ends at</Label>
                  <Input
                    type="datetime-local"
                    value={editEndsAt}
                    onChange={(e) => setEditEndsAt(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Link URL</Label>
                <Input
                  placeholder="https://..."
                  value={editLinkUrl}
                  onChange={(e) => setEditLinkUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Caption (English)</Label>
                <Input
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">說明文字 (中文)</Label>
                <Input
                  value={editCaptionZh}
                  onChange={(e) => setEditCaptionZh(e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewing && (
        <PromoBanner lang="en" userId={user?.id} forceShow onClose={() => setPreviewing(false)} />
      )}
    </Card>
  );
};

export default PromoBannerManager;
