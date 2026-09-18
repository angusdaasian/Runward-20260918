import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, LogOut, Share2, Trash2, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Lang } from "@/lib/i18n";
import type { LeaderboardGroup } from "./GroupManager";

interface GroupMember { user_id: string; display_name: string | null; avatar_url: string | null; role: string }

interface Props {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { id: string; name: string; emoji: string | null };
  managerGroup?: LeaderboardGroup;
  onChanged: () => void;
  onLeft?: () => void;
}

export default function GroupMembersDialog({ lang, open, onOpenChange, group, managerGroup, onChanged, onLeft }: Props) {
  const zh = lang === "zh";
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = !!user && managerGroup?.owner_user_id === user.id;

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_leaderboard_group_members", { p_group_id: group.id });
    setMembers((data || []) as GroupMember[]);
  }, [group.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const removeMember = async (userId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("remove_leaderboard_group_member", { p_group_id: group.id, p_user_id: userId });
    setBusy(false);
    if (error) {
      toast({ title: zh ? "未能移除成員" : "Could not remove member", variant: "destructive" });
      return;
    }
    await load();
    onChanged();
    if (userId === user?.id) {
      onOpenChange(false);
      onLeft?.();
    }
  };

  const deleteGroup = async () => {
    setBusy(true);
    const { error } = await supabase.from("leaderboard_groups").delete().eq("id", group.id);
    setBusy(false);
    if (error) {
      toast({ title: zh ? "未能刪除群組" : "Could not delete group", variant: "destructive" });
      return;
    }
    onOpenChange(false);
    onChanged();
    onLeft?.();
  };

  const inviteText = zh
    ? `加入我的 Runward 跑班「${group.name}」，邀請碼：${managerGroup?.invite_code}`
    : `Join my Runward group "${group.name}" with invite code ${managerGroup?.invite_code}`;

  const copyCode = async () => {
    await navigator.clipboard.writeText(managerGroup?.invite_code || "");
    toast({ title: zh ? "已複製邀請碼" : "Invite code copied" });
  };
  const shareCode = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: inviteText }); return; } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(inviteText);
    toast({ title: zh ? "已複製邀請訊息" : "Invitation copied" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{zh ? "管理群組" : "Manage group"}</DialogTitle>
          <DialogDescription>
            {group.emoji} {group.name}
            {" · "}
            {isOwner ? (zh ? "你是群主" : "You are the leader") : (zh ? "成員" : "Member")}
          </DialogDescription>
        </DialogHeader>

        {managerGroup?.invite_code && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{zh ? "邀請碼" : "Invite code"}</p>
            <p className="rounded-md bg-muted px-3 py-2 text-center text-2xl font-bold tracking-[0.3em]">{managerGroup.invite_code}</p>
            <div className="flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={copyCode}><Copy />{zh ? "複製" : "Copy"}</Button>
              <Button size="sm" variant="secondary" onClick={shareCode}><Share2 />{zh ? "分享" : "Share"}</Button>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {zh ? "成員" : "Members"} {members ? `(${members.length})` : ""}
          </p>
          {!members ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center gap-3 p-2.5">
                  <Avatar className="size-8">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback>{(member.display_name || "R")[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.display_name || (zh ? "跑者" : "Runner")}</p>
                    {member.role === "owner" && (
                      <p className="text-[11px] text-muted-foreground">{zh ? "群主" : "Leader"}</p>
                    )}
                  </div>
                  {isOwner && member.role !== "owner" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => removeMember(member.user_id)}
                      aria-label={zh ? "移除成員" : "Remove member"}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <UserMinus />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          {isOwner ? (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={deleteGroup}>
              <Trash2 />{zh ? "刪除群組" : "Delete group"}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy || !user} onClick={() => user && removeMember(user.id)}>
              <LogOut />{zh ? "離開群組" : "Leave group"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
