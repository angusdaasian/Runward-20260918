## Goal
Introduce a second visual theme called **Modern** (inspired by the dark, glassy, deep-contrast look in the reference image) while keeping today's look as the **Classic** theme. Users pick the theme from the Settings (More) tab.

## Reference interpretation
The screenshots show: very deep near-black background, elevated dark cards with subtle vertical gradient, large rounded corners, bright accent color used sparingly, fine 1px subdued borders, soft glow shadows, and high-contrast white typography. We'll translate this into a token set — no image is embedded.

## Scope (UI / presentation only)
- Add a theme switcher to Settings; persist choice in `localStorage` (`app_palette`: `"classic" | "modern"`).
- Apply theme via a `theme-modern` class on `<html>` (in addition to existing `dark` class for dark mode).
- Define a complete token set for Modern in `src/index.css` so every screen rethemes automatically — no per-component rewrites.
- Light/dark toggle still works: Modern has both a light and dark variant, but defaults to dark (matching the reference).

## Files to change
1. **`src/index.css`** — add `.theme-modern { … }` (light) and `.theme-modern.dark { … }` token blocks: background, card, popover, primary, border, muted, ring, radius (larger), plus a couple of gradient/shadow custom properties for the elevated card look.
2. **`tailwind.config.ts`** — expose two optional utilities mapped to the new custom properties (`--gradient-card`, `--shadow-elevated`) so cards can opt into the layered look without breaking Classic.
3. **`src/contexts/ThemeContext.tsx`** *(new, tiny)* — reads/writes `app_palette`, toggles the `theme-modern` class on `documentElement`, exposes `{ palette, setPalette }`. Initialized in `src/App.tsx` so theme applies before first paint.
4. **`src/App.tsx`** — wrap with `ThemeProvider` (sibling of `PremiumProvider`).
5. **`src/components/MoreTab.tsx`** — add a "Appearance / Theme" row under the existing dark-mode toggle with a segmented control (Classic | Modern). Bilingual labels (en/zh) via existing `t()` helper. No other settings touched.

## Token sketch (Modern dark)
```text
--background: 0 0% 5%
--card: 0 0% 8%           (with --gradient-card linear-gradient top→bottom into 0 0% 11%)
--border: 0 0% 14%
--foreground: 0 0% 96%
--muted-foreground: 0 0% 60%
--primary: kept brand green (consistency)
--radius: 1rem            (rounder than Classic's 0.625rem)
--shadow-elevated: 0 12px 32px -12px hsl(0 0% 0% / 0.6)
```
Classic tokens remain untouched, so users who don't switch see no change.

## Out of scope
- No business-logic or backend changes.
- No new images, fonts, or per-component restyles — restyling is purely token-driven.
- Landing page (`src/pages/Landing.tsx`) keeps its current marketing look.

## QA
- Toggle Classic ↔ Modern in Settings and confirm Home, Activities, Training, Analytics, Coach, and More rethemes consistently.
- Toggle dark ↔ light within each palette.
- Confirm choice persists across reloads and on native (Despia) shell.
