# RunWard Live Data Dashboard

Static admin page showing live data received from all providers. No build step.

Deploy on Netlify: Import repo → Base directory `live-dashboard` → no build command → publish `.`.
Point a subdomain (e.g. `live.runwardapp.com`) at the Netlify site with a CNAME (hostname only).

Sign in with an admin account (email + password). Data comes from the `admin-live-feed`
(every 5 s) and `admin-data-status` (every 60 s) functions, both admin-only.
