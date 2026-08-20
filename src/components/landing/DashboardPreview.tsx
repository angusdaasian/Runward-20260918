import { motion } from "framer-motion";
import {
  Activity,
  TrendingUp,
  Timer,
  Mountain,
  Trophy,
  Flame,
  Calendar,
  ChevronRight,
  Dumbbell,
} from "lucide-react";

interface Props {
  lang: "en" | "zh";
}

export default function DashboardPreview({ lang }: Props) {
  const zh = lang === "zh";

  const tiles = [
    { label: zh ? "本週距離" : "Weekly distance", value: "42.1", unit: "km", icon: TrendingUp, accent: "text-primary" },
    { label: zh ? "本週時間" : "Weekly time", value: "3h 48m", unit: "", icon: Timer, accent: "text-blue-500" },
    { label: zh ? "本月距離" : "Monthly distance", value: "168.4", unit: "km", icon: Activity, accent: "text-emerald-500" },
    { label: zh ? "本月爬升" : "Monthly elevation", value: "1,240", unit: "m", icon: Mountain, accent: "text-orange-500" },
  ];

  const recent = [
    { name: zh ? "週日長距離" : "Sunday Long Run", date: "Jun 8, 2026", km: "21.1", time: "1h 42m", pace: "4:51/km" },
    { name: zh ? "節奏跑 · 5K" : "Tempo · 5K", date: "Jun 6, 2026", km: "8.2", time: "37m", pace: "4:30/km" },
    { name: zh ? "輕鬆恢復跑" : "Easy Recovery", date: "Jun 5, 2026", km: "6.0", time: "32m", pace: "5:20/km" },
    { name: zh ? "山徑跑" : "Trail Run", date: "Jun 3, 2026", km: "12.4", time: "1h 08m", pace: "5:29/km" },
  ];

  const workouts = [
    { day: "11", mo: zh ? "六月" : "Jun", title: zh ? "間歇 · 6×800m" : "Intervals · 6×800m", sub: "8 km", color: "#e85d3a" },
    { day: "13", mo: zh ? "六月" : "Jun", title: zh ? "長距離訓練" : "Long Run", sub: "24 km", color: "#0d7a5f" },
    { day: "15", mo: zh ? "六月" : "Jun", title: zh ? "節奏跑" : "Tempo", sub: "10 km · 4:20/km", color: "#4f46e5" },
  ];

  return (
    <section className="px-6 py-20 md:py-28">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold tracking-wide uppercase mb-4">
            {zh ? "網頁Dashboard" : "Web Dashboard"}
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            {zh ? "在任何瀏覽器深入分析。" : "Go deeper. In any browser."}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            {zh
              ? "全螢幕的訓練Dashboard — 隨時查看每週負荷、最近活動與即將到來的訓練。"
              : "A full-screen training dashboard for weekly load, recent runs, and what's next."}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mx-auto rounded-2xl overflow-hidden border border-border shadow-2xl shadow-foreground/15 bg-card"
        >
          {/* Coming soon overlay */}
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="text-center px-6">
              <span className="inline-block px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold tracking-[0.18em] uppercase mb-4">
                {zh ? "即將推出" : "Coming Soon"}
              </span>
              <h3 className="font-display text-2xl md:text-4xl font-bold tracking-tight">
                {zh ? "網頁Dashboard開發中" : "Web Dashboard in the works"}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-md mx-auto">
                {zh ? "我們正在打造完整的瀏覽器體驗,敬請期待。" : "We're building the full browser experience. Stay tuned."}
              </p>
            </div>
          </div>

          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/60 border-b border-border">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="mx-auto px-4 py-1 rounded-md bg-background border border-border text-[11px] text-muted-foreground font-mono">
              runward.app/dashboard
            </div>
          </div>

          {/* Dashboard mock */}
          <div className="p-5 md:p-8 bg-background space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl md:text-2xl font-display font-bold tracking-tight">
                  {zh ? "歡迎回來, Angus" : "Welcome back, Angus"}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  {zh ? "本週已完成 4 次訓練 · 本月 18 次" : "4 sessions this week · 18 this month"}
                </p>
              </div>
              <div className="hidden md:flex gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium">
                  <Dumbbell className="h-3.5 w-3.5" />
                  {zh ? "查看訓練" : "Training"}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
                  <Activity className="h-3.5 w-3.5" />
                  {zh ? "所有活動" : "All activities"}
                </span>
              </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {t.label}
                    </span>
                    <t.icon className={`h-4 w-4 ${t.accent}`} />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl md:text-3xl font-display font-bold">{t.value}</span>
                    {t.unit && <span className="text-xs text-muted-foreground font-medium">{t.unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Two-column */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 rounded-xl border border-border bg-card p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-display font-semibold text-sm md:text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    {zh ? "最近活動" : "Recent activities"}
                  </h4>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="divide-y divide-border">
                  {recent.map((a, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center py-2.5">
                      <div className="col-span-5 min-w-0">
                        <div className="font-medium text-xs md:text-sm truncate">{a.name}</div>
                        <div className="text-[10px] md:text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {a.date}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-display font-semibold text-xs md:text-sm">{a.km}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">km</div>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="font-display font-semibold text-xs md:text-sm">{a.time}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">{zh ? "時間" : "time"}</div>
                      </div>
                      <div className="col-span-3 text-right">
                        <div className="font-display font-semibold text-xs md:text-sm">{a.pace}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">{zh ? "配速" : "pace"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="font-display font-semibold text-xs md:text-sm flex items-center gap-2 mb-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    {zh ? "下一場比賽" : "Next race"}
                  </h4>
                  <div className="font-display font-bold text-sm md:text-base">
                    {zh ? "香港馬拉松 2026" : "Hong Kong Marathon 2026"}
                  </div>
                  <div className="text-[11px] md:text-xs text-muted-foreground mt-0.5">
                    Sun, Feb 8, 2027 · Hong Kong
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="font-display font-semibold text-xs md:text-sm flex items-center gap-2 mb-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    {zh ? "即將到來的訓練" : "Upcoming workouts"}
                  </h4>
                  <div className="space-y-1.5">
                    {workouts.map((w, i) => (
                      <div key={i} className="flex items-center gap-3 p-1.5 rounded-md">
                        <div
                          className="h-8 w-8 rounded-md flex flex-col items-center justify-center text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: `${w.color}20`, color: w.color }}
                        >
                          <span className="leading-none">{w.day}</span>
                          <span className="leading-none mt-0.5 opacity-70">{w.mo}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{w.title}</div>
                          <div className="text-[10px] text-muted-foreground">{w.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
