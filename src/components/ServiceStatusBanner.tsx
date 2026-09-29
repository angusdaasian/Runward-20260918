import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Clock3, RefreshCw, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ServiceState = "degraded" | "outage" | "maintenance";

interface ServiceStatus {
  id: string;
  service_name: string;
  status: ServiceState;
  message: string | null;
  message_zh: string | null;
  updated_at: string;
}

const severity: Record<ServiceState, number> = {
  outage: 3,
  degraded: 2,
  maintenance: 1,
};

const stateLabel = (status: ServiceState, lang: Lang) => {
  if (lang === "zh") {
    return status === "outage" ? "服務中斷" : status === "degraded" ? "服務受影響" : "維護中";
  }
  return status === "outage" ? "Service outage" : status === "degraded" ? "Degraded service" : "Maintenance";
};

const ServiceStatusBanner = ({ lang, onReconnect }: { lang: Lang; onReconnect?: () => void }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const goReconnect = onReconnect ?? (() => navigate("/?page=connect-apps"));
  const [items, setItems] = useState<ServiceStatus[]>([]);
  const [open, setOpen] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Watch sync moved to Stridee: nudge users still on the old Terra / backup
  // Garmin connection to reconnect so automatic sync resumes.
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [{ data: sc }, { data: tc }, { data: gc }] = await Promise.all([
        (supabase as any).from("stridee_connections").select("status").eq("user_id", user.id).maybeSingle(),
        supabase.from("terra_connections").select("id").eq("user_id", user.id).eq("active", true).limit(1),
        supabase.from("garmin_connections").select("id").eq("user_id", user.id).limit(1),
      ]);
      if (!active) return;
      setNeedsReconnect(sc?.status !== "connected" && ((tc?.length ?? 0) > 0 || (gc?.length ?? 0) > 0));
    })();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    supabase
      .from("service_statuses")
      .select("id, service_name, status, message, message_zh, updated_at, display_order")
      .neq("status", "operational")
      .order("display_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active || error) return;
        // Garmin outage notices are retired now that watches sync via Stridee.
        setItems(((data as ServiceStatus[] | null) ?? []).filter((i) => !/garmin/i.test(i.service_name)));
      });
    return () => {
      active = false;
    };
  }, []);

  const highestState = useMemo<ServiceState>(() => {
    return items.reduce<ServiceState>((highest, item) =>
      severity[item.status] > severity[highest] ? item.status : highest,
    "maintenance");
  }, [items]);

  const reconnectCard = needsReconnect ? (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-primary/35 bg-primary/10 px-3.5 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <RefreshCw className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {lang === "zh" ? "請重新連結你的手錶" : "Please reconnect your watch"}
        </p>
        <p className="text-xs text-muted-foreground">
          {lang === "zh"
            ? "我們已升級手錶同步服務。重新連結 Garmin / COROS / Polar / Fitbit / Zepp，即可恢復自動同步。"
            : "We've upgraded watch sync. Reconnect Garmin / COROS / Polar / Fitbit / Zepp to restore automatic sync."}
        </p>
      </div>
      <Button size="sm" onClick={goReconnect} className="shrink-0">
        {lang === "zh" ? "重新連結" : "Reconnect"}
      </Button>
    </div>
  ) : null;

  if (items.length === 0) return reconnectCard;

  const latest = items.reduce((current, item) =>
    new Date(item.updated_at) > new Date(current.updated_at) ? item : current,
  items[0]);
  const Icon = highestState === "maintenance" ? Wrench : AlertTriangle;

  return (
    <>
    {reconnectCard}
    <Collapsible open={open} onOpenChange={setOpen} className="mb-5 overflow-hidden rounded-lg border border-warning/35 bg-warning/10">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          highestState === "outage" ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning",
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {lang === "zh" ? `${items.length} 項服務受影響` : `${items.length} service${items.length > 1 ? "s" : ""} affected`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {items.map((item) => item.service_name).join(" · ")}
          </p>
        </div>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label={lang === "zh" ? "查看服務狀態" : "View service status"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-warning/25 px-3.5 py-1">
          {items.map((item) => {
            const localizedMessage = lang === "zh" ? item.message_zh || item.message : item.message || item.message_zh;
            return (
              <div key={item.id} className="flex gap-3 border-b border-border/70 py-3 last:border-b-0">
                <span className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  item.status === "outage" ? "bg-destructive" : "bg-warning",
                )} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">{item.service_name}</span>
                    <span className={cn(
                      "text-[10px] font-semibold uppercase",
                      item.status === "outage" ? "text-destructive" : "text-warning",
                    )}>
                      {stateLabel(item.status, lang)}
                    </span>
                  </div>
                  {localizedMessage && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{localizedMessage}</p>}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 py-2 text-[10px] text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            <span>
              {lang === "zh" ? "最後更新 " : "Updated "}
              {new Date(latest.updated_at).toLocaleString(lang === "zh" ? "zh-TW" : "en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
    </>
  );
};

export default ServiceStatusBanner;