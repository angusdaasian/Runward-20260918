import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, X, Check, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Race {
  id: string;
  name: string;
  race_date: string;
  city: string;
  country: string;
  category: string;
  website_url: string | null;
  description: string | null;
}

const CATEGORIES = ["5K", "10K", "Half Marathon", "Full Marathon"];

const RaceManager = () => {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", race_date: "", city: "", country: "",
    category: "Full Marathon", website_url: "", description: "",
  });

  const fetchRaces = async () => {
    const { data } = await supabase
      .from("races")
      .select("*")
      .order("race_date", { ascending: true });
    setRaces((data as Race[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRaces(); }, []);

  const resetForm = () => {
    setForm({ name: "", race_date: "", city: "", country: "", category: "Full Marathon", website_url: "", description: "" });
    setShowAdd(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.race_date || !form.city || !form.country) return;

    const payload = {
      name: form.name,
      race_date: form.race_date,
      city: form.city,
      country: form.country,
      category: form.category,
      website_url: form.website_url || null,
      description: form.description || null,
    };

    if (editId) {
      await supabase.from("races").update(payload).eq("id", editId);
    } else {
      await supabase.from("races").insert(payload);
    }

    resetForm();
    fetchRaces();
  };

  const handleEdit = (race: Race) => {
    setForm({
      name: race.name,
      race_date: race.race_date,
      city: race.city,
      country: race.country,
      category: race.category,
      website_url: race.website_url || "",
      description: race.description || "",
    });
    setEditId(race.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("races").delete().eq("id", id);
    fetchRaces();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Race Calendar
        </CardTitle>
        <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Race
        </Button>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="mb-4 p-4 border border-border rounded-lg space-y-3 bg-muted/30">
            <h4 className="font-medium text-sm">{editId ? "Edit Race" : "Add New Race"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Race Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input type="date" value={form.race_date} onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))} />
              <Input placeholder="City *" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              <Input placeholder="Country *" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Website URL" value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} />
            </div>
            <Input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>
                <Check className="h-4 w-4 mr-1" /> {editId ? "Update" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Category</TableHead>
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
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(race)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(race.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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

export default RaceManager;
