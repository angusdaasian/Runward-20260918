import { useEffect, useState } from "react";
import { AlertOctagon, Info, Megaphone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AnnouncementLevel = "info" | "important" | "urgent";

interface Announcement {
  id: string;
  title: string;
  message: string;
  title_zh: string | null;
  message_zh: string | null;
  level: AnnouncementLevel;
}

const DISMISS_KEY = "rw_dismissed_announcements";

const readDismissed = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; }
};

const styles: Record<AnnouncementLevel, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-primary/35 bg-primary/10", icon: "bg-primary/15 text-primary", Icon: Megaphone },
  important: { box: "border-warning/35 bg-warning/10", icon: "bg-warning/20 text-warning", Icon: Info },
  urgent: { box: "border-destructive/35 bg-destructive/10", icon: "bg-destructive/15 text-destructive", Icon: AlertOctagon },
};

const AnnouncementBanner = ({ lang }: { lang: Lang }) => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    let active = true;
    (supabase as any)
      .from("announcements")
      .select("id, title, message, title_zh, message_zh, level, display_order, created_at")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (active && !error) setItems((data as Announcement[]) ?? []);
      });
    return () => { active = false; };
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  };

  // Urgent alerts can't be dismissed so they stay visible until an admin turns them off.
  const visible = items.filter((a) => a.level === "urgent" || !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-5 space-y-3">
      {visible.map((a) => {
        const s = styles[a.level] ?? styles.info;
        const title = lang === "zh" && a.title_zh ? a.title_zh : a.title;
        const message = lang === "zh" && a.message_zh ? a.message_zh : a.message;
        return (
          <div key={a.id} className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3", s.box)}>
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", s.icon)}>
              <s.Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{message}</p>
            </div>
            {a.level !== "urgent" && (
              <button
                onClick={() => dismiss(a.id)}
                aria-label={lang === "zh" ? "關閉" : "Dismiss"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AnnouncementBanner;
