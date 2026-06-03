## Goal

Add a Text Size control (Default / Large / Extra Large) to the **Settings page** (`MoreTab.tsx`), and make the UI absorb larger text gracefully so nothing clips or breaks.

## Where it lives

In `src/components/MoreTab.tsx` — a new "Display / 顯示" section (or appended to the existing preferences section). Three-segment pill labeled "Text size / 文字大小" with A · A+ · A++ samples so users see the change at a glance. No change to `AppHeader`'s popover.

## How it works

Scale via the root `<html>` `font-size`. All Tailwind sizing is rem-based, so one change cleanly scales the whole app.

- **Default** — `16px`
- **Large** — `18px` (+12.5%)
- **Extra Large** — `20px` (+25%)

Persist in `localStorage`, mirror the `useSimpleMode` pattern (cross-tab event sync, instant updates).

## UI hardening for larger text

1. **Tab/header bars** — swap fixed `h-12`/`h-14` for `min-h-*` + `py-*` so they grow with text.
2. **Truncations** — audit `truncate` on activity titles and stat labels; switch safe spots to `line-clamp-2`. Add `min-w-0` to flex parents so big numbers don't overflow.
3. **Buttons/inputs** — scoped CSS on `html[data-text-scale="lg"|"xl"]` bumps shadcn `h-9`/`h-10` to `h-10`/`h-11` and widens horizontal padding.
4. **Bottom nav** — opt out of scaling (fixed `text-[11px]`, 22px icons) so nav height stays stable and safe-area math doesn't reflow every page.
5. **Charts** — Recharts tick fonts read a new CSS var `--chart-tick-size` (12 / 13 / 14 px) that tracks the scale.
6. **Headlines** — clamp a few onboarding/hero classes with `clamp()` to avoid absurd display sizes on small phones at XL.
7. **Cards** — slightly larger `gap`/`p-*` at lg/xl via a `.ui-scale-pad` utility, so layout breathes proportionally.

## Technical details

### New hook `src/hooks/use-text-scale.ts`

Mirror `use-simple-mode`. Stores `"default" | "lg" | "xl"` in `localStorage` (`text_scale`), fires `text-scale-change`, exposes `[scale, setScale]`. On mount/change:
```ts
const map = { default: "16px", lg: "18px", xl: "20px" };
document.documentElement.style.fontSize = map[scale];
document.documentElement.dataset.textScale = scale;
```

### `src/index.css`
```css
:root { --chart-tick-size: 12px; }
html[data-text-scale="lg"] { --chart-tick-size: 13px; }
html[data-text-scale="xl"] { --chart-tick-size: 14px; }

html[data-text-scale="lg"] .ui-scale-pad { padding: 0.875rem; }
html[data-text-scale="xl"] .ui-scale-pad { padding: 1rem; }

.bottom-nav, .bottom-nav * { font-size: 11px !important; }
```

### `MoreTab.tsx`
New "Display" card with a 3-segment toggle (same pill styling as existing toggles in the file). i18n EN/ZH. `aria-pressed` on each segment.

### `index.html`
Inline pre-paint `<script>` reads `text_scale` from localStorage and applies `html.style.fontSize` + `dataset.textScale` before first render — prevents FOUC.

### Files touched
- new `src/hooks/use-text-scale.ts`
- `src/index.css` — vars + nav opt-out + scale-aware paddings
- `src/components/MoreTab.tsx` — new Display section with the control
- `index.html` — pre-paint script
- `src/components/AppHeader.tsx` bottom nav — add `.bottom-nav` class
- Targeted polish on charts (read `--chart-tick-size`) and a small `truncate` → `line-clamp-2` sweep on activity/stat cards

## Out of scope
- Per-screen overrides, font-family change, server-side persistence
