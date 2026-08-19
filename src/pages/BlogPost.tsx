import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getPostBySlug, formatPostDate, type BlogPost as Post } from "@/lib/blog";
import { applySeoHead, SITE_URL } from "@/lib/seoHead";

const BlogPostPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPostBySlug(slug).then((found) => {
      if (cancelled) return;
      setPost(found);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    applySeoHead({
      title: `${post.title} — Runward Blog`,
      description: post.excerpt,
      canonical: `/blog/${post.slug}`,
      image: post.coverImage,
      type: "article",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt,
        datePublished: post.date,
        author: { "@type": "Organization", name: post.author },
        publisher: { "@type": "Organization", name: "Runward" },
        mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
        ...(post.coverImage ? { image: post.coverImage } : {}),
      },
    });
  }, [post]);

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            All articles
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !post ? (
          <div>
            <h1 className="font-display text-2xl font-bold">Article not found</h1>
            <Link to="/blog" className="mt-4 inline-block text-primary hover:underline">
              Back to the blog
            </Link>
          </div>
        ) : (
          <article>
            <div className="text-sm text-muted-foreground">
              {formatPostDate(post.date)} · {post.author}
            </div>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              {post.title}
            </h1>
            {post.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
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
            {post.coverImage && (
              <img
                src={post.coverImage}
                alt={post.title}
                className="mt-8 w-full rounded-2xl border border-border object-cover"
              />
            )}
            <div className="prose prose-invert mt-8 max-w-none prose-headings:font-display prose-a:text-primary">
              <ReactMarkdown>{post.content}</ReactMarkdown>
            </div>
          </article>
        )}
      </main>
    </div>
  );
};

export default BlogPostPage;
