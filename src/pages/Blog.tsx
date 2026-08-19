import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getAllPosts, formatPostDate, type BlogPost } from "@/lib/blog";
import { applySeoHead, SITE_URL } from "@/lib/seoHead";

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    applySeoHead({
      title: "Runward Blog — Running training, pacing & posture guides",
      description:
        "Practical running articles from Runward: pacing strategy, training structure, posture and injury prevention for road and trail runners.",
      canonical: "/blog",
      type: "website",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Runward Blog",
        url: `${SITE_URL}/blog`,
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllPosts().then((all) => {
      if (!cancelled) {
        setPosts(all);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [posts]);

  const visible = activeTag ? posts.filter((p) => p.tags.includes(activeTag)) : posts;

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <header className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Runward
          </Link>
          <span className="text-sm text-muted-foreground">Blog</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          Runward Blog
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Training guides, pacing strategy and posture notes for runners — written by the
          Runward team in Hong Kong.
        </p>

        {tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                activeTag === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  activeTag === tag
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="mt-12 text-muted-foreground">Loading articles…</p>
        ) : visible.length === 0 ? (
          <p className="mt-12 text-muted-foreground">No articles yet.</p>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {visible.map((post) => (
              <article
                key={post.slug}
                className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
              >
                {post.coverImage && (
                  <Link to={`/blog/${post.slug}`}>
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      loading="lazy"
                      className="w-full aspect-[16/9] object-cover"
                    />
                  </Link>
                )}
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {formatPostDate(post.date)} · {post.author}
                  </div>
                  <h2 className="font-display text-lg font-semibold leading-snug">
                    <Link to={`/blog/${post.slug}`} className="hover:text-primary transition-colors">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted-foreground flex-1">{post.excerpt}</p>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Blog;
