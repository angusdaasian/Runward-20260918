import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
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

const BlogAdmin = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
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
    if (isAdmin) load();
  }, [isAdmin]);

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

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center">
        <p className="text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Admins only</h1>
          <p className="mt-2 text-muted-foreground">
            You need an admin account to manage blog posts.
          </p>
          <Link to="/blog" className="mt-4 inline-block text-primary hover:underline">
            Back to the blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <header className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Blog
          </Link>
          <span className="text-sm text-muted-foreground">Blog admin</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 grid gap-10 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <h1 className="font-display text-2xl font-bold">
            {draft.id ? "Edit post" : "New post"}
          </h1>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder={slugify(draft.title) || "auto-generated"}
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              rows={2}
              value={draft.excerpt}
              onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={draft.tagsText}
                onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cover">Cover image URL</Label>
            <Input
              id="cover"
              value={draft.cover_image_url}
              onChange={(e) => setDraft({ ...draft, cover_image_url: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content (markdown)</Label>
            <Textarea
              id="content"
              rows={18}
              className="font-mono text-sm"
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="published"
              checked={draft.published}
              onCheckedChange={(v) => setDraft({ ...draft, published: v })}
            />
            <Label htmlFor="published">Published</Label>
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
          <h2 className="font-display text-lg font-semibold">Posts ({rows.length})</h2>
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
      </main>
    </div>
  );
};

export default BlogAdmin;
