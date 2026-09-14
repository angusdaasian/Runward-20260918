import { useCallback, useEffect, useState } from "react";
import { Heart, Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Lang } from "@/lib/i18n";

interface CommentRow {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
  is_mine: boolean;
}

export default function ActivitySocial({ source, sourceId, lang }: { source: string; sourceId: string; lang: Lang }) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const { toast } = useToast();
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [likers, setLikers] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [likes, list] = await Promise.all([
      (supabase.rpc as any)("get_activity_likes", { p_source: source, p_source_id: sourceId }),
      (supabase.rpc as any)("get_activity_comments", { p_source: source, p_source_id: sourceId }),
    ]);
    const like = (likes.data || [])[0];
    setLikeCount(Number(like?.like_count || 0));
    setLikedByMe(Boolean(like?.liked_by_me));
    setLikers(like?.likers || null);
    setComments((list.data || []) as CommentRow[]);
  }, [source, sourceId]);

  useEffect(() => { load(); }, [load]);

  const toggleLike = async () => {
    if (!user || busy) return;
    setBusy(true);
    const wasLiked = likedByMe;
    setLikedByMe(!wasLiked);
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));
    const { error } = wasLiked
      ? await (supabase as any).from("activity_likes").delete().match({ source, source_id: sourceId, user_id: user.id })
      : await (supabase as any).from("activity_likes").insert({ source, source_id: sourceId, user_id: user.id });
    setBusy(false);
    if (error) {
      setLikedByMe(wasLiked);
      setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
      toast({ title: zh ? "操作失敗，請再試" : "Couldn't save that, please retry", variant: "destructive" });
      return;
    }
    load();
  };

  const submitComment = async () => {
    const body = draft.trim();
    if (!user || !body || busy) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("activity_comments")
      .insert({ source, source_id: sourceId, user_id: user.id, body: body.slice(0, 500) });
    setBusy(false);
    if (error) { toast({ title: zh ? "留言失敗，請再試" : "Couldn't post the comment", variant: "destructive" }); return; }
    setDraft("");
    load();
  };

  const removeComment = async (id: string) => {
    setBusy(true);
    await (supabase as any).from("activity_comments").delete().eq("id", id);
    setBusy(false);
    load();
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Button variant={likedByMe ? "default" : "outline"} size="sm" onClick={toggleLike} disabled={!user || busy}>
          <Heart className={likedByMe ? "fill-current" : ""} />
          {likeCount}
        </Button>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle size={16} />{comments.length}
        </span>
      </div>
      {likers && (
        <p className="truncate text-xs text-muted-foreground">{zh ? `${likers} 讚好了這次跑步` : `Liked by ${likers}`}</p>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <Avatar className="h-7 w-7"><AvatarImage src={c.avatar_url || undefined} /><AvatarFallback>{(c.display_name || "R")[0]}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">
                {c.display_name || (zh ? "跑者" : "Runner")}
                <span className="ml-2 font-normal text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString(zh ? "zh-HK" : "en-GB", { month: "short", day: "numeric" })}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
            {c.is_mine && (
              <button onClick={() => removeComment(c.id)} aria-label={zh ? "刪除留言" : "Delete comment"} className="p-1 text-muted-foreground hover:text-destructive">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground">{zh ? "成為第一個留言的人吧！" : "Be the first to leave a comment"}</p>
        )}
      </div>

      {user && (
        <div className="flex gap-2">
          <Input
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
            placeholder={zh ? "寫個留言鼓勵一下…" : "Say something encouraging…"}
          />
          <Button size="icon" onClick={submitComment} disabled={busy || !draft.trim()} aria-label={zh ? "發送" : "Send"}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      )}
    </section>
  );
}
