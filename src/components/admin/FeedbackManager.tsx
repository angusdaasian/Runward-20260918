import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, MessageSquare, CheckCircle2, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Feedback {
  id: string;
  name: string | null;
  title: string;
  description: string;
  status: string;
  admin_response: string | null;
  responded_at: string | null;
  created_at: string;
  user_id: string | null;
}

const FeedbackManager = () => {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "responded" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchFeedbacks = async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from("support_feedback" as any)
      .select("id, name, title, description, status, admin_response, responded_at, created_at, user_id")
      .order("created_at", { ascending: false }) as any);
    if (!error && data) setFeedbacks(data as Feedback[]);
    setLoading(false);
  };

  useEffect(() => { fetchFeedbacks(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from("support_feedback" as any).delete().eq("id", id) as any);
    if (error) {
      toast.error("Failed to delete feedback");
    } else {
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      toast.success("Feedback deleted");
    }
  };

  const handleRespond = async (id: string) => {
    const response = (drafts[id] ?? "").trim();
    if (!response) {
      toast.error("Please enter a response");
      return;
    }
    setSavingId(id);
    const { error } = await (supabase
      .from("support_feedback" as any)
      .update({
        admin_response: response,
        responded_at: new Date().toISOString(),
        responded_by: user?.id ?? null,
        status: "responded",
      })
      .eq("id", id) as any);
    setSavingId(null);
    if (error) {
      toast.error("Failed to send response");
      return;
    }
    toast.success("Response sent");
    setDrafts((d) => ({ ...d, [id]: "" }));
    fetchFeedbacks();
  };

  const visible = feedbacks.filter((f) => {
    if (filter === "all") return true;
    if (filter === "open") return f.status !== "responded";
    return f.status === "responded";
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Support Tickets
        </CardTitle>
        <div className="flex gap-2 pt-2">
          {(["open", "responded", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                filter === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No tickets in this view.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((f) => {
              const isOpen = openId === f.id;
              const responded = f.status === "responded";
              return (
                <div key={f.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setOpenId(isOpen ? null : f.id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50"
                  >
                    {responded ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : (
                      <Clock size={16} className="text-amber-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {f.name || "Anonymous"} · {new Date(f.created_at).toLocaleString()}
                      </p>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border/60 bg-background/40">
                      <div className="pt-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">User message</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{f.description}</p>
                      </div>
                      {responded && f.admin_response && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-primary mb-1">
                            Current response
                            {f.responded_at && (
                              <span className="text-muted-foreground normal-case ml-2">
                                · {new Date(f.responded_at).toLocaleString()}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{f.admin_response}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                          {responded ? "Update response" : "Reply"}
                        </p>
                        <Textarea
                          value={drafts[f.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                          placeholder="Type your response..."
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(f.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleRespond(f.id)}
                          disabled={savingId === f.id}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          {savingId === f.id ? "Sending..." : responded ? "Update" : "Send response"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FeedbackManager;
