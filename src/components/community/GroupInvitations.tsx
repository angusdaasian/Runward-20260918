import { useCallback, useEffect, useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Lang } from "@/lib/i18n";

interface Invitation {
  id: string;
  group_id: string;
  group_name: string;
  emoji: string | null;
  inviter_name: string | null;
  created_at: string;
}

/** Pending private-group invitations shown at the top of the Friends feed. */
export default function GroupInvitations({ lang, onJoined }: { lang: Lang; onJoined?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const zh = lang === "zh";
  const [items, setItems] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.rpc as any)("get_my_group_invitations");
    setItems((data || []) as Invitation[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const respond = async (invite: Invitation, accept: boolean) => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("respond_group_invitation", { p_invitation_id: invite.id, p_accept: accept });
    setBusy(false);
    if (error) { toast({ title: zh ? "操作失敗" : "Something went wrong", variant: "destructive" }); return; }
    setItems((current) => current.filter((i) => i.id !== invite.id));
    if (accept) {
      toast({ title: zh ? `已加入 ${invite.group_name}` : `Joined ${invite.group_name}` });
      onJoined?.();
    }
  };

  if (!user || items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((invite) => (
        <div key={invite.id} className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <Mail size={16} className="shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-xs">
            {zh
              ? `${invite.inviter_name || "跑友"} 邀請你加入 ${invite.emoji || "🏃"} ${invite.group_name}`
              : `${invite.inviter_name || "A runner"} invited you to join ${invite.emoji || "🏃"} ${invite.group_name}`}
          </p>
          <Button size="sm" disabled={busy} onClick={() => respond(invite, true)}><Check />{zh ? "加入" : "Join"}</Button>
          <Button size="icon" variant="ghost" disabled={busy} onClick={() => respond(invite, false)} aria-label={zh ? "拒絕" : "Decline"}><X /></Button>
        </div>
      ))}
    </div>
  );
}
