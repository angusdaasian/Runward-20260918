# UI Refresh: "RunWard Fresh"

A single visual direction for the whole app, based on the choices you already locked in during the audit.

## The look

- **Light only.** Page background #F7F8F6, soft green surface #E7F4EC for cards that carry data, primary green #178A4B, ink #18211C for text.
- **Type.** Outfit for headings and numbers, Figtree for body text — already loaded in the app.
- **Shape language.** One radius scale everywhere: 10px for small controls, 16px for cards, 24px for sheets. No more mix of sharp and very round boxes.
- **Bento layout.** Data screens become a tidy grid of differently sized tiles: one big tile for the headline number, smaller paired tiles beside it, wide tiles for charts. Fewer borders, more breathing room, quiet shadows instead of outlines.
- **Native feel.** 44px minimum tap targets, segmented pill tabs instead of underlined web tabs, sheets that slide from the bottom, short spring transitions, tactile press states.

## What changes, screen by screen

1. **Home** — hero greeting and today's headline stat in one large tile; steps, sleep, resting HR, HRV as small tiles; recent activity and map as wide tiles. Friendlier empty and loading states.
2. **Analytics** — widget grid adopts the bento sizes (big/small/wide) instead of uniform squares; sub-tabs become segmented pills; detail sheets get the new sheet styling.
3. **Training / Programs** — week strip and workout cards restyled on the new surface and radius scale; clearer distinction between planned and completed.
4. **Community** — feed cards, group rows and leaderboard rows unified to one card style.
5. **More / settings** — grouped list rows in the iOS style: rounded group containers, inset dividers, right-aligned chevrons.
6. **Shell** — five bottom tabs with the new active-state treatment; headers get consistent height and title weight.

## Technical notes

- All colors, radii and shadows go in as semantic tokens in `src/index.css` plus `tailwind.config.ts`; components stop using ad-hoc values.
- New shared primitives: `BentoTile`, `SegmentedTabs`, `ListGroup`/`ListRow`, `StatTile`, and standard empty/skeleton states, so screens converge instead of each being restyled by hand.
- Dark mode tokens stay in the file but the app stays light-only for now.
- No business logic, data fetching, sync, or notification code is touched — this is presentation only.

## Order of work

1. Tokens + primitives.
2. Shell (tabs, headers) and Home.
3. Analytics.
4. Training, Community.
5. More/settings, then a pass over empty/loading states.
