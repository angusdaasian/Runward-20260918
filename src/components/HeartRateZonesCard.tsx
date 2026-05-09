import { useEffect, useMemo, useState } from "react";
import { Heart, Save, Loader2, Info, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lang } from "@/lib/i18n";
import { ZONE_LABELS, zoneBoundaries, estimateMaxHr, estimateRestingHr, isValidCustomZones } from "@/lib/hrZones";

interface Props {
  lang: Lang;
  initialAge: number | null;
  initialMaxHr: number | null;
  initialRestingHr: number | null;
  initialCustomZones?: number[] | null;
  onSaved?: (maxHr: number, restingHr: number, customZones: number[] | null) => void;
}

const HeartRateZonesCard = ({ lang, initialAge, initialMaxHr, initialRestingHr, initialCustomZones, onSaved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [age, setAge] = useState<string>(initialAge ? String(initialAge) : "");
  const [maxHr, setMaxHr] = useState<string>(initialMaxHr ? String(initialMaxHr) : "");
  const [restHr, setRestHr] = useState<string>(initialRestingHr ? String(initialRestingHr) : "");
  const [useManual, setUseManual] = useState<boolean>(!!(initialCustomZones && initialCustomZones.length === 5));
  const [zones, setZones] = useState<string[]>(
    initialCustomZones && initialCustomZones.length === 5
      ? initialCustomZones.map(String)
      : ["", "", "", "", ""]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAge(initialAge ? String(initialAge) : "");
    setMaxHr(initialMaxHr ? String(initialMaxHr) : "");
    setRestHr(initialRestingHr ? String(initialRestingHr) : "");
    setUseManual(!!(initialCustomZones && initialCustomZones.length === 5));
    setZones(
      initialCustomZones && initialCustomZones.length === 5
        ? initialCustomZones.map(String)
        : ["", "", "", "", ""]
    );
  }, [initialAge, initialMaxHr, initialRestingHr, initialCustomZones]);

  const ageNum = parseInt(age) || null;
  const maxHrNum = parseInt(maxHr) || null;
  const restHrNum = parseInt(restHr) || null;

  const effectiveMaxHr = estimateMaxHr(ageNum, maxHrNum);
  const effectiveRestHr = estimateRestingHr(restHrNum);

  // Auto-fill manual zones from computed defaults the first time the user toggles it on.
  const computedDefaults = useMemo(() => zoneBoundaries(effectiveMaxHr, effectiveRestHr), [effectiveMaxHr, effectiveRestHr]);
  const handleToggleManual = (next: boolean) => {
    setUseManual(next);
    if (next && zones.every((z) => !z)) {
      setZones([
        String(computedDefaults.z1),
        String(computedDefaults.z2),
        String(computedDefaults.z3),
        String(computedDefaults.z4),
        String(computedDefaults.z5),
      ]);
    }
  };

  const parsedZones = useMemo(() => zones.map((z) => parseInt(z)), [zones]);
  const manualValid = useMemo(() => isValidCustomZones(parsedZones), [parsedZones]);

  const previewBounds = useManual && manualValid
    ? { z1: parsedZones[0], z2: parsedZones[1], z3: parsedZones[2], z4: parsedZones[3], z5: parsedZones[4] }
    : computedDefaults;

  const handleEstimate = () => {
    if (!ageNum || ageNum < 5 || ageNum > 110) {
      toast({
        title: lang === "zh" ? "請輸入有效年齡" : "Enter a valid age",
        variant: "destructive",
      });
      return;
    }
    setMaxHr(String(210 - ageNum));
  };

  const handleResetToDefault = () => {
    setZones([
      String(computedDefaults.z1),
      String(computedDefaults.z2),
      String(computedDefaults.z3),
      String(computedDefaults.z4),
      String(computedDefaults.z5),
    ]);
  };

  const handleSave = async () => {
    if (!user) return;
    if (maxHrNum && (maxHrNum < 100 || maxHrNum > 230)) {
      toast({
        title: lang === "zh" ? "最大心率應在 100–230 之間" : "Max HR must be between 100–230",
        variant: "destructive",
      });
      return;
    }
    if (restHrNum && (restHrNum < 30 || restHrNum > 110)) {
      toast({
        title: lang === "zh" ? "靜息心率應在 30–110 之間" : "Resting HR must be between 30–110",
        variant: "destructive",
      });
      return;
    }
    if (useManual && !manualValid) {
      toast({
        title: lang === "zh" ? "自訂區間需為遞增整數" : "Manual zones must be ascending integers",
        description: lang === "zh" ? "請輸入 5 個遞增的 bpm 值" : "Enter 5 ascending bpm values",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const customToSave = useManual && manualValid ? parsedZones : null;
    const updates: any = {
      max_heartrate: maxHrNum,
      resting_heartrate: restHrNum,
      custom_hr_zones: customToSave,
    };
    if (ageNum && ageNum >= 5 && ageNum <= 110) updates.age = ageNum;

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: lang === "zh" ? "已儲存" : "Saved",
      description: lang === "zh" ? "心率區間已更新" : "Heart rate zones updated",
    });
    onSaved?.(maxHrNum ?? effectiveMaxHr, restHrNum ?? effectiveRestHr, customToSave);
  };

  const zoneRanges: Array<{ from: number; to: number | null }> = [
    { from: previewBounds.z1, to: previewBounds.z2 - 1 },
    { from: previewBounds.z2, to: previewBounds.z3 - 1 },
    { from: previewBounds.z3, to: previewBounds.z4 - 1 },
    { from: previewBounds.z4, to: previewBounds.z5 - 1 },
    { from: previewBounds.z5, to: null },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Heart size={16} className="text-destructive" />
        <h3 className="font-display font-bold text-sm text-foreground">
          {lang === "zh" ? "心率區間 (Karvonen %HRR)" : "Heart Rate Zones (Karvonen %HRR)"}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        {lang === "zh"
          ? "區間以 %HRR 計算：目標心率 = 靜息 + %HRR × (最大 − 靜息)。若不知最大心率，可由年齡估算 (210 − 年齡)。"
          : "Zones use %HRR (Karvonen): target HR = rest + %HRR × (max − rest). If you don't know your max HR, estimate from age (210 − age)."}
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            {lang === "zh" ? "年齡" : "Age"}
          </label>
          <Input type="number" inputMode="numeric" min={5} max={110} value={age}
            onChange={(e) => setAge(e.target.value)} placeholder="35" className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            {lang === "zh" ? "最大" : "Max HR"}
          </label>
          <Input type="number" inputMode="numeric" min={100} max={230} value={maxHr}
            onChange={(e) => setMaxHr(e.target.value)} placeholder="185" className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            {lang === "zh" ? "靜息" : "Resting"}
          </label>
          <Input type="number" inputMode="numeric" min={30} max={110} value={restHr}
            onChange={(e) => setRestHr(e.target.value)} placeholder="60" className="h-9 text-sm" />
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Button type="button" variant="outline" size="sm" onClick={handleEstimate}
          disabled={!ageNum} className="flex-1 h-9 text-xs">
          {lang === "zh" ? "估算最大 (210 − 年齡)" : "Estimate max (210 − age)"}
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="flex-1 h-9 text-xs">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} className="mr-1" />}
          {lang === "zh" ? "儲存" : "Save"}
        </Button>
      </div>

      {/* Manual override */}
      <div className="border-t border-border pt-3 mb-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Settings2 size={13} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              {lang === "zh" ? "自訂區間 (手動 bpm)" : "Manual zones (custom bpm)"}
            </span>
          </div>
          <Switch checked={useManual} onCheckedChange={handleToggleManual} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
          {lang === "zh"
            ? "啟用後將以你輸入的 bpm 下限取代 %HRR 計算。"
            : "When on, your bpm lower bounds replace the %HRR computation."}
        </p>
        {useManual && (
          <>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {ZONE_LABELS.map((z, i) => (
                <div key={z.key}>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-0.5 text-center">
                    {z.key.toUpperCase()}
                  </label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={30}
                    max={230}
                    value={zones[i]}
                    onChange={(e) => {
                      const next = [...zones];
                      next[i] = e.target.value;
                      setZones(next);
                    }}
                    className="h-9 text-sm text-center px-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${manualValid ? "text-muted-foreground" : "text-destructive"}`}>
                {manualValid
                  ? (lang === "zh" ? "下限 bpm，需遞增" : "Lower bounds in bpm, ascending")
                  : (lang === "zh" ? "需為 5 個遞增整數" : "Must be 5 ascending integers")}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={handleResetToDefault} className="h-7 text-[11px]">
                {lang === "zh" ? "重設為預設" : "Reset to default"}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="bg-muted/40 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Info size={11} className="text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground">
            {useManual && manualValid
              ? (lang === "zh" ? "預覽 · 自訂區間" : "Preview · custom zones")
              : (lang === "zh"
                  ? `預覽 · 最大 ${effectiveMaxHr} / 靜息 ${effectiveRestHr} bpm`
                  : `Preview · max ${effectiveMaxHr} / rest ${effectiveRestHr} bpm`)}
          </span>
        </div>
        <div className="space-y-1.5">
          {ZONE_LABELS.map((z, i) => {
            const r = zoneRanges[i];
            return (
              <div key={z.key} className="flex items-center gap-2 text-xs">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: z.color }} />
                <span className="font-semibold text-foreground w-24 shrink-0">
                  {lang === "zh" ? z.labelZh : z.label}
                </span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {r.from} – {r.to ?? "max"} bpm
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HeartRateZonesCard;
