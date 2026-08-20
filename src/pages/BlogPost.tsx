import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    document.documentElement.lang = post.lang === "zh" ? "zh-HK" : "en";
    applySeoHead({
      title: `${post.title} — Runward Blog`,
      description: post.excerpt,
      canonical: `/blog/${post.slug}`,
      image: post.coverImage,
      type: "article",
      alternates: [
        { hrefLang: post.lang === "zh" ? "zh-HK" : "en", href: `/blog/${post.slug}` },
        ...(post.translationSlug
          ? [
              {
                hrefLang: post.lang === "zh" ? "en" : "zh-HK",
                href: `/blog/${post.translationSlug}`,
              },
            ]
          : []),
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt,
        inLanguage: post.lang === "zh" ? "zh-HK" : "en",
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
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            {post?.lang === "zh" ? "所有文章" : "All articles"}
          </Link>
          {post?.translationSlug && (
            <Link
              to={`/blog/${post.translationSlug}`}
              className="text-sm px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {post.lang === "zh" ? "English" : "中文"}
            </Link>
          )}
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
              {formatPostDate(post.date, post.lang)} · {post.author}
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
            <div className="prose prose-neutral dark:prose-invert mt-8 prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground max-w-none prose-headings:font-display prose-a:text-primary prose-table:my-6 prose-th:text-left prose-th:font-semibold">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="my-6 overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm border-collapse m-0">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b border-border">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 align-top border-b border-border/60">{children}</td>
                  ),
                }}
              >
                {post.content}
              </ReactMarkdown>
            </div>
          </article>
        )}
      </main>
    </div>
  );
};

export default BlogPostPage;
