# Roadmap

- [x] Prevent recalibration from creating duplicate or back-to-back interval sessions
- [x] Add user-controlled recalibration history clearing
- [x] Validate edge function, database access, and frontend behavior
- [x] Save update announcement drafts (docs/marketing/2026-09-11-update-posts.md)
- [x] Rebuild race-time prediction as one shared engine (src/lib/raceForecast.ts) used by Analytics, AI program estimate and on-track check
- [x] Replace Community XP rankings with opt-in monthly kilometre leaderboards
- [x] Add private leaderboard groups with invitation links and QR codes
- [x] Add an opt-in, proximity-ranked social running wall with privacy controls
- [x] Likes and comments on runs in the public and friends feeds
- [x] Per-group push notification toggle ("friend just ran" alert, EN/ZH)
- [x] Show run start times and shared group names in social feeds
- [x] Private group chat inside each running group (realtime, unread badges, push notifications)
- [x] Redesign the personal page as a compact category hub
- [x] Surface Personal Bests and Heart Rate Zones on More, split its connection categories, and move social privacy into App Settings
- [x] Let users drag and resize the stats overlay on activity photo share cards
- [ ] After publish: resubmit sitemap in Search Console + verify /blog returns 200 (no redirect)
- [x] Reposition Garmin attribution on sharing cards
- [ ] Force a 7-day Terra/Garmin resync for c7a7 — blocked: external Supabase cannot provide an admin session

## New workspace setup
- [x] Connect Google Search Console (previous workspace connections no longer apply)
- [ ] Temporary Garmin/Railway fallback while Terra Garmin is down: direct Garmin connect for Garmin users + 1-minute polling from 2026-09-21T10:40Z (Terra data overwrites later)
- [x] Stop the Garmin poller during database recovery and remove full-history Terra sample downloads from list views
- [x] Add problems-only service status updates on Home with admin-managed bilingual messages
- [x] Restore the original direct-navigation Stridee connection flow
- [x] Fix Stridee mobile Garmin consent loop with secure-browser return to RunWard
