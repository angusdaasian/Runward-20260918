/**
 * Blog static generation.
 *
 *   node scripts/blog-static.mjs sitemap    -> writes public/sitemap.xml + public/feed.xml (prebuild)
 *   node scripts/blog-static.mjs prerender  -> writes dist/blog/**\/index.html (postbuild)
 *
 * Sources: markdown files in src/content/blog plus published rows in the
 * blog_posts table (fetched over the public REST API with the anon key).
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { marked } from "marked";

const BASE_URL = "https://runward.site";
const MAX_PRERENDERED_POSTS = 200;
const CONTENT_DIR = resolve("src/content/blog");

const STATIC_ROUTES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/full", changefreq: "monthly", priority: "0.6" },
  { path: "/compare", changefreq: "monthly", priority: "0.6" },
  { path: "/developers", changefreq: "monthly", priority: "0.5" },
  { path: "/developers/docs", changefreq: "monthly", priority: "0.4" },
  { path: "/support", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
];

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value = "") {
  return escapeXml(value);
}

function parseFrontmatter(raw) {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) return { data: {}, body: normalized.trim() };
  const data = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    let value = trimmed.slice(idx + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    data[trimmed.slice(0, idx).trim()] = value;
  }
  return { data, body: normalized.slice(match[0].length).trim() };
}

function excerptFrom(body) {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function markdownPosts() {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(CONTENT_DIR, file), "utf8");
      const { data, body } = parseFrontmatter(raw);
      return {
        slug: data.slug || file.replace(/\.md$/, ""),
        title: data.title || file.replace(/\.md$/, ""),
        excerpt: data.excerpt || excerptFrom(body),
        content: body,
        coverImage: data.coverImage || data.cover_image || null,
        author: data.author || "Runward",
        tags: (data.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
        date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
        lang: data.lang === "zh" ? "zh" : "en",
        translationSlug: data.translationSlug || data.translation_slug || null,
      };
    });
}

async function databasePosts() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(
      `${url}/rest/v1/blog_posts?select=slug,title,excerpt,content,cover_image_url,author,tags,published_at,created_at&published=eq.true&order=published_at.desc&limit=${MAX_PRERENDERED_POSTS}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt || excerptFrom(row.content || ""),
      content: row.content || "",
      coverImage: row.cover_image_url || null,
      author: row.author || "Runward",
      tags: row.tags || [],
      date: new Date(row.published_at || row.created_at).toISOString(),
      lang: /-(zh|cn|hk)$/i.test(row.slug || "") || /[\u4e00-\u9fff]/.test(row.title || "")
        ? "zh"
        : "en",
      translationSlug: null,
    }));
  } catch {
    return [];
  }
}

async function allPosts() {
  const bySlug = new Map();
  for (const post of await databasePosts()) bySlug.set(post.slug, post);
  for (const post of markdownPosts()) bySlug.set(post.slug, post);
  return [...bySlug.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_PRERENDERED_POSTS);
}

function writeSitemap(posts) {
  const entries = [
    ...STATIC_ROUTES,
    ...posts.map((p) => ({
      path: `/blog/${p.slug}`,
      alternate: p.translationSlug
        ? { hrefLang: p.lang === "zh" ? "en" : "zh-HK", path: `/blog/${p.translationSlug}` }
        : null,
      lang: p.lang,
      lastmod: p.date.slice(0, 10),
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...entries.map((e) =>
      [
        `  <url>`,
        `    <loc>${BASE_URL}${e.path}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
        e.priority ? `    <priority>${e.priority}</priority>` : null,
        e.lang
          ? `    <xhtml:link rel="alternate" hreflang="${e.lang === "zh" ? "zh-HK" : "en"}" href="${BASE_URL}${e.path}" />`
          : null,
        e.alternate
          ? `    <xhtml:link rel="alternate" hreflang="${e.alternate.hrefLang}" href="${BASE_URL}${e.alternate.path}" />`
          : null,
        `  </url>`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    `</urlset>`,
  ].join("\n");
  writeFileSync(resolve("public/sitemap.xml"), `${xml}\n`);
  console.log(`sitemap.xml written (${entries.length} entries)`);
}

function writeFeed(posts) {
  const items = posts
    .map((p) =>
      [
        `    <item>`,
        `      <title>${escapeXml(p.title)}</title>`,
        `      <link>${BASE_URL}/blog/${p.slug}</link>`,
        `      <guid isPermaLink="true">${BASE_URL}/blog/${p.slug}</guid>`,
        `      <pubDate>${new Date(p.date).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(p.excerpt)}</description>`,
        `    </item>`,
      ].join("\n"),
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Runward Blog</title>
    <link>${BASE_URL}/blog</link>
    <description>Running training, pacing and posture guides from Runward.</description>
    <language>en</language>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  writeFileSync(resolve("public/feed.xml"), xml);
  console.log(`feed.xml written (${posts.length} items)`);
}

function headTags({ title, description, canonical, image, type, jsonLd, lang, alternates }) {
  const absoluteImage = image ? (image.startsWith("http") ? image : `${BASE_URL}${image}`) : null;
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    absoluteImage ? `<meta property="og:image" content="${absoluteImage}" />` : null,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    absoluteImage ? `<meta name="twitter:image" content="${absoluteImage}" />` : null,
    lang ? `<meta property="og:locale" content="${lang === "zh" ? "zh_HK" : "en_US"}" />` : null,
    ...(alternates ?? []).map(
      (a) => `<link rel="alternate" hreflang="${a.hrefLang}" href="${BASE_URL}${a.href}" />`,
    ),
    `<link rel="alternate" type="application/rss+xml" title="Runward Blog" href="${BASE_URL}/feed.xml" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ]
    .filter(Boolean)
    .join("\n    ");
}

function renderShell(template, head, bodyHtml) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");
  html = html.replace(
    /<meta\s+name="description"[^>]*>\s*/i,
    "",
  );
  html = html.replace(
    /<meta\s+property="og:(?:type|title|description|url|image)"[^>]*>\s*/gi,
    "",
  );
  html = html.replace(/<meta\s+name="twitter:(?:title|description|image)"[^>]*>\s*/gi, "");
  html = html.replace("</head>", `  ${head}\n  </head>`);
  html = html.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root">${bodyHtml}</div>`,
  );
  return html;
}

