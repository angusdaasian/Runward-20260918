import { Clock, Heart, MessageCircle, Mountain, Route } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Lang } from "@/lib/i18n";

export interface FeedRun {
  source: string;
  source_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  started_at: string;
  activity_name: string | null;
  activity_type: string | null;
  distance_km: number;
  duration_s: number | null;
  elevation_m: number | null;
}

const duration = (seconds: number | null) => {
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export interface FeedRunSocial { like_count?: number; comment_count?: number; liked_by_me?: boolean }

export default function FeedRunCard({ run, lang, isSelf, footer, social, onOpen }: { run: FeedRun; lang: Lang; isSelf: boolean; footer?: string; social?: FeedRunSocial; onOpen: () => void }) {
  const zh = lang === "zh";
  return (
    <article className={`overflow-hidden rounded-lg border bg-card ${isSelf ? "border-primary/60" : "border-border"}`}>
      <button onClick={onOpen} className="w-full p-4 text-left transition-colors hover:bg-muted/40">
        <header className="flex items-center gap-3">
          <Avatar><AvatarImage src={run.avatar_url || undefined} /><AvatarFallback>{(run.display_name || "R")[0]}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {isSelf ? (zh ? "你" : "You") : run.display_name || (zh ? "跑者" : "Runner")}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(run.started_at).toLocaleDateString(zh ? "zh-HK" : "en-GB", { month: "short", day: "numeric" })}
            </p>
          </div>
        </header>
        <h3 className="mt-4 font-semibold">{run.activity_name || run.activity_type || (zh ? "跑步" : "Run")}</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <span className="flex items-center gap-1.5"><Route size={14} className="text-primary" />{Number(run.distance_km).toFixed(2)} km</span>
          <span className="flex items-center gap-1.5"><Clock size={14} className="text-primary" />{duration(run.duration_s)}</span>
          <span className="flex items-center gap-1.5"><Mountain size={14} className="text-primary" />{Math.round(Number(run.elevation_m || 0))} m</span>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">{footer ?? (zh ? "點擊查看詳細數據" : "Tap to see full stats")}</p>
      </button>
    </article>
  );
}
