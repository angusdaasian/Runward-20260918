import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, Trash2 } from "lucide-react";

interface PendingRace {
  id: string;
  name: string;
  race_date: string;
  city: string;
  country: string;
  category: string;
  ai_verification_result: string | null;
  status: string;
  created_at: string;
}

const PendingRaceManager = () => {
  const [races, setRaces] = useState<PendingRace[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    const { data } = await supabase
      .from("pending_races")
      .select("*")
      .order("created_at", { ascending: false });
    setRaces((data as PendingRace[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, []);

  const handleApprove = async (race: PendingRace) => {
    // Add to races table
    await supabase.from("races").insert({
      name: race.name,
      race_date: race.race_date,
      city: race.city,
      country: race.country,
      category: race.category,
      source: "user_submitted",
    });
    // Update status
    await supabase.from("pending_races").update({ status: "approved" }).eq("id", race.id);
    fetchPending();
  };

  const handleReject = async (id: string) => {
    await supabase.from("pending_races").update({ status: "rejected" }).eq("id", id);
    fetchPending();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("pending_races").delete().eq("id", id);
    fetchPending();
  };

  const pendingCount = races.filter(r => r.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" /> Pending Race Confirmation
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-2">{pendingCount}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : races.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pending race submissions</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>AI Check</TableHead>
                  <TableHead>AI Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {races.map(race => (
                  <TableRow key={race.id}>
                    <TableCell className="font-medium">{race.name}</TableCell>
                    <TableCell>{new Date(race.race_date).toLocaleDateString()}</TableCell>
                    <TableCell>{race.city}, {race.country}</TableCell>
                    <TableCell><Badge variant="outline">{race.category}</Badge></TableCell>
                    <TableCell>
                      {(() => {
                        try {
                          const parsed = JSON.parse(race.ai_verification_result || "{}");
                          return parsed.verified ? (
                            <Badge className="bg-green-600 text-white">✓ Verified</Badge>
                          ) : (
                            <Badge variant="destructive">✗ Failed</Badge>
                          );
                        } catch {
                          return <span className="text-xs text-muted-foreground">—</span>;
                        }
                      })()}
                    </TableCell>
                    <TableCell className="max-w-[200px] text-xs truncate">
                      {(() => {
                        try {
                          const parsed = JSON.parse(race.ai_verification_result || "{}");
                          return parsed.reason || "—";
                        } catch {
                          return race.ai_verification_result || "—";
                        }
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        race.status === "approved" ? "default" :
                        race.status === "rejected" ? "destructive" : "secondary"
                      }>
                        {race.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {race.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleApprove(race)} title="Approve">
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleReject(race.id)} title="Reject">
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                      {race.status !== "pending" && (
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(race.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

export default PendingRaceManager;