async function prerender() {
  const distIndex = resolve("dist/index.html");
  if (!existsSync(distIndex)) {
    console.warn("dist/index.html missing — skipping blog prerender");
    return;
  }
  const template = readFileSync(distIndex, "utf8");
  const posts = await allPosts();

  // /blog index
  const indexBody = `<main><h1>Runward Blog</h1><p>Training guides, pacing strategy and posture notes for runners.</p><ul>${posts
    .map(
      (p) =>
        `<li><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a> — ${escapeHtml(p.excerpt)}</li>`,
    )
    .join("")}</ul></main>`;
  const indexHead = headTags({
    title: "Runward Blog — Running training guides for 10K, half marathon & marathon",
    description:
      "Practical running training guides from Runward: how to start long distance running, 10K, half marathon and marathon plans, pacing and posture — in English and Chinese.",
    canonical: `${BASE_URL}/blog`,
    image: null,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Runward Blog",
      url: `${BASE_URL}/blog`,
    },
  });
  mkdirSync(resolve("dist/blog"), { recursive: true });
  writeFileSync(
    resolve("dist/blog/index.html"),
    renderShell(template, indexHead, indexBody),
  );

  for (const post of posts) {
    const canonical = `${BASE_URL}/blog/${post.slug}`;
    const head = headTags({
      title: `${post.title} — Runward Blog`,
      description: post.excerpt,
      canonical,
      image: post.coverImage,
      type: "article",
      lang: post.lang,
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
        mainEntityOfPage: canonical,
        ...(post.coverImage ? { image: post.coverImage } : {}),
      },
    });
    const body = `<main><article><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(
      post.author,
    )} — <time datetime="${post.date}">${post.date.slice(0, 10)}</time></p>${
      post.coverImage
        ? `<img src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}" width="1600" height="900" loading="lazy" />`
        : ""
    }${marked.parse(post.content)}</article></main>`;
    const dir = resolve(`dist/blog/${post.slug}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderShell(template, head, body));
  }
  console.log(`prerendered /blog and ${posts.length} post page(s)`);
}

const mode = process.argv[2] ?? "sitemap";
if (mode === "prerender") {
  await prerender();
} else {
  const posts = await allPosts();
  writeSitemap(posts);
  writeFeed(posts);
}
