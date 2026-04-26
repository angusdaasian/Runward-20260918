import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Camera, Save, LogOut, Trash2, Mail, Pencil, Zap, Sparkles, Loader2 } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import { calculateRunningScore } from "@/lib/vdot";
import { Skeleton } from "@/components/ui/skeleton";
import { updateHeaderCache } from "@/components/AppHeader";
import { useActivities } from "@/hooks/use-activities";

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  age: number | null;
  sex: string | null;
  runs_per_week: number | null;
}

// Module-level cache to prevent flickering on tab switches
let _cachedProfile: Profile | null = null;
let _cachedPbs: PB[] | null = null;
let _cachedUserId: string | null = null;

const DISTANCES = ["1 Mile", "3000m", "5K", "10K", "Half Marathon", "Marathon"];

const PB_WORLD_RECORDS: Record<string, number> = {
  "1 Mile": 3 * 60 + 43.13,
  "3000m": 7 * 60 + 20.67,
  "3K": 7 * 60 + 20.67,
  "5K": 12 * 60 + 35,
  "10K": 26 * 60 + 24,
  "Half Marathon": 57 * 60 + 31,
  "Marathon": 2 * 3600 + 0 * 60 + 35,
};

const DISTANCE_TO_METERS: Record<string, number> = {
  "1500m": 1500,
  "1 Mile": 1609.34,
  "3000m": 3000,
  "3K": 3000,
  "5K": 5000,
  "10K": 10000,
  "Half Marathon": 21097.5,
  "Marathon": 42195,
};

interface PB {
  id: string;
  distance: string;
  hours: number;
  minutes: number;
  seconds: number;
}

