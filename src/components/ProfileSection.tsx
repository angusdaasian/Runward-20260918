import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Camera, Save, LogOut, Trash2, Mail, Pencil, Zap, Sparkles, Loader2, X, Heart, Trophy, ChevronRight, ChevronLeft, Award } from "lucide-react";
import BadgesPage from "@/components/BadgesPage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lang, t } from "@/lib/i18n";
import { calculateRunningScore } from "@/lib/vdot";
import { Skeleton } from "@/components/ui/skeleton";
import { updateHeaderCache } from "@/components/AppHeader";
import { useActivities } from "@/hooks/use-activities";
import HeartRateZonesCard from "@/components/HeartRateZonesCard";
import { ZONE_LABELS, zoneBoundaries, estimateMaxHr, estimateRestingHr } from "@/lib/hrZones";

const ZONE_INFO: Array<{ key: string; name: string; nameZh: string; desc: string; descZh: string }> = [
  { key: "z1", name: "Recovery", nameZh: "恢復", desc: "Easy effort for warm-ups, cool-downs, and active recovery.", descZh: "輕鬆配速，適合熱身、緩和及主動恢復。" },
  { key: "z2", name: "Endurance", nameZh: "耐力", desc: "Comfortable effort that burns fat and builds endurance.", descZh: "舒適配速，燃燒脂肪並建立耐力基礎。" },
  { key: "z3", name: "Tempo", nameZh: "節奏", desc: "Challenging but sustainable. Improves aerobic fitness and muscle strength.", descZh: "具挑戰但可持續，提升有氧能力與肌力。" },
  { key: "z4", name: "Threshold", nameZh: "乳酸閾", desc: "Hard effort. Builds speed and power while training your body to tolerate lactic acid.", descZh: "高強度，提升速度與耐乳酸能力。" },
  { key: "z5", name: "Anaerobic", nameZh: "無氧", desc: "Maximum effort. Pushes your body to its limit — best kept for short bursts.", descZh: "極限強度，僅適合短時間衝刺。" },
];

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  age: number | null;
  sex: string | null;
  runs_per_week: number | null;
  max_heartrate: number | null;
  resting_heartrate: number | null;
  custom_hr_zones: number[] | null;
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

export type ProfileSubpage = "main" | "hr-zones" | "personal-bests" | "edit-profile" /* | "badges" */;

interface ProfileSectionProps {
  lang: Lang;
  subpage?: ProfileSubpage;
  onNavigate?: (sub: ProfileSubpage) => void;
}

