import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Bell, Megaphone, Menu, Cloud, HelpCircle, Headset, Rocket, Users, Sparkles } from "lucide-react";
import { useSimpleMode } from "@/hooks/use-simple-mode";
import AppGuideDialog from "@/components/AppGuideDialog";
import RoadmapDialog from "@/components/RoadmapDialog";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { WeatherInline } from "@/components/WeatherWidget";

import { getRankFromXP, formatRank, getTierColor, type RankTier } from "@/lib/ranks";
import { RANK_EMBLEMS } from "@/lib/rankEmblems";
import { Progress } from "@/components/ui/progress";

// Module-level cache — survives across remounts/tab switches
let _headerProfile: { display_name: string | null; avatar_url: string | null; monthly_xp: number; rank_tier: string; division: string } | null = null;
let _headerUserId: string | null = null;
let _fetchPromise: Promise<void> | null = null;

/** Eagerly fetch profile into cache. Call as early as possible (e.g. when user is known). */
export function preloadHeaderProfile(userId: string) {
  if (_headerUserId === userId && _headerProfile) return;
  if (_fetchPromise) return;
  _fetchPromise = Promise.resolve(
    supabase
      .from("profiles")
      .select("display_name, avatar_url, monthly_xp, rank_tier, division")
      .eq("user_id", userId)
      .single()
  ).then(({ data }) => {
    if (data) {
      _headerProfile = data;
      _headerUserId = userId;
    }
    _fetchPromise = null;
  }).catch(() => { _fetchPromise = null; });
}

/** Update the header cache externally (called from ProfileSection on save) */
export function updateHeaderCache(profile: { display_name: string | null; avatar_url: string | null; monthly_xp?: number; rank_tier?: string; division?: string }, userId: string) {
  _headerProfile = {
    ..._headerProfile,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    monthly_xp: profile.monthly_xp ?? _headerProfile?.monthly_xp ?? 0,
    rank_tier: profile.rank_tier ?? _headerProfile?.rank_tier ?? "Bronze",
    division: profile.division ?? _headerProfile?.division ?? "V",
  };
  _headerUserId = userId;
}

// ---------- Announcement Bell ----------
interface Announcement {
  id: string;
  title: string;
  message: string;
  title_zh: string | null;
  message_zh: string | null;
}

