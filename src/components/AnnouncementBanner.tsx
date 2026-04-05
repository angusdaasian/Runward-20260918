import { useState, useEffect, useRef, useCallback } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Lang } from "@/lib/i18n";

interface Announcement {
  id: string;
  title: string;
  message: string;
  title_zh: string | null;
  message_zh: string | null;
}

interface Props {
  lang: Lang;
}

const AnnouncementBanner = ({ lang }: Props) => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [read, setRead] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 16, origY: 16,
  });
  const movedRef = useRef(false);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, message, title_zh, message_zh")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setAnnouncement(data as Announcement);
    };
    fetchAnnouncement();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragState.current = {
      dragging: true,
      startX: touch.clientX,
      startY: touch.clientY,
      origX: position.x,
      origY: position.y,
    };
    movedRef.current = false;
  }, [position]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current.dragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragState.current.startX;
    const dy = touch.clientY - dragState.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    const newX = Math.max(0, Math.min(window.innerWidth - 48, dragState.current.origX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, dragState.current.origY + dy));
    setPosition({ x: newX, y: newY });
  }, []);

  const onTouchEnd = useCallback(() => {
    dragState.current.dragging = false;
  }, []);

  const handleClick = () => {
    if (!movedRef.current) {
      setExpanded((v) => !v);
      if (!read) setRead(true);
    }
  };

  if (!announcement) return null;

  const displayTitle = (lang === "zh" && announcement.title_zh) ? announcement.title_zh : announcement.title;
  const displayMessage = (lang === "zh" && announcement.message_zh) ? announcement.message_zh : announcement.message;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50"
      style={{ left: position.x, top: position.y }}
    >
      <button
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all touch-none"
      >
        <Megaphone size={18} />
        {!read && <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />}
      </button>

      {expanded && (
        <div
          className="absolute top-12 w-72 animate-in fade-in slide-in-from-top-2 bg-card border border-border rounded-xl shadow-lg p-4"
          style={{
            left: position.x + 288 > window.innerWidth ? undefined : 0,
            right: position.x + 288 > window.innerWidth ? 0 : undefined,
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Megaphone size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">{displayTitle}</h3>
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{displayMessage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementBanner;