const ProfileSection = ({ lang }: { lang: Lang }) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { activities } = useActivities();
  const [profile, setProfile] = useState<Profile | null>(
    _cachedUserId === user?.id ? _cachedProfile : null
  );
  const [pbs, setPbs] = useState<PB[]>(
    _cachedUserId === user?.id && _cachedPbs ? _cachedPbs : []
  );
  const [editName, setEditName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // New PB form
  const [newDist, setNewDist] = useState("");
  const [newH, setNewH] = useState("");
  const [newM, setNewM] = useState("");
  const [newS, setNewS] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setEditName(data.display_name || "");
          _cachedProfile = data;
          _cachedUserId = user.id;
          updateHeaderCache({ display_name: data.display_name, avatar_url: data.avatar_url }, user.id);
        }
      });
    supabase.from("personal_bests").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setPbs(data);
          _cachedPbs = data;
        }
      });
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    const path = `${user.id}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
    setProfile((p) => { const updated = p ? { ...p, avatar_url: publicUrl } : p; _cachedProfile = updated; if (updated && user) updateHeaderCache({ display_name: updated.display_name, avatar_url: updated.avatar_url }, user.id); return updated; });
    setUploading(false);
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: editName.trim() }).eq("user_id", user.id);
    setProfile((p) => { const updated = p ? { ...p, display_name: editName.trim() } : p; _cachedProfile = updated; if (updated && user) updateHeaderCache({ display_name: updated.display_name, avatar_url: updated.avatar_url }, user.id); return updated; });
    setSaving(false);
    toast({ title: "Saved!" });
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("emailUpdateSent", lang) });
      setEditingEmail(false);
      setNewEmail("");
    }
    setSavingEmail(false);
  };

  const isPBFasterThanWR = () => {
    if (!newDist) return false;
    const wr = PB_WORLD_RECORDS[newDist];
    if (!wr) return false;
    const entered = (parseInt(newH) || 0) * 3600 + (parseInt(newM) || 0) * 60 + (parseInt(newS) || 0);
    return entered > 0 && entered < wr;
  };

  const handleAddPB = async () => {
    if (!user || !newDist || isPBFasterThanWR()) return;
    const { data, error } = await supabase.from("personal_bests").insert({
      user_id: user.id,
      distance: newDist,
      hours: parseInt(newH) || 0,
      minutes: parseInt(newM) || 0,
      seconds: parseInt(newS) || 0,
    }).select().single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setPbs([data, ...pbs]);
    setNewDist("");
    setNewH("");
    setNewM("");
    setNewS("");
  };

  const handleDeletePB = async (id: string) => {
    await supabase.from("personal_bests").delete().eq("id", id);
    setPbs(pbs.filter((p) => p.id !== id));
  };

  // Detect PBs from activities (running only)
  const handleDetectPBs = async () => {
    if (!user) return;
    setDetecting(true);

    const runs = (activities || []).filter((a) => {
      const t = (a.sport_type || "").toLowerCase();
      return t.includes("run") && a.distance > 0 && a.moving_time > 0;
    });

    if (runs.length === 0) {
      toast({
        title: lang === "zh" ? "未找到跑步活動" : "No running activities found",
        variant: "destructive",
      });
      setDetecting(false);
      return;
    }

    // For each distance category, find best estimated time
    const detected: Record<string, { seconds: number }> = {};
    for (const dist of DISTANCES) {
      const targetMeters = DISTANCE_TO_METERS[dist];
      if (!targetMeters) continue;
      // Allow activities within 5% under target (e.g., 4.85K counts toward 5K)
      const minMeters = targetMeters * 0.95;
      let bestSeconds = Infinity;
      for (const a of runs) {
        if (a.distance < minMeters) continue;
        // Estimate time at target distance using average pace from activity
        const estSeconds = (targetMeters / a.distance) * a.moving_time;
        if (estSeconds > 0 && estSeconds < bestSeconds) bestSeconds = estSeconds;
      }
      // Skip if faster than world record (data error)
      const wr = PB_WORLD_RECORDS[dist];
      if (bestSeconds !== Infinity && (!wr || bestSeconds >= wr)) {
        detected[dist] = { seconds: Math.round(bestSeconds) };
      }
    }

    if (Object.keys(detected).length === 0) {
      toast({
        title: lang === "zh" ? "未發現新的個人最佳" : "No PBs detected",
        description: lang === "zh" ? "活動距離不足" : "No activities long enough",
      });
      setDetecting(false);
      return;
    }

    // Compare with existing PBs and only upsert improvements
    const updates: { distance: string; h: number; m: number; s: number }[] = [];
    for (const [dist, { seconds }] of Object.entries(detected)) {
      const existing = pbs.find((p) => p.distance === dist);
      const existingSec = existing
        ? existing.hours * 3600 + existing.minutes * 60 + existing.seconds
        : Infinity;
      if (seconds < existingSec) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        updates.push({ distance: dist, h, m, s });
      }
    }

    if (updates.length === 0) {
      toast({
        title: lang === "zh" ? "現有紀錄已是最佳" : "Existing PBs are already best",
      });
      setDetecting(false);
      return;
    }

    // Delete old PBs for the distances we're updating, then insert new ones
    const distancesToReplace = updates.map((u) => u.distance);
    const oldIds = pbs.filter((p) => distancesToReplace.includes(p.distance)).map((p) => p.id);
    if (oldIds.length > 0) {
      await supabase.from("personal_bests").delete().in("id", oldIds);
    }

    const { data: inserted } = await supabase
      .from("personal_bests")
      .insert(
        updates.map((u) => ({
          user_id: user.id,
          distance: u.distance,
          hours: u.h,
          minutes: u.m,
          seconds: u.s,
        }))
      )
      .select();

    const remainingPbs = pbs.filter((p) => !distancesToReplace.includes(p.distance));
    const newPbs = [...(inserted || []), ...remainingPbs];
    setPbs(newPbs);
    _cachedPbs = newPbs;

    toast({
      title: lang === "zh" ? `已更新 ${updates.length} 項個人最佳` : `Updated ${updates.length} PB${updates.length > 1 ? "s" : ""}`,
    });
    setDetecting(false);
  };


  const formatTime = (h: number, m: number, s: number) => {
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Calculate best running score from all PBs
  const runningScore = useMemo(() => {
    if (pbs.length === 0) return null;
    let best = 0;
    for (const pb of pbs) {
      const meters = DISTANCE_TO_METERS[pb.distance];
      if (!meters) continue;
      const totalSeconds = pb.hours * 3600 + pb.minutes * 60 + pb.seconds;
      if (totalSeconds <= 0) continue;
      const score = calculateRunningScore(meters, totalSeconds);
      if (score > best) best = score;
    }
    return best > 0 ? Math.round(best * 10) / 10 : null;
  }, [pbs]);

  if (!profile) return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-4 mb-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-lg font-display bg-primary/10 text-primary">
                {(profile.display_name || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 cursor-pointer">
              <Camera size={12} />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          </div>
          <div className="flex-1">
            <div className="flex gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-sm"
                placeholder="Display name"
              />
              <Button size="sm" variant="outline" onClick={handleSaveName} disabled={saving} className="h-8 px-2">
                <Save size={14} />
              </Button>
            </div>
            {/* Email display & edit */}
            <div className="mt-1.5">
              {editingEmail ? (
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-7 text-xs"
                    placeholder={t("newEmail", lang)}
                    autoFocus
                  />
                  <Button size="sm" variant="outline" onClick={handleUpdateEmail} disabled={savingEmail} className="h-7 px-2 text-xs">
                    <Save size={12} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingEmail(false)} className="h-7 px-2 text-xs">
                    ✕
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingEmail(true); setNewEmail(user?.email || ""); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <Mail size={11} />
                  <span>{user?.email}</span>
                  <Pencil size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {profile.age && <span>{profile.age} yrs</span>}
          {profile.sex && <span>{profile.sex}</span>}
          {profile.runs_per_week && <span>{profile.runs_per_week}x/week</span>}
        </div>
      </div>

      {/* Running Score */}
      {runningScore && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Zap size={20} className="text-primary" />
              </div>
              <div>
                <span className="text-sm font-medium text-foreground block">
                  {lang === "zh" ? "跑力指數" : "Running Score"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {lang === "zh" ? "根據你的最佳成績計算" : "Based on your best PB"}
                </span>
              </div>
            </div>
            <span className="text-3xl font-display font-bold text-primary">{runningScore}</span>
          </div>
        </div>
      )}

      {/* Personal Bests */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display font-semibold text-foreground mb-3">
          {lang === "zh" ? "個人最佳" : "Personal Bests"}
        </h3>

        {pbs.length > 0 && (
          <div className="space-y-2 mb-4">
            {pbs.map((pb) => (
              <div key={pb.id} className="flex items-center justify-between bg-accent rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-foreground">{pb.distance}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formatTime(pb.hours, pb.minutes, pb.seconds)}</span>
                  <button onClick={() => handleDeletePB(pb.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add PB Form */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {DISTANCES.map((d) => (
              <button
                key={d}
                onClick={() => setNewDist(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  newDist === d ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          {newDist && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="H" type="number" min={0} value={newH} onChange={(e) => setNewH(e.target.value)} className="text-center h-8 text-sm" />
                <Input placeholder="M" type="number" min={0} max={59} value={newM} onChange={(e) => setNewM(e.target.value)} className="text-center h-8 text-sm" />
                <Input placeholder="S" type="number" min={0} max={59} value={newS} onChange={(e) => setNewS(e.target.value)} className="text-center h-8 text-sm" />
                <Button size="sm" onClick={handleAddPB} disabled={isPBFasterThanWR()} className="h-8">Add</Button>
              </div>
              {isPBFasterThanWR() && (
                <p className="text-xs text-amber-500 font-medium">
                  {lang === "zh" ? "你比目前的世界紀錄還快！😅" : "You are faster than the current world record! 😅"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileSection;
