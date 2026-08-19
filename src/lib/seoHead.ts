/**
 * Client-side head updates for SPA routes. Crawler-visible head tags for
 * /blog routes are injected at build time by scripts/blog-static.mjs.
 */
export const SITE_URL = "https://angustest.site";

interface SeoOptions {
  title: string;
  description?: string;
  canonical?: string;
  image?: string | null;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | null;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function applySeoHead({
  title,
  description,
  canonical,
  image,
  type = "website",
  jsonLd,
}: SeoOptions) {
  if (typeof document === "undefined") return;

  document.title = title;
  upsertMeta("property", "og:title", title);
  upsertMeta("name", "twitter:title", title);
  upsertMeta("property", "og:type", type);

  if (description) {
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:description", description);
    upsertMeta("name", "twitter:description", description);
  }

  if (image) {
    const absolute = image.startsWith("http") ? image : `${SITE_URL}${image}`;
    upsertMeta("property", "og:image", absolute);
    upsertMeta("name", "twitter:image", absolute);
  }

  if (canonical) {
    const url = canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`;
    upsertMeta("property", "og:url", url);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;
  }

  document.head.querySelectorAll('script[data-seo-jsonld="true"]').forEach((n) => n.remove());
  if (jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoJsonld = "true";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  }
}