const ProfileSection = ({ lang, subpage = "main", onNavigate }: ProfileSectionProps) => {
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

  // Onboarding info editing
  const [editingInfo, setEditingInfo] = useState(false);
  const [editAge, setEditAge] = useState("");
  const [editSex, setEditSex] = useState<string>("");
  const [editRpw, setEditRpw] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // New PB form
  const [newDist, setNewDist] = useState("");
  const [newH, setNewH] = useState("");
  const [newM, setNewM] = useState("");
  const [newS, setNewS] = useState("");
  const [hrEditMode, setHrEditMode] = useState(false);

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

  const handlePickPreset = async (url: string) => {
    if (!user) return;
    setUploading(true);
    await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
    setProfile((p) => {
      const updated = p ? { ...p, avatar_url: url } : p;
      _cachedProfile = updated;
      if (updated && user) updateHeaderCache({ display_name: updated.display_name, avatar_url: updated.avatar_url }, user.id);
      return updated;
    });
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

  const startEditInfo = () => {
    setEditAge(profile?.age != null ? String(profile.age) : "");
    setEditSex(profile?.sex || "");
    setEditRpw(profile?.runs_per_week != null ? String(profile.runs_per_week) : "");
    setEditingInfo(true);
  };

  const handleSaveInfo = async () => {
    if (!user) return;
    setSavingInfo(true);
    const ageNum = editAge ? parseInt(editAge) : null;
    const rpwNum = editRpw ? parseInt(editRpw) : null;
    const sexVal = editSex || null;
    const updates = {
      age: Number.isFinite(ageNum as number) ? ageNum : null,
      sex: sexVal,
      runs_per_week: Number.isFinite(rpwNum as number) ? rpwNum : null,
    };
    const { error } = await supabase.from("profiles").update(updates).eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProfile((p) => {
        const updated = p ? { ...p, ...updates } : p;
        _cachedProfile = updated;
        return updated;
      });
      setEditingInfo(false);
      toast({ title: lang === "zh" ? "已儲存" : "Saved!" });
    }
    setSavingInfo(false);
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

    // For each distance category, find best actual time from activities
    // that are within ±5% of the target distance
    const detected: Record<string, { seconds: number }> = {};
    for (const dist of DISTANCES) {
      const targetMeters = DISTANCE_TO_METERS[dist];
      if (!targetMeters) continue;
      const minMeters = targetMeters * 0.95;
      const maxMeters = targetMeters * 1.05;
      let bestSeconds = Infinity;
      for (const a of runs) {
        if (a.distance < minMeters || a.distance > maxMeters) continue;
        // Use actual moving time, no recalculation
        if (a.moving_time > 0 && a.moving_time < bestSeconds) bestSeconds = a.moving_time;
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

  if (!profile && subpage !== "main") {
    return (
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
  }

  // ── Subpage: Heart Rate Zones ──
  if (subpage === "hr-zones") {
    const effMax = estimateMaxHr(profile.age, profile.max_heartrate);
    const effRest = estimateRestingHr(profile.resting_heartrate);
    const bounds = zoneBoundaries(effMax, effRest, profile.custom_hr_zones);
    const lowers = [bounds.z1, bounds.z2, bounds.z3, bounds.z4, bounds.z5];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => (hrEditMode ? setHrEditMode(false) : onNavigate?.("main"))}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={16} />
            {lang === "zh" ? "返回" : "Back"}
          </button>
          <h2 className="font-display text-base font-bold text-foreground">
            {lang === "zh" ? "心率區間" : "Heart rate zones"}
          </h2>
          {!hrEditMode ? (
            <button
              onClick={() => setHrEditMode(true)}
              className="text-sm font-medium text-primary hover:underline"
            >
              {lang === "zh" ? "編輯" : "Edit"}
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>

        {hrEditMode ? (
          <HeartRateZonesCard
            lang={lang}
            initialAge={profile.age}
            initialMaxHr={profile.max_heartrate}
            initialRestingHr={profile.resting_heartrate}
            initialCustomZones={profile.custom_hr_zones}
            onSaved={(maxHr, restingHr, customZones) => {
              setProfile((p) => {
                const updated = p ? { ...p, max_heartrate: maxHr, resting_heartrate: restingHr, custom_hr_zones: customZones } : p;
                _cachedProfile = updated;
                return updated;
              });
              setHrEditMode(false);
            }}
          />
        ) : (
          <>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {lang === "zh"
                ? "心率（HR）監測是衡量訓練強度最可靠的方式之一。由於最大心率受年齡影響，我們會根據你的資料計算個人化的訓練區間，協助你掌握每次訓練的努力程度。"
                : "Monitoring your heart rate (HR) is one of the most reliable ways to measure workout intensity. Because maximum heart rate is influenced by age, we use your profile to calculate personalised training zones that guide your effort."}
            </p>

            <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
              {ZONE_INFO.map((z, i) => {
                const color = ZONE_LABELS[i].color;
                const lower = lowers[i];
                const isLast = i === ZONE_INFO.length - 1;
                return (
                  <div key={z.key}>
                    <div className="flex gap-3">
                      <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-foreground text-base">
                          {`${lang === "zh" ? "區間" : "Zone"} ${i + 1}: ${lang === "zh" ? z.nameZh : z.name}`}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {lang === "zh" ? z.descZh : z.desc}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 h-px bg-border" />
                      {isLast ? (
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground mr-1">Max</span>
                          <span className="font-display font-bold text-xl text-foreground tabular-nums">{effMax}</span>
                          <span className="text-xs font-semibold text-muted-foreground ml-1">BPM</span>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="font-display font-bold text-xl text-foreground tabular-nums">{lowers[i + 1]}</span>
                          <span className="text-xs font-semibold text-muted-foreground ml-1">BPM</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              {profile.custom_hr_zones && profile.custom_hr_zones.length === 5
                ? (lang === "zh" ? "使用自訂區間" : "Using custom zones")
                : (lang === "zh"
                    ? `基於 %HRR · 最大 ${effMax} / 靜息 ${effRest} bpm`
                    : `Based on %HRR · max ${effMax} / rest ${effRest} bpm`)}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Subpage: Personal Bests ──
  if (subpage === "personal-bests") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => onNavigate?.("main")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} />
          {lang === "zh" ? "返回" : "Back"}
        </button>
        <h2 className="font-display text-2xl font-bold text-foreground">
          {lang === "zh" ? "個人最佳" : "Personal Bests"}
        </h2>

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

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">
              {lang === "zh" ? "個人最佳" : "Personal Bests"}
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDetectPBs}
              disabled={detecting}
              className="h-7 text-xs gap-1.5"
            >
              {detecting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {lang === "zh" ? "從活動偵測" : "Detect from activities"}
            </Button>
          </div>

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
  }

  // ── Subpage: Badges (commented out for later release) ──
  // if (subpage === "badges") {
  //   return <BadgesPage lang={lang} onBack={() => onNavigate?.("main")} />;
  // }

  // ── Subpage: Edit Profile ──
  if (subpage === "edit-profile") {
    const RPW_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate?.("main")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={16} />
            {lang === "zh" ? "返回" : "Back"}
          </button>
          <h2 className="font-display text-base font-bold text-foreground">
            {lang === "zh" ? "編輯個人資料" : "Edit Profile"}
          </h2>
          <span className="w-10" />
        </div>

        {/* Avatar */}
        <div className="flex justify-center">
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl font-display bg-primary/10 text-primary">
                {(profile.display_name || "U")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label className="absolute bottom-0 right-0 bg-foreground text-background rounded-full p-1.5 cursor-pointer shadow">
              <Pencil size={12} />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Preset avatars */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {lang === "zh" ? "選擇頭像" : "Pick an avatar"}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => {
              const url = `/avatars/runner-${n}.png`;
              const selected = profile.avatar_url === url;
              const animClass = n % 2 === 0 ? "animate-runner-bob-slow" : "animate-runner-bob";
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => handlePickPreset(url)}
                  disabled={uploading}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all bg-gradient-to-br from-primary/5 to-primary/10 ${selected ? "border-primary ring-2 ring-primary/30 scale-105" : "border-border hover:border-primary/60 hover:scale-105"} disabled:opacity-50`}
                >
                  <img
                    src={url}
                    alt={`Runner ${n}`}
                    loading="lazy"
                    width={512}
                    height={512}
                    className={`w-full h-full object-contain ${animClass}`}
                    style={{ animationDelay: `${n * 0.13}s` }}
                  />
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            {lang === "zh" ? "或點擊上方鉛筆圖示上載自訂相片" : "Or tap the pencil above to upload your own"}
          </p>
        </div>


        {/* Display Name */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {lang === "zh" ? "顯示名稱" : "Name"}
          </label>
          <div className="flex gap-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-12 bg-card border-border"
              placeholder={lang === "zh" ? "顯示名稱" : "Display name"}
            />
            <Button onClick={handleSaveName} disabled={saving} className="h-12 px-4">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            </Button>
          </div>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {lang === "zh" ? "電子郵件" : "Email"}
          </label>
          <div className="h-12 bg-card border border-border rounded-md px-3 flex items-center text-sm text-muted-foreground">
            {user?.email}
          </div>
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {lang === "zh" ? "性別" : "Gender"}
          </label>
          <Select
            value={profile.sex || ""}
            onValueChange={async (v) => {
              if (!user) return;
              await supabase.from("profiles").update({ sex: v }).eq("user_id", user.id);
              setProfile((p) => { const u = p ? { ...p, sex: v } : p; _cachedProfile = u; return u; });
            }}
          >
            <SelectTrigger className="h-12 bg-card border-border">
              <SelectValue placeholder={lang === "zh" ? "選擇" : "Select"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{lang === "zh" ? "男" : "Male"}</SelectItem>
              <SelectItem value="female">{lang === "zh" ? "女" : "Female"}</SelectItem>
              <SelectItem value="other">{lang === "zh" ? "其他" : "Other"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Age */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {lang === "zh" ? "年齡" : "Age"}
          </label>
          <Input
            type="number"
            min={1}
            max={120}
            defaultValue={profile.age ?? ""}
            onBlur={async (e) => {
              if (!user) return;
              const v = e.target.value ? parseInt(e.target.value) : null;
              await supabase.from("profiles").update({ age: v }).eq("user_id", user.id);
              setProfile((p) => { const u = p ? { ...p, age: v } : p; _cachedProfile = u; return u; });
            }}
            className="h-12 bg-card border-border"
          />
        </div>

        {/* Runs per week */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {lang === "zh" ? "每週跑步次數" : "Runs per week"}
          </label>
          <Select
            value={profile.runs_per_week ? String(profile.runs_per_week) : ""}
            onValueChange={async (v) => {
              if (!user) return;
              const n = parseInt(v);
              await supabase.from("profiles").update({ runs_per_week: n }).eq("user_id", user.id);
              setProfile((p) => { const u = p ? { ...p, runs_per_week: n } : p; _cachedProfile = u; return u; });
            }}
          >
            <SelectTrigger className="h-12 bg-card border-border">
              <SelectValue placeholder={lang === "zh" ? "選擇" : "Select"} />
            </SelectTrigger>
            <SelectContent>
              {RPW_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {lang === "zh" ? "次/週" : `time${n > 1 ? "s" : ""}/week`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Centered Profile Header */}
      <div className="flex flex-col items-center pt-2 pb-2">
        <Avatar className="h-24 w-24 ring-4 ring-primary/30">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="text-2xl font-display bg-primary/10 text-primary">
            {(profile?.display_name || "U")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h2 className="mt-3 font-display text-2xl font-bold text-foreground">
          {profile?.display_name || (lang === "zh" ? "使用者" : "User")}
        </h2>
        {user?.created_at && (
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "zh"
              ? `加入於 ${new Date(user.created_at).toLocaleDateString("zh-TW", { year: "numeric", month: "long" })}`
              : `Joined ${new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short" })}`}
          </p>
        )}
        <button
          onClick={() => onNavigate?.("edit-profile")}
          className="mt-3 bg-foreground text-background font-semibold text-xs tracking-wider uppercase rounded-full px-6 py-2.5 hover:opacity-90 transition-opacity"
        >
          {lang === "zh" ? "編輯個人資料" : "Edit Profile"}
        </button>
      </div>

      {/* Badges — navigation row (commented out for later release) */}
      {/* <button
        onClick={() => onNavigate?.("badges")}
        className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Award size={20} className="text-amber-500" />
          <div className="text-left">
            <span className="font-medium text-foreground block">
              {lang === "zh" ? "成就" : "Achievements"}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground" />
      </button> */}

      {/* Heart Rate Zones — navigation row */}
      <button
        onClick={() => onNavigate?.("hr-zones")}
        className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Heart size={20} className="text-destructive" />
          <div className="text-left">
            <span className="font-medium text-foreground block">
              {lang === "zh" ? "心率區間" : "Heart Rate Zones"}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground" />
      </button>

      {/* Personal Bests — navigation row */}
      <button
        onClick={() => onNavigate?.("personal-bests")}
        className="w-full bg-card border border-border rounded-xl p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Trophy size={20} className="text-primary" />
          <div className="text-left">
            <span className="font-medium text-foreground block">
              {lang === "zh" ? "個人最佳" : "Personal Bests"}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground" />
      </button>
    </div>
  );
};

const HrZonesScrollTarget = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);

  const focus = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-primary");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
    if (window.location.hash === "#hr-zones") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  useEffect(() => {
    if (window.location.hash === "#hr-zones") {
      setTimeout(focus, 100);
    }
    const onHash = () => {
      if (window.location.hash === "#hr-zones") focus();
    };
    const onCustom = () => focus();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("focus-hr-zones", onCustom);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("focus-hr-zones", onCustom);
    };
  }, []);

  return (
    <div id="hr-zones" ref={ref} className="rounded-xl transition-all">
      {children}
    </div>
  );
};

export default ProfileSection;
