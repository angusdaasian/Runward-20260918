import { useEffect, useState } from "react";
import { Bot, Copy, Trash2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const MCP_BASE = "https://mcp.runwardapp.com/mcp";

type Row = { id: string; label: string | null; created_at: string; last_used_at: string | null };
type Assistant = "claude" | "chatgpt" | "gemini";

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
  const [open, setOpen] = useState<Assistant | null>(null);

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
      const { error } = await (supabase as any).from("mcp_tokens").insert({ user_id: userId, token_hash, label: "AI assistant" });
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

  const guides: { key: Assistant; name: string; steps: string[] }[] = [
    {
      key: "claude",
      name: "Claude",
      steps: zh
        ? ["打開 Claude → 設定 → Connectors", "點「新增自訂 connector」", "貼上你的私人連結並儲存", "之後就可以直接問 Claude 你的跑步數據"]
        : ["Open Claude → Settings → Connectors", "Tap “Add custom connector”", "Paste your private link and save", "Then ask Claude about your runs directly"],
    },
    {
      key: "chatgpt",
      name: "ChatGPT",
      steps: zh
        ? ["打開 ChatGPT → 設定 → Connectors → 進階設定，開啟「開發者模式」", "回到 Connectors，點「建立」新增 connector", "名稱隨意（例如 RunWard），MCP Server URL 貼上你的私人連結", "認證選「無認證」，儲存後即可在對話中使用"]
        : ["Open ChatGPT → Settings → Connectors → Advanced, enable “Developer mode”", "Back in Connectors, tap “Create”", "Name it anything (e.g. RunWard) and paste your private link as the MCP Server URL", "Choose “No authentication”, save, and use it in chats"],
    },
    {
      key: "gemini",
      name: "Gemini",
      steps: zh
        ? ["Gemini 目前不支援直接加入 MCP 連結", "你可以使用應用程式內的「匯出給 AI」功能", "在「所有活動」頁面一鍵匯出你的跑步及健康數據", "將匯出的文字貼到 Gemini 對話中即可"]
        : ["Gemini doesn't support adding MCP links directly yet", "Use the “Export to AI” feature in the app instead", "In All Activities, export your runs and health data in one tap", "Paste the exported text into your Gemini chat"],
    },
  ];

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot size={20} /></div>
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 text-xs text-muted-foreground">
            {zh ? "產生私人連結，讓 Claude、ChatGPT 等 AI 助手直接讀取你的跑步及健康數據（只讀）。" : "Create a private link so AI assistants like Claude or ChatGPT can read your runs and health data (read-only)."}
          </p>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border rounded-xl border border-border">
        {guides.map((g) => (
          <div key={g.key}>
            <Button
              variant="ghost"
              type="button"
              className="h-auto w-full justify-between rounded-none px-3 py-2.5 text-left text-xs font-medium"
              onClick={() => setOpen(open === g.key ? null : g.key)}
            >
              {g.name}
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open === g.key ? "rotate-180" : ""}`} />
            </Button>
            {open === g.key && (
              <ol className="space-y-1.5 px-3 pb-3 pt-1 text-xs text-muted-foreground">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
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
                <p className="font-medium">{r.label || "AI assistant"} · {new Date(r.created_at).toLocaleDateString()}</p>
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
