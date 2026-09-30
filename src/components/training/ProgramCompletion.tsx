import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Trophy, ChevronRight, CheckCircle2, XCircle, AlertCircle, CalendarClock, Sparkles, TrendingUp, Wrench } from "lucide-react";

type Lang = "en" | "zh" | string;

interface Props {
  lang: Lang;
  existingPlan: any | null;
  onArchived: () => void;
}

function planEndDate(p: any): string | null {
  if (!p) return null;
  if (p.race_date) return String(p.race_date);
  const dates = (p.plan_data || []).flatMap((w: any) => (w?.days || []).map((d: any) => d.date)).filter(Boolean).sort();
  return dates[dates.length - 1] || null;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDiff(sec: number, zh: boolean) {
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
  const str = h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  if (sec <= 0) return zh ? `比目標快 ${str}` : `${str} faster than target`;
  return zh ? `比目標慢 ${str}` : `${str} slower than target`;
}

const distLabel = (d: string | null, zh: boolean) =>
  d === "FM" ? (zh ? "全馬" : "Marathon") : d === "HM" ? (zh ? "半馬" : "Half Marathon") : d === "TR" ? (zh ? "越野賽" : "Trail") : d || "";

export default function ProgramCompletion({ lang, existingPlan, onArchived }: Props) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const { toast } = useToast();
  const [past, setPast] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [finishing, setFinishing] = useState(false);

  const loadPast = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("completed_programs" as any) as any)
      .select("*").eq("user_id", user.id).order("completed_at", { ascending: false });
    setPast((data as any[]) || []);
  }, [user]);

  useEffect(() => { void loadPast(); }, [loadPast]);

  const end = planEndDate(existingPlan);
  const finished = !!existingPlan && !!end && end <= localToday();

  const finish = async () => {
    if (!existingPlan) return;
    setFinishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("program-completion-report", {
        body: { plan_id: existingPlan.id, lang },
      });
      if (error || !data?.program) {
        let msg = (data as any)?.error;
        try { msg = msg || (await (error as any)?.context?.json())?.error; } catch { /* ignore */ }
        throw new Error(msg || (zh ? "無法生成報告" : "Could not generate report"));
      }
      setOpen(data.program);
      await loadPast();
      onArchived();
    } catch (e: any) {
      toast({ title: zh ? "錯誤" : "Error", description: e.message, variant: "destructive" });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="mb-5 space-y-4">
      {finished && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={18} className="text-primary" />
            <h3 className="font-display font-bold text-foreground">{zh ? "訓練計劃已完成！" : "Program complete!"}</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {zh
              ? "結束計劃後，它會移到過往紀錄，並生成一份完整的 AI 回顧報告（每個計劃只會生成一次）。請先確認比賽已同步。"
              : "Finishing moves this plan to your past programs and creates an in-depth AI review (generated once per program). Make sure your race has synced first."}
          </p>
          <Button onClick={finish} disabled={finishing} className="w-full">
            {finishing ? <><Loader2 className="animate-spin mr-2" size={16} />{zh ? "正在分析整個計劃…" : "Analysing your whole program…"}</> : (zh ? "結束計劃並查看報告" : "Finish program & see report")}
          </Button>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{zh ? "過往訓練計劃" : "Past programs"}</h3>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {past.map((p) => {
              const r = p.report?.race || {};
              return (
                <button key={p.id} onClick={() => setOpen(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors min-h-[44px]">
                  <Trophy size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {r.name || distLabel(p.distance, zh)} {p.race_date ? `· ${p.race_date}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.actual_label ? `${r.actual_label}${r.target_label ? ` / ${zh ? "目標" : "target"} ${r.target_label}` : ""}` : `${p.weeks ?? ""} ${zh ? "週" : "weeks"}`}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl">
          {open && <Report program={open} zh={zh} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Report({ program, zh }: { program: any; zh: boolean }) {
  const rep = program.report || {};
  const race = rep.race || {};
  const ai = program.ai_analysis || {};
  const keys: any[] = rep.key_sessions || [];
  const missed = keys.filter((k) => k.status === "missed");
  const moved = keys.filter((k) => k.status === "done_other_day");
  const partial = keys.filter((k) => k.status === "partial");

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display">{zh ? "訓練計劃完成報告" : "Program completion report"}</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground -mt-2">
        {race.name || distLabel(program.distance, zh)} · {rep.start_date} → {rep.end_date}
      </p>

      {/* Race result */}
      <section className="rounded-xl bg-muted p-4">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="text-xs text-muted-foreground">{zh ? "目標時間" : "Target"}</div>
            <div className="font-display text-xl font-bold text-foreground">{race.target_label || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{zh ? "實際時間" : "Actual"}</div>
            <div className="font-display text-xl font-bold text-foreground">{race.actual_label || "—"}</div>
          </div>
        </div>
        {race.diff_seconds != null && (
          <div className={`mt-2 text-center text-sm font-semibold ${race.diff_seconds <= 0 ? "text-primary" : "text-destructive"}`}>
            {fmtDiff(race.diff_seconds, zh)}
          </div>
        )}
        {!race.actual_label && (
          <div className="mt-2 text-center text-xs text-muted-foreground">{zh ? "未找到比賽當天的紀錄" : "No race-day activity was found"}</div>
        )}
      </section>

      {/* Totals */}
      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label={zh ? "計劃公里" : "Planned km"} value={rep.planned_km} />
        <Stat label={zh ? "實際公里" : "Actual km"} value={rep.actual_km} />
        <Stat label={zh ? "重點課完成" : "Key sessions"} value={`${rep.key_sessions_done ?? 0}/${rep.key_sessions_total ?? 0}`} />
      </section>

      {/* Key sessions */}
      <section>
        <h4 className="text-sm font-semibold text-foreground mb-2">{zh ? "錯過的重點課" : "Missed key sessions"}</h4>
        {missed.length === 0 ? (
          <p className="text-sm text-primary flex items-center gap-1"><CheckCircle2 size={14} />{zh ? "沒有錯過任何重點課！" : "You didn't miss any key session!"}</p>
        ) : (
          <ul className="space-y-1.5">
            {missed.map((k, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <XCircle size={14} className="text-destructive mt-0.5 shrink-0" />
                <span className="text-foreground">{zh ? `第 ${k.week} 週` : `Week ${k.week}`} · {k.title || k.type}{k.planned_km ? ` ${k.planned_km} km` : ""} <span className="text-muted-foreground">({k.planned_date})</span></span>
              </li>
            ))}
          </ul>
        )}
        {partial.length > 0 && (
          <ul className="space-y-1.5 mt-2">
            {partial.map((k, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertCircle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-foreground">{zh ? `第 ${k.week} 週 部分完成` : `Week ${k.week} partly done`} · {k.title || k.type}: {k.actual_km}/{k.planned_km} km</span>
              </li>
            ))}
          </ul>
        )}
        {moved.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <CalendarClock size={12} />
            {zh ? `${moved.length} 節重點課在同一週的其他日子完成，已計為完成。` : `${moved.length} key session(s) were done on another day in the same week and count as completed.`}
          </p>
        )}
      </section>

      {/* AI analysis */}
      {ai.headline && <p className="font-display font-semibold text-foreground flex gap-2"><Sparkles size={16} className="text-primary shrink-0 mt-1" />{ai.headline}</p>}
      {ai.summary && <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{ai.summary}</p>}
      <ItemList icon={<TrendingUp size={14} className="text-primary" />} title={zh ? "優勢" : "Strengths"} items={ai.strengths} />
      <ItemList icon={<Wrench size={14} className="text-muted-foreground" />} title={zh ? "可改進之處" : "Areas to improve"} items={ai.improvements} />
      {Array.isArray(ai.next_steps) && ai.next_steps.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-2">{zh ? "下個計劃建議" : "For your next program"}</h4>
          <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
            {ai.next_steps.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-muted p-2.5">
      <div className="font-display text-lg font-bold text-foreground">{value ?? "—"}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ItemList({ icon, title, items }: { icon: React.ReactNode; title: string; items: any }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <section>
      <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">{icon}{title}</h4>
      <ul className="space-y-2">
        {items.map((it: any, i: number) => (
          <li key={i} className="rounded-xl border border-border p-3">
            <div className="text-sm font-semibold text-foreground">{typeof it === "string" ? it : it.title}</div>
            {typeof it !== "string" && it.detail && <div className="text-sm text-muted-foreground mt-0.5">{it.detail}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
