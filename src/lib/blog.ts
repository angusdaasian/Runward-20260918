import { supabase } from "@/integrations/supabase/client";
import { parseFrontmatter } from "@/lib/frontmatter";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  author: string;
  date: string; // ISO
  source: "markdown" | "database";
}

/** Markdown posts bundled in the repo — these are prerendered to static HTML at build time. */
const rawMarkdownPosts = import.meta.glob("/src/content/blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function excerptFromBody(body: string): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

export function getMarkdownPosts(): BlogPost[] {
  return Object.entries(rawMarkdownPosts)
    .map(([path, raw]) => {
      const { data, body } = parseFrontmatter(raw);
      const fileSlug = path.split("/").pop()!.replace(/\.md$/, "");
      return {
        slug: data.slug || fileSlug,
        title: data.title || fileSlug,
        excerpt: data.excerpt || excerptFromBody(body),
        content: body,
        coverImage: data.coverImage || data.cover_image || null,
        author: data.author || "Runward",
        date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
        source: "markdown" as const,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchDatabasePosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,excerpt,content,cover_image_url,author,published_at,created_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => ({
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || excerptFromBody(row.content || ""),
    content: row.content || "",
    coverImage: row.cover_image_url || null,
    author: row.author || "Runward",
    date: new Date(row.published_at || row.created_at).toISOString(),
    source: "database" as const,
  }));
}

/** Markdown posts win on slug collisions (they're the prerendered canonical version). */
export async function getAllPosts(): Promise<BlogPost[]> {
  const markdown = getMarkdownPosts();
  const dbPosts = await fetchDatabasePosts();
  const bySlug = new Map<string, BlogPost>();
  for (const post of dbPosts) bySlug.set(post.slug, post);
  for (const post of markdown) bySlug.set(post.slug, post);
  return [...bySlug.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const markdown = getMarkdownPosts().find((p) => p.slug === slug);
  if (markdown) return markdown;
  const dbPosts = await fetchDatabasePosts();
  return dbPosts.find((p) => p.slug === slug) ?? null;
}

export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
