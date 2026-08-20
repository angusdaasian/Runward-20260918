import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getAllPosts, postsForLang, formatPostDate, type BlogPost } from "@/lib/blog";
import { applySeoHead, SITE_URL } from "@/lib/seoHead";

type Lang = "en" | "zh";

const copy = {
  en: {
    back: "Runward",
    blog: "Blog",
    heading: "Runward Blog",
    intro:
      "Training guides for long distance running, 10K, half marathon and marathon — written by the Runward team in Hong Kong.",
    all: "All",
    loading: "Loading articles…",
    empty: "No articles yet.",
    switch: "中文",
    seoTitle: "Runward Blog — Running training guides for 10K, half marathon & marathon",
    seoDescription:
      "Practical running training guides from Runward: how to start long distance running, 10K, half marathon and marathon plans, pacing and posture.",
  },
  zh: {
    back: "Runward",
    blog: "跑步文章",
    heading: "Runward 跑步文章",
    intro: "由香港 Runward 團隊撰寫的訓練指南：長跑入門、10 公里、半馬與全馬課表。",
    all: "全部",
    loading: "正在載入文章…",
    empty: "暫時沒有文章。",
    switch: "English",
    seoTitle: "Runward 跑步文章 — 10 公里、半馬、全馬訓練指南",
    seoDescription:
      "Runward 實用跑步訓練指南：長跑入門、10 公里、半程馬拉松與全程馬拉松訓練計劃、配速與跑姿。",
  },
} as const;

const Blog = () => {
  const [lang, setLang] = useState<Lang>(
    () => ((localStorage.getItem("app_lang") as Lang) || "zh"),
  );
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    applySeoHead({
      title: copy[lang].seoTitle,
      description: copy[lang].seoDescription,
      canonical: "/blog",
      type: "website",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Runward Blog",
        url: `${SITE_URL}/blog`,
        inLanguage: lang === "zh" ? "zh-HK" : "en",
      },
    });
    document.documentElement.lang = lang === "zh" ? "zh-HK" : "en";
  }, [lang]);

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

  const langPosts = useMemo(() => postsForLang(posts, lang), [posts, lang]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    langPosts.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [langPosts]);

  const visible = activeTag
    ? langPosts.filter((p) => p.tags.includes(activeTag))
    : langPosts;

  const toggleLang = () => {
    const next: Lang = lang === "zh" ? "en" : "zh";
    localStorage.setItem("app_lang", next);
    setActiveTag(null);
    setLang(next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <header className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            {copy[lang].back}
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{copy[lang].blog}</span>
            <button
              onClick={toggleLang}
              className="text-sm px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {copy[lang].switch}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          {copy[lang].heading}
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          {copy[lang].intro}
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
              {copy[lang].all}
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
          <p className="mt-12 text-muted-foreground">{copy[lang].loading}</p>
        ) : visible.length === 0 ? (
          <p className="mt-12 text-muted-foreground">{copy[lang].empty}</p>
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
                    {formatPostDate(post.date, lang)} · {post.author}
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