const AnnouncementRow = ({ lang }: { lang: Lang }) => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [read, setRead] = useState(false);

  useEffect(() => {
    supabase
      .from("announcements")
      .select("id, title, message, title_zh, message_zh")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAnnouncement(data as Announcement);
      });
  }, []);

  const displayTitle = announcement
    ? (lang === "zh" && announcement.title_zh ? announcement.title_zh : announcement.title)
    : null;
  const displayMessage = announcement
    ? (lang === "zh" && announcement.message_zh ? announcement.message_zh : announcement.message)
    : null;

  return (
    <Popover onOpenChange={(open) => { if (open && !read) setRead(true); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left active:scale-[0.98] w-full">
          <span className="relative w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Bell size={18} className="text-foreground" />
            {announcement && !read && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            )}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground leading-tight">
              {lang === "zh" ? "公告" : "Announcements"}
            </span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              {lang === "zh" ? "管理員的最新通知" : "Latest news from admin"}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" side="bottom" className="w-72 p-4">
        {announcement ? (
          <>
            <h3 className="font-semibold text-foreground text-sm">{displayTitle}</h3>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{displayMessage}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "目前沒有公告" : "No announcements right now"}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

// ---------- App Header ----------
interface AppHeaderProps {
  lang: Lang;
  onNavigateSettings: () => void;
  onOpenPromoBanner?: () => void;
  isGuest?: boolean;
}

const AppHeader = ({ lang, onNavigateSettings, onOpenPromoBanner, isGuest }: AppHeaderProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(() =>
    _headerUserId === user?.id ? _headerProfile : null
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [simpleMode, setSimpleMode] = useSimpleMode();

  useEffect(() => {
    if (!user) return;

    // If cache is ready, use it immediately
    if (_headerUserId === user.id && _headerProfile) {
      setProfile(_headerProfile);
      return;
    }

    // Otherwise wait for the preload to finish, then set
    const check = () => {
      if (_headerUserId === user.id && _headerProfile) {
        setProfile(_headerProfile);
        return true;
      }
      return false;
    };

    if (check()) return;

    // Poll briefly for the preload to resolve (max ~1s)
    const interval = setInterval(() => {
      if (check()) clearInterval(interval);
    }, 100);
    const timeout = setTimeout(() => clearInterval(interval), 2000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [user]);

  // Listen for profile changes (e.g. user edits name/avatar in settings)
  useEffect(() => {
    const interval = setInterval(() => {
      if (_headerUserId === user?.id && _headerProfile) {
        setProfile((prev) => {
          if (prev?.display_name !== _headerProfile?.display_name || prev?.avatar_url !== _headerProfile?.avatar_url) {
            return { ...(_headerProfile as any) };
          }
          return prev;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  const guestName = lang === "zh" ? "訪客" : "Guest";
  const name = isGuest ? guestName : (profile?.display_name || (lang === "zh" ? "跑者" : "Runner"));
  const initials = name[0].toUpperCase();

  return (
    <div className="app-header-fixed flex items-center justify-between px-5 pt-4 pb-2 w-full max-w-lg mx-auto">
      <button
        onClick={onNavigateSettings}
        aria-label={lang === "zh" ? "個人檔案" : "Profile"}
        className="flex items-center gap-3 active:scale-[0.98] transition-transform"
      >
        {!isGuest && !profile ? (
          <>
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-5 w-24" />
          </>
        ) : (
          <>
            <Avatar className="h-12 w-12">
              <AvatarImage src={isGuest ? undefined : (profile?.avatar_url || undefined)} />
              <AvatarFallback className="text-lg font-display bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <h1 className="font-display text-lg font-bold text-foreground leading-tight">{name}</h1>
              {!isGuest && profile && (() => {
                const rankInfo = getRankFromXP(profile.monthly_xp ?? 0);
                const pct = Math.min(100, (rankInfo.xpInCurrentDivision / rankInfo.xpToNextDivision) * 100);
                const tier = rankInfo.tier;
                return (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <img src={RANK_EMBLEMS[tier] || RANK_EMBLEMS.Bronze} alt={tier} className="w-4 h-4 object-contain" />
                    <span className="text-[10px] font-semibold" style={{ color: getTierColor(tier) }}>
                      {formatRank(rankInfo.tier, rankInfo.division)}
                    </span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: getTierColor(tier) }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </button>
      <div className="flex items-center gap-2">
        <button
          aria-label={lang === "zh" ? "產品路線圖" : "Roadmap"}
          onClick={() => setRoadmapOpen(true)}
          className="relative w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center hover:from-primary/30 hover:to-primary/10 active:scale-90 transition-all duration-150 group"
        >
          <Rocket size={18} className="text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label="Social"
              className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/5 flex items-center justify-center hover:from-pink-500/30 hover:to-purple-500/10 active:scale-90 transition-all duration-150 group"
            >
              <Users size={18} className="text-pink-500 group-hover:scale-110 transition-transform" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="flex flex-col gap-1">
              <a
                href="https://instagram.com/runward.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/60 transition-colors active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-pink-500 shrink-0">
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground leading-tight">Instagram</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">@runward.app</span>
                </div>
              </a>
              <a
                href="https://threads.net/@runward_official"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/60 transition-colors active:scale-[0.98]"
              >
                <svg viewBox="0 0 192 192" fill="currentColor" className="w-5 h-5 text-foreground shrink-0">
                  <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0395 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0136 175.059C74.2069 174.89 56.9656 167.575 45.7497 153.317C35.2453 139.966 29.8175 120.682 29.6146 96C29.8175 71.3178 35.2453 52.0336 45.7497 38.6827C56.9656 24.4249 74.2065 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.07 0H96.957C68.8819 0.19447 47.291 9.6418 32.8748 28.0793C20.0512 44.4864 13.4365 67.3157 13.2114 95.9325L13.2102 96L13.2114 96.0675C13.4365 124.684 20.0512 147.514 32.8748 163.921C47.291 182.358 68.8819 191.806 96.957 192H97.07C122.04 191.827 139.644 185.292 154.149 170.798C173.122 151.851 172.55 128.099 166.296 113.51C161.811 103.054 153.262 94.5633 141.537 88.9883ZM98.4423 129.507C88.0026 130.095 77.1573 125.409 76.6219 115.36C76.2246 107.9 81.9304 99.5751 99.0888 98.5871C101.052 98.4737 102.978 98.4185 104.869 98.4185C111.099 98.4185 116.928 99.0233 122.228 100.184C120.252 124.881 108.652 128.946 98.4423 129.507Z" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground leading-tight">Threads</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">@runward_official</span>
                </div>
              </a>
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label={lang === "zh" ? "選單" : "Menu"}
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-90 active:bg-muted/60 transition-all duration-150"
            >
              <Menu size={18} className="text-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <div className="flex flex-col">
              {/* Weather — authenticated users only */}
              {!isGuest && user && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left active:scale-[0.98] w-full">
                      <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Cloud size={18} className="text-foreground" />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground leading-tight">
                          {lang === "zh" ? "天氣" : "Weather"}
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-tight">
                          {lang === "zh" ? "查看本地天氣" : "Check local weather"}
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="center" side="bottom" className="w-64 p-0">
                    <WeatherInline lang={lang} />
                  </PopoverContent>
                </Popover>
              )}

              {/* Race news / Promo banner */}
              {onOpenPromoBanner && (
                <button
                  onClick={onOpenPromoBanner}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left active:scale-[0.98]"
                >
                  <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Megaphone size={18} className="text-foreground" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground leading-tight">
                      {lang === "zh" ? "賽事消息" : "Race News"}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight">
                      {lang === "zh" ? "查看最新賽事推廣" : "Latest race promotions"}
                    </span>
                  </div>
                </button>
              )}

              {/* Settings */}
              <button
                onClick={onNavigateSettings}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left active:scale-[0.98]"
              >
                <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Settings size={18} className="text-foreground" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground leading-tight">
                    {lang === "zh" ? "設定" : "Settings"}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {lang === "zh" ? "個人資料與偏好" : "Profile & preferences"}
                  </span>
                </div>
              </button>





              {/* App Guide */}
              <button
                onClick={() => setGuideOpen(true)}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left active:scale-[0.98] w-full"
              >
                <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <HelpCircle size={18} className="text-foreground" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground leading-tight">
                    {lang === "zh" ? "應用程式指南" : "App Guide"}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {lang === "zh" ? "了解所有功能" : "Learn about all features"}
                  </span>
                </div>
              </button>

              {/* Announcements — entire row triggers */}
              <AnnouncementRow lang={lang} />

              {/* Support */}
              <button
                onClick={() => navigate("/support")}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors text-left active:scale-[0.98] w-full"
              >
                <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Headset size={18} className="text-foreground" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground leading-tight">
                    {lang === "zh" ? "支援與幫助" : "Support"}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {lang === "zh" ? "常見問題與回報問題" : "FAQ & report issues"}
                  </span>
                </div>
              </button>
            </div>
          </PopoverContent>
        </Popover>
        <AppGuideDialog open={guideOpen} onOpenChange={setGuideOpen} lang={lang} />
        <RoadmapDialog open={roadmapOpen} onOpenChange={setRoadmapOpen} lang={lang} />
      </div>
    </div>
  );
};

export default AppHeader;
