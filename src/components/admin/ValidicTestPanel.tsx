import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(d: number) {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() - d);
  return x.toISOString().slice(0, 10);
}

export default function ValidicTestPanel() {
  const [startDate, setStartDate] = useState(daysAgoISO(6));
  const [endDate, setEndDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("validic-test", {
        body: { start_date: startDate, end_date: endDate },
      });
      if (error) {
        toast.error(`Request failed: ${error.message}`);
        setResult({ success: false, error: error.message });
      } else {
        setResult(data);
        if (data?.success) toast.success(`Validic responded ${data.status}`);
        else toast.error(`Validic returned status ${data?.status ?? "?"}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
      setResult({ success: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" /> Validic Test Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Hits Validic's <code>/summaries</code> endpoint with the sample developer
          credentials from your quickstart. Does not affect Garmin or any user data.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="validic-start">Start date</Label>
            <Input
              id="validic-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="validic-end">End date</Label>
            <Input
              id="validic-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={runTest} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Calling Validic…
            </>
          ) : (
            "Run test request"
          )}
        </Button>

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge
                className={
                  result.success
                    ? "bg-primary text-primary-foreground"
                    : "bg-destructive text-destructive-foreground"
                }
              >
                {result.success ? "Success" : "Failed"}
              </Badge>
              {typeof result.status === "number" && (
                <span className="text-sm text-muted-foreground">
                  HTTP {result.status}
                </span>
              )}
            </div>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
