import { useEffect, useState } from "react";
import { Bot, Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const MCP_BASE = "https://mcp.runward.site/mcp";

type Row = { id: string; label: string | null; created_at: string; last_used_at: string | null };

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "rw_" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default function ClaudeConnectCard({ lang, userId }: { lang: "en" | "zh" | string; userId: string }) {
  const zh = lang === "zh";
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from("mcp_tokens").select("id,label,created_at,last_used_at").order("created_at", { ascending: false });
    setRows(Array.isArray(data) ? data : []);
  };
  useEffect(() => { load(); }, [userId]);

  const create = async () => {
    setBusy(true);
    try {
      const token = randomToken();
      const token_hash = await sha256Hex(token);
      const { error } = await (supabase as any).from("mcp_tokens").insert({ user_id: userId, token_hash, label: "Claude" });
      if (error) throw error;
      setNewLink(`${MCP_BASE}?key=${token}`);
      load();
    } catch {
      toast({ title: zh ? "建立失敗，請再試" : "Couldn't create link, try again", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    await (supabase as any).from("mcp_tokens").delete().eq("id", id);
    load();
  };

  const copy = async () => {
    if (!newLink) return;
    try { await navigator.clipboard.writeText(newLink); toast({ title: zh ? "已複製連結" : "Link copied" }); } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot size={20} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">{zh ? "連接 Claude / AI 助手" : "Connect Claude / AI assistants"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {zh ? "產生私人連結，貼到 Claude 設定 → Connectors，Claude 便可直接讀取你的跑步及健康數據（只讀）。" : "Create a private link and paste it into Claude → Settings → Connectors so Claude can read your runs and health data (read-only)."}
          </p>
        </div>
      </div>

      {newLink && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <p className="mb-2 text-xs font-medium text-foreground">{zh ? "請立即複製，這條連結只會顯示一次：" : "Copy it now — this link is shown only once:"}</p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">{newLink}</p>
          <Button size="sm" className="mt-2" onClick={copy}><Copy size={14} />{zh ? "複製" : "Copy"}</Button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-3 divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
              <div>
                <p className="font-medium">{r.label || "Claude"} · {new Date(r.created_at).toLocaleDateString()}</p>
                <p className="text-muted-foreground">{r.last_used_at ? `${zh ? "最後使用" : "Last used"} ${new Date(r.last_used_at).toLocaleString()}` : (zh ? "未使用" : "Not used yet")}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => revoke(r.id)} aria-label={zh ? "撤銷" : "Revoke"}><Trash2 size={14} />{zh ? "撤銷" : "Revoke"}</Button>
            </div>
          ))}
        </div>
      )}

      <Button className="mt-3 w-full" variant="secondary" onClick={create} disabled={busy || rows.length >= 5}>
        {zh ? "產生新連結" : "Create new link"}
      </Button>
    </div>
  );
}
