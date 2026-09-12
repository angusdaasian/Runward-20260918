import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Link2, Loader2, LogOut, Plus, RefreshCw, Trash2, UserMinus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Lang } from "@/lib/i18n";

export interface LeaderboardGroup { id: string; name: string; emoji: string | null; invite_code: string | null; owner_user_id: string; member_count: number }
interface GroupMember { user_id: string; display_name: string | null; avatar_url: string | null; role: string }
interface Props { lang: Lang; groups: LeaderboardGroup[]; onChanged: () => void }

export default function GroupManager({ lang, groups, onChanged }: Props) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏃");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});

  useEffect(() => {
    groups.forEach((group) => {
      if (!group.invite_code || qr[group.id]) return;
      const url = `${window.location.origin}/join/${group.invite_code}`;
      QRCode.toDataURL(url, { width: 240, margin: 1 }).then((data) => setQr((current) => ({ ...current, [group.id]: data })));
    });
  }, [groups, qr]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await supabase.rpc("create_leaderboard_group", { p_name: name.trim(), p_emoji: emoji.trim() || undefined });
    setName(""); setBusy(false); onChanged();
  };
  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    await supabase.rpc("join_group_by_code", { p_code: joinCode.trim() });
    setJoinCode(""); setBusy(false); onChanged();
  };
  const copyInvite = async (code: string) => navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
  const rotate = async (id: string) => { setBusy(true); await supabase.rpc("rotate_group_code", { p_group_id: id }); setBusy(false); onChanged(); };
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
        <DialogHeader><DialogTitle>{zh ? "私人排行榜" : "Private leaderboards"}</DialogTitle><DialogDescription>{zh ? "用同一邀請連結或 QR Code 邀請跑友。" : "Invite runners with one link or its QR code."}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[64px_1fr_auto] gap-2">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={zh ? "群組名稱" : "Group name"} />
            <Button size="icon" onClick={create} disabled={busy || !name.trim()} aria-label={zh ? "建立群組" : "Create group"}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}</Button>
          </div>
          <div className="flex gap-2">
            <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={zh ? "輸入邀請碼" : "Enter invite code"} />
            <Button variant="secondary" onClick={join} disabled={busy || !joinCode.trim()}><Link2 />{zh ? "加入" : "Join"}</Button>
          </div>
          {groups.map((group) => (
            <div key={group.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2"><strong>{group.emoji} {group.name}</strong><Button variant="ghost" size="sm" onClick={() => loadMembers(group.id)}>{group.member_count} {zh ? "人" : "members"}</Button></div>
              {group.invite_code && group.owner_user_id === user.id && <div className="mt-3 flex flex-col items-center gap-3"><img src={qr[group.id]} alt={`${group.name} invitation QR code`} className="h-36 w-36 rounded-md" /><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copyInvite(group.invite_code || "")}><Copy />{zh ? "複製連結" : "Copy link"}</Button><Button size="icon" variant="ghost" onClick={() => rotate(group.id)} aria-label={zh ? "更新邀請碼" : "Rotate invite code"}><RefreshCw /></Button></div></div>}
              {members[group.id] && <div className="mt-3 divide-y divide-border border-t border-border">{members[group.id].map((member) => <div key={member.user_id} className="flex items-center justify-between py-2 text-sm"><span>{member.display_name || (zh ? "跑者" : "Runner")}{member.role === "owner" ? ` · ${zh ? "群主" : "owner"}` : ""}</span>{group.owner_user_id === user.id && member.role !== "owner" && <Button size="icon" variant="ghost" onClick={() => removeMember(group.id, member.user_id)} aria-label={zh ? "移除成員" : "Remove member"}><UserMinus /></Button>}</div>)}</div>}
              <div className="mt-2 flex justify-end">{group.owner_user_id === user.id ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteGroup(group.id)} disabled={busy}><Trash2 />{zh ? "刪除群組" : "Delete group"}</Button> : <Button variant="ghost" size="sm" onClick={() => removeMember(group.id, user.id)} disabled={busy}><LogOut />{zh ? "離開" : "Leave"}</Button>}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}