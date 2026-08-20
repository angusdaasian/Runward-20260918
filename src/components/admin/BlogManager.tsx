import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Row {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  author: string;
  tags: string[];
  published: boolean;
  published_at: string | null;
  created_at: string;
}

const emptyDraft = {
  id: "",
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  cover_image_url: "",
  author: "Runward",
  tagsText: "",
  published: false,
};

type Draft = typeof emptyDraft;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const BlogManager = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Could not load posts");
      return;
    }
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    load();
  }, []);

  const edit = (row: Row) =>
    setDraft({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt ?? "",
      content: row.content ?? "",
      cover_image_url: row.cover_image_url ?? "",
      author: row.author ?? "Runward",
      tagsText: (row.tags ?? []).join(", "),
      published: row.published,
    });

  const save = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setSaving(true);
    const payload = {
      slug: draft.slug.trim() || slugify(draft.title),
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim() || null,
      content: draft.content,
      cover_image_url: draft.cover_image_url.trim() || null,
      author: draft.author.trim() || "Runward",
      tags: draft.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      published: draft.published,
      published_at: draft.published ? new Date().toISOString() : null,
    };

    const { error } = draft.id
      ? await supabase.from("blog_posts").update(payload).eq("id", draft.id)
      : await supabase.from("blog_posts").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(draft.id ? "Post updated" : "Post created");
    setDraft(emptyDraft);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Post deleted");
    if (draft.id === id) setDraft(emptyDraft);
    load();
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">
          {draft.id ? "Edit post" : "New post"}
        </h2>

        <div className="space-y-2">
          <Label htmlFor="blog-title">Title</Label>
          <Input
            id="blog-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-slug">Slug</Label>
          <Input
            id="blog-slug"
            placeholder={slugify(draft.title) || "auto-generated"}
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-excerpt">Excerpt</Label>
          <Textarea
            id="blog-excerpt"
            rows={2}
            value={draft.excerpt}
            onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="blog-author">Author</Label>
            <Input
              id="blog-author"
              value={draft.author}
              onChange={(e) => setDraft({ ...draft, author: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blog-tags">Tags (comma separated)</Label>
            <Input
              id="blog-tags"
              value={draft.tagsText}
              onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-cover">Cover image URL</Label>
          <Input
            id="blog-cover"
            value={draft.cover_image_url}
            onChange={(e) => setDraft({ ...draft, cover_image_url: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="blog-content">Content (markdown)</Label>
          <Textarea
            id="blog-content"
            rows={18}
            className="font-mono text-sm"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="blog-published"
            checked={draft.published}
            onCheckedChange={(v) => setDraft({ ...draft, published: v })}
          />
          <Label htmlFor="blog-published">Published</Label>
        </div>

        <div className="flex gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : draft.id ? "Save changes" : "Create post"}
          </Button>
          {draft.id && (
            <Button variant="outline" onClick={() => setDraft(emptyDraft)}>
              <Plus size={16} className="mr-1" />
              New post
            </Button>
          )}
        </div>
      </section>

      <aside className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Posts ({rows.length})</h3>
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <button className="text-left" onClick={() => edit(row)}>
                <div className="font-semibold text-sm">{row.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  /blog/{row.slug} · {row.published ? "published" : "draft"}
                </div>
              </button>
              <button
                onClick={() => remove(row.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Delete ${row.title}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No database posts yet.</p>
        )}
      </aside>
    </div>
  );
};

export default BlogManager;
