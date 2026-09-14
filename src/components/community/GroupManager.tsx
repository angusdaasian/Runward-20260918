import { useState } from "react";
import { Copy, Link2, Loader2, LogOut, Plus, RefreshCw, Share2, Trash2, UserMinus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Lang } from "@/lib/i18n";

export interface LeaderboardGroup { id: string; name: string; emoji: string | null; invite_code: string | null; owner_user_id: string; member_count: number; push_enabled?: boolean }
interface GroupMember { user_id: string; display_name: string | null; avatar_url: string | null; role: string }
interface Props { lang: Lang; groups: LeaderboardGroup[]; onChanged: () => void }

export default function GroupManager({ lang, groups, onChanged }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const zh = lang === "zh";
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏃");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await supabase.rpc("create_leaderboard_group", { p_name: name.trim(), p_emoji: emoji.trim() || undefined });
    setName(""); setBusy(false); onChanged();
  };
  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("join_group_by_code", { p_code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (error) { toast({ title: zh ? "邀請碼無效" : "Invalid invite code", variant: "destructive" }); return; }
    setJoinCode(""); onChanged();
  };
  const inviteText = (group: LeaderboardGroup) =>
    zh
      ? `加入我的 Runward 排行榜「${group.name}」，邀請碼：${group.invite_code}`
      : `Join my Runward leaderboard "${group.name}" with invite code ${group.invite_code}`;
  const copyCode = async (group: LeaderboardGroup) => {
    await navigator.clipboard.writeText(group.invite_code || "");
    toast({ title: zh ? "已複製邀請碼" : "Invite code copied" });
  };
  const shareCode = async (group: LeaderboardGroup) => {
    const text = inviteText(group);
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* dismissed */ } }
    await navigator.clipboard.writeText(text);
    toast({ title: zh ? "已複製邀請訊息" : "Invitation copied" });
  };
  const rotate = async (id: string) => { setBusy(true); await supabase.rpc("rotate_group_code", { p_group_id: id }); setBusy(false); onChanged(); };
  const setPush = async (id: string, enabled: boolean) => {
    await (supabase.rpc as any)("set_group_push", { p_group_id: id, p_enabled: enabled });
    onChanged();
  };
  const loadMembers = async (id: string) => {
    const { data } = await supabase.rpc("get_leaderboard_group_members", { p_group_id: id });
    setMembers((current) => ({ ...current, [id]: (data || []) as GroupMember[] }));
  };
  const removeMember = async (groupId: string, userId: string) => {
    setBusy(true);
    await supabase.rpc("remove_leaderboard_group_member", { p_group_id: groupId, p_user_id: userId });
    await loadMembers(groupId); setBusy(false); onChanged();
  };
  const deleteGroup = async (id: string) => {
    setBusy(true); await supabase.from("leaderboard_groups").delete().eq("id", id); setBusy(false); onChanged();
  };

  if (!user) return null;
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Users />{zh ? "私人排行榜" : "Private groups"}</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{zh ? "私人排行榜" : "Private leaderboards"}</DialogTitle><DialogDescription>{zh ? "用 5 位邀請碼邀請跑友，可複製或分享到 WhatsApp。" : "Invite runners with a 5-character code you can copy or share to WhatsApp."}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[64px_1fr_auto] gap-2">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={zh ? "群組名稱" : "Group name"} />
            <Button size="icon" onClick={create} disabled={busy || !name.trim()} aria-label={zh ? "建立群組" : "Create group"}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}</Button>
          </div>
          <div className="flex gap-2">
            <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={5} placeholder={zh ? "輸入 5 位邀請碼" : "Enter 5-character code"} className="uppercase tracking-widest" />
            <Button variant="secondary" onClick={join} disabled={busy || joinCode.trim().length < 5}><Link2 />{zh ? "加入" : "Join"}</Button>
          </div>
          {groups.map((group) => (
            <div key={group.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2"><strong>{group.emoji} {group.name}</strong><Button variant="ghost" size="sm" onClick={() => loadMembers(group.id)}>{group.member_count} {zh ? "人" : "members"}</Button></div>
              {group.invite_code && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">{zh ? "邀請碼" : "Invite code"}</p>
                  <p className="rounded-md bg-muted px-3 py-2 text-center text-2xl font-bold tracking-[0.3em]">{group.invite_code}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyCode(group)}><Copy />{zh ? "複製邀請碼" : "Copy code"}</Button>
                    <Button size="sm" variant="secondary" onClick={() => shareCode(group)}><Share2 />{zh ? "分享" : "Share"}</Button>
                    {group.owner_user_id === user.id && <Button size="icon" variant="ghost" onClick={() => rotate(group.id)} aria-label={zh ? "更新邀請碼" : "Rotate invite code"}><RefreshCw /></Button>}
                  </div>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border p-2">
                <Label htmlFor={`push-${group.id}`} className="text-xs font-normal text-muted-foreground">
                  {zh ? "當群組成員完成跑步時通知我" : "Notify me when a group member finishes a run"}
                </Label>
                <Switch
                  id={`push-${group.id}`}
                  checked={group.push_enabled !== false}
                  onCheckedChange={(checked) => setPush(group.id, checked)}
                />
              </div>
              {members[group.id] &&  <div className="mt-3 divide-y divide-border border-t border-border">{members[group.id].map((member) => <div key={member.user_id} className="flex items-center justify-between py-2 text-sm"><span>{member.display_name || (zh ? "跑者" : "Runner")}{member.role === "owner" ? ` · ${zh ? "群主" : "owner"}` : ""}</span>{group.owner_user_id === user.id && member.role !== "owner" && <Button size="icon" variant="ghost" onClick={() => removeMember(group.id, member.user_id)} aria-label={zh ? "移除成員" : "Remove member"}><UserMinus /></Button>}</div>)}</div>}
              <div className="mt-2 flex justify-end">{group.owner_user_id === user.id ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteGroup(group.id)} disabled={busy}><Trash2 />{zh ? "刪除群組" : "Delete group"}</Button> : <Button variant="ghost" size="sm" onClick={() => removeMember(group.id, user.id)} disabled={busy}><LogOut />{zh ? "離開" : "Leave"}</Button>}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
