import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface Feedback {
  id: string;
  name: string;
  title: string;
  description: string;
  created_at: string;
}

const FeedbackManager = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeedbacks = async () => {
    const { data, error } = await (supabase.from("support_feedback" as any).select("*").order("created_at", { ascending: false }) as any);
    if (!error && data) setFeedbacks(data);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> User Feedback
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : feedbacks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No feedback yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedbacks.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.title}</TableCell>
                    <TableCell className="text-xs max-w-[300px] truncate">{f.description}</TableCell>
                    <TableCell className="text-xs">{new Date(f.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(f.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
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

export default FeedbackManager;
