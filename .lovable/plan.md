# Make the blog properly indexable

Your blog is already served as real HTML for search engines — the app itself stays client-side. So the fix isn't "add server rendering", it's repairing what search engines actually see today.

## What I checked on the live site

- `https://runward.site/blog/race-fueling-guide` returns the full article text and a unique title. Good.
- **But every blog address in your sitemap redirects.** Requesting `/blog/race-fueling-guide` returns a 301 to `/blog/race-fueling-guide/` (with a trailing slash). The address you tell Google is the official one is not the address that answers — Google reports these as "Page with redirect" / "Alternate page with canonical tag" and often leaves them out of the index. Same for `/blog` itself.
- The same page is also reachable on two other addresses (`angustest.site`, `welcome-ward-start.lovable.app`). Both correctly point back to runward.site, so this is secondary, but it does dilute crawling.
- New posts written in the admin only get their HTML page when the site is rebuilt, so a fresh post can be invisible to Google for a while.
- Robots rules and the sitemap are otherwise fine (20 addresses, all readable).

## What I'll do

1. **Remove the redirect.** Generate each blog page as a single file (`/blog/<slug>.html`) instead of a folder, so `/blog/race-fueling-guide` answers directly with 200 and matches the sitemap and the canonical tag exactly. Same for the blog index.
2. **Keep old folder addresses working** so nothing that's already linked or indexed breaks.
3. **Publish new posts to Google faster.** Rebuild the sitemap and page HTML whenever a post is published from the admin, instead of only on the next site build, and include a real last-modified date per post.
4. **Reduce duplicate copies.** Tell crawlers not to index the preview/alternate hostnames, so only runward.site competes for the ranking.
5. **Verify.** Fetch each blog address after deploying and confirm 200 with no redirect, correct title, correct canonical, and full article text present.

## Optional, and worth it

Connect Google Search Console to this project so I can read the real reasons Google gives for each blog address (indexed / redirect / crawled-not-indexed) instead of inferring them, and submit the sitemap after the fix. Say the word and I'll open the connection step.

## Technical notes

- `scripts/blog-static.mjs` (`prerender` mode) currently writes `dist/blog/<slug>/index.html`; Netlify's pretty-URL handling then 301s the extension-less path to the folder form. Switching output to `dist/blog/<slug>.html` (plus the blog index as `dist/blog.html`) makes the extension-less path resolve with 200.
- Add folder-form → flat-form entries in `public/_redirects` ahead of the SPA fallback so previously crawled `/blog/<slug>/` URLs 301 to the canonical form.
- Add `<lastmod>` in `writeSitemap` from each post's `published_at`/`updated_at`, omitted when unknown.
- Trigger the static regeneration from the admin publish action (build hook) so a new post's HTML and sitemap entry exist without a manual rebuild.
- Serve `X-Robots-Tag: noindex` for non-runward hostnames (Netlify header rule / edge condition), keeping runward.site fully indexable.
- No change to app rendering: everything outside `/blog` stays client-side.
