import { useState } from "react";
import { Check, Loader2, MoreVertical, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { Lang } from "@/lib/i18n";

interface InvitableGroup {
  id: string;
  name: string;
  emoji: string | null;
  can_invite: boolean;
  already_member: boolean;
  already_invited: boolean;
}

/** Three-dot menu on a feed activity: invite that runner into one of my groups. */
export default function GroupInviteMenu({ targetUserId, targetName, lang }: { targetUserId: string; targetName: string; lang: Lang }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const zh = lang === "zh";
  const [groups, setGroups] = useState<InvitableGroup[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.id === targetUserId) return null;

  const load = async (open: boolean) => {
    if (!open) return;
    setGroups(null);
    const { data } = await (supabase.rpc as any)("get_invitable_groups", { p_target_user_id: targetUserId });
    setGroups((data || []) as InvitableGroup[]);
  };

  const invite = async (group: InvitableGroup) => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("invite_user_to_group", { p_group_id: group.id, p_user_id: targetUserId });
    setBusy(false);
    if (error) {
      toast({ title: zh ? "無法發出邀請" : "Could not send invitation", variant: "destructive" });
      return;
    }
    setGroups((current) => (current || []).map((g) => (g.id === group.id ? { ...g, already_invited: true } : g)));
    toast({ title: zh ? `已邀請 ${targetName} 加入 ${group.name}` : `Invited ${targetName} to ${group.name}` });
  };

  return (
    <DropdownMenu onOpenChange={load}>
      <DropdownMenuTrigger
        aria-label={zh ? "更多" : "More options"}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <MoreVertical size={20} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {zh ? `邀請 ${targetName} 加入群組` : `Invite ${targetName} to a group`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups === null ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={14} />{zh ? "載入中…" : "Loading…"}</div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{zh ? "你還未加入任何私人群組" : "You haven't joined any private group yet"}</p>
        ) : (
          groups.map((g) => {
            const disabled = busy || !g.can_invite || g.already_member || g.already_invited;
            return (
              <DropdownMenuItem
                key={g.id}
                disabled={disabled}
                onSelect={(e) => { e.preventDefault(); if (!disabled) invite(g); }}
                className={disabled ? "opacity-40" : "font-medium text-foreground"}
              >
                <span className="mr-1">{g.emoji || "🏃"}</span>
                <span className="truncate">{g.name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {g.already_member
                    ? (zh ? "已是成員" : "Member")
                    : g.already_invited
                      ? (<span className="inline-flex items-center gap-1"><Check size={12} />{zh ? "已邀請" : "Invited"}</span>)
                      : !g.can_invite
                        ? (zh ? "僅群主可邀請" : "Leader only")
                        : (<UserPlus size={13} />)}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
