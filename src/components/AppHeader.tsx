import { useState, useEffect } from "react";
import { Settings, Bell } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

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

const AnnouncementBell = ({ lang }: { lang: Lang }) => {
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

  if (!announcement)
    return (
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <Bell size={18} className="text-muted-foreground" />
      </div>
    );

  const displayTitle = lang === "zh" && announcement.title_zh ? announcement.title_zh : announcement.title;
  const displayMessage = lang === "zh" && announcement.message_zh ? announcement.message_zh : announcement.message;

  return (
    <Popover onOpenChange={(open) => { if (open && !read) setRead(true); }}>
      <PopoverTrigger asChild>
        <button className="relative w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
          <Bell size={18} className="text-foreground" />
          {!read && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <h3 className="font-semibold text-foreground text-sm">{displayTitle}</h3>
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{displayMessage}</p>
      </PopoverContent>
    </Popover>
  );
};

// ---------- App Header ----------
interface AppHeaderProps {
  lang: Lang;
  onNavigateSettings: () => void;
  isGuest?: boolean;
}

const AppHeader = ({ lang, onNavigateSettings, isGuest }: AppHeaderProps) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(() =>
    _headerUserId === user?.id ? _headerProfile : null
  );

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
    <div className="flex items-center justify-between px-5 pt-4 pb-2 w-full max-w-lg mx-auto">
      <div className="flex items-center gap-3">
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
            <h1 className="font-display text-lg font-bold text-foreground">{name}</h1>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onNavigateSettings}
          className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <Settings size={18} className="text-foreground" />
        </button>
        <AnnouncementBell lang={lang} />
      </div>
    </div>
  );
};

export default AppHeader;
