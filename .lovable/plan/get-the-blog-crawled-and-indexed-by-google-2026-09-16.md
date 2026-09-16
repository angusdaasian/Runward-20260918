# Get the blog crawled and indexed by Google

## What Google actually says (Search Console, checked live)

- Homepage: **indexed**, crawled 13 Sep 2026, one known backlink (pacecalculator.fun).
- `/blog`: **"Discovered – currently not indexed"** — known but never crawled.
- Blog post pages: **"URL is unknown to Google"**.
- Sitemap: processed with 0 errors, but **0 of 18 addresses indexed**.
- Live HTML check: `/blog/<slug>` 301-redirects to `/blog/<slug>/` (trailing slash), so the address the sitemap and canonical tag declare is never the one that answers.

Diagnosis: not an HTML/SSR problem (blog pages already serve full article HTML). It's a crawl-priority problem: young domain, one backlink, and a canonical URL that redirects. This plan removes the technical friction and raises crawl priority.

## Work items

1. **Fix the canonical/redirect mismatch (core fix).** In `scripts/blog-static.mjs`, write posts as flat files (`dist/blog/<slug>.html`, index as `dist/blog.html`) so `/blog/<slug>` returns 200 directly — matching the sitemap and canonical tag. Add `_redirects` entries so the old `/blog/<slug>/` folder form 301s to the canonical form.
2. **Add `<lastmod>` to the sitemap** from each post's `published_at`/`updated_at` (omit when unknown), so crawlers can tell new/updated posts apart.
3. **Strengthen internal links.** Add a visible "Guides & articles" link to the landing page footer (and nav where natural) pointing to `/blog`, plus each blog post already links to translations — ensure the blog index links every post with descriptive anchor text (it does; verify after change).
4. **Deindex duplicate hosts.** Serve `X-Robots-Tag: noindex` on non-runward hostnames (angustest.site, welcome-ward-start.lovable.app) so crawl budget and authority concentrate on runward.site.
5. **Regenerate sitemap + prerendered pages on each build** (already wired via prebuild/postbuild); confirm the same output also lands on the Netlify-deployed runward.site build.
6. **Resubmit the sitemap** to Search Console after publishing, then verify with URL Inspection that a blog post and `/blog` return 200 directly.

## What only you can do (no code can)

- In Search Console, open each key blog URL in **URL Inspection → Request indexing** (this API can't submit indexing requests). ~10 min for the main posts.
- Build backlinks (share posts on Threads/IG bio, running forums, the pacecalculator.fun cross-link both ways) — with one backlink, discovery is slow no matter what we ship.

## Expected result

All `/blog` addresses answer 200 with no redirect and match the sitemap exactly; Google re-crawls (helped by the resubmitted sitemap, lastmod, internal links and your indexing requests) and blog pages move from "unknown/discovered" to indexed over the following days-to-weeks. The app stays fully client-side; only the blog output is pre-rendered, as today.
