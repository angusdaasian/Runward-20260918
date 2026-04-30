import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gift, Upload, Trash2, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RewardCode {
  id: string;
  code_string: string;
  type: string;
  is_assigned: boolean;
  user_id: string | null;
  month_year: string | null;
  assigned_at: string | null;
  created_at: string;
}

const RewardCodeManager = () => {
  const [codes, setCodes] = useState<RewardCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCodes, setNewCodes] = useState("");
  const [adding, setAdding] = useState(false);
  const [resetMonth, setResetMonth] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleRunReset = async (dryRun: boolean) => {
    if (!confirm(dryRun
      ? "Preview which winners would receive codes for this run?"
      : "This will assign codes and RESET monthly XP to 0 for everyone. Continue?")) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-trigger-season-reset", {
        body: {
          ...(resetMonth ? { month_year: resetMonth } : {}),
          dry_run: dryRun,
        },
      });
      if (error) throw error;
      const msg = data?.skipped
        ? `Already processed (${data.codes_assigned} codes for ${data.month})`
        : dryRun
          ? `Dry run: ${data?.winners?.length ?? 0} winners would be processed`
          : `Done: ${data?.codes_assigned ?? 0} codes assigned for ${data?.month}`;
      toast({ title: "Season reset", description: msg });
      console.log("[admin-trigger-season-reset] result:", data);
      fetchCodes();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const fetchCodes = async () => {
    const { data } = await supabase
      .from("reward_codes")
      .select("*")
      .order("created_at", { ascending: false });
    setCodes((data as RewardCode[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const handleBulkAdd = async () => {
    const lines = newCodes
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setAdding(true);
    const rows = lines.map((code) => ({
      code_string: code,
      type: "premium_win",
      is_assigned: false,
    }));

    const { error } = await supabase.from("reward_codes").insert(rows);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Added ${lines.length} codes` });
      setNewCodes("");
      fetchCodes();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("reward_codes").delete().eq("id", id);
    setCodes((prev) => prev.filter((c) => c.id !== id));
  };

  const available = codes.filter((c) => !c.is_assigned).length;
  const assigned = codes.filter((c) => c.is_assigned).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" /> Reward Codes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex gap-3 text-sm">
          <Badge variant="secondary">{codes.length} Total</Badge>
          <Badge className="bg-primary text-primary-foreground">{available} Available</Badge>
          <Badge variant="outline">{assigned} Assigned</Badge>
        </div>

        {/* Bulk Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Upload Codes (one per line or comma-separated)
          </label>
          <textarea
            value={newCodes}
            onChange={(e) => setNewCodes(e.target.value)}
            placeholder="ABCD-1234-EFGH&#10;WXYZ-5678-IJKL&#10;..."
            className="w-full h-24 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none"
          />
          <Button onClick={handleBulkAdd} disabled={adding || !newCodes.trim()} size="sm">
            <Upload className="h-4 w-4 mr-1" />
            {adding ? "Adding..." : "Add Codes"}
          </Button>
        </div>

        {/* Manual Season Reset */}
        <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <RotateCcw className="h-4 w-4" /> Run Season Reset
          </label>
          <p className="text-xs text-muted-foreground">
            Auto-runs at 00:05 UTC on the 1st of every month. Use this to backfill a missed month or trigger early. Leave month blank to use the previous month.
          </p>
          <div className="flex gap-2 items-center">
            <Input
              placeholder="YYYY-MM (optional)"
              value={resetMonth}
              onChange={(e) => setResetMonth(e.target.value)}
              className="max-w-[160px] font-mono text-xs"
            />
            <Button onClick={() => handleRunReset(true)} disabled={resetting} size="sm" variant="outline">
              Dry run
            </Button>
            <Button onClick={() => handleRunReset(false)} disabled={resetting} size="sm" variant="destructive">
              {resetting ? "Running..." : "Run reset"}
            </Button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No codes yet</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code_string}</TableCell>
                    <TableCell>
                      {c.is_assigned ? (
                        <Badge variant="outline">Assigned</Badge>
                      ) : (
                        <Badge className="bg-primary text-primary-foreground">Available</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.user_id ? c.user_id.slice(0, 8) + "..." : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{c.month_year || "—"}</TableCell>
                    <TableCell>
                      {!c.is_assigned && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(c.id)}
                          className="h-7 w-7"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RewardCodeManager;
