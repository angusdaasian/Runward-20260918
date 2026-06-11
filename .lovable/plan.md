## Goal

Replace the current hero section of `src/pages/Landing.tsx` with a "dappr-style" layout: dark canvas, big display headline on the left, two CTAs, and on the right an isometric stack of phone screenshots with selected widgets floating off the phone, glowing/highlighted in the brand mint-green to draw the eye.

Rest of the landing page (features, pricing, footer, etc.) stays unchanged.

## Layout (desktop)

```text
┌───────────────────────────────────────────────────────────────┐
│ runward                                              Sign in  │
│                                                               │
│  Everything you need                ┌──────────┐              │
│  to train, race, and                │ floating │  ← glowing   │
│  improve.                           │  widget  │     mint     │
│                                     └────┬─────┘              │
│  Tagline copy two lines max.             │                    │
│                                   ┌──────┴──────┐             │
│  [ Download on App Store ]        │   PHONE     │             │
│   View features                   │  screenshot │             │
│                                   │  (English)  │             │
│                                   └──────┬──────┘             │
│                                          │  ┌──────────┐      │
│                                          └──│ floating │ glow │
│                                             │  widget  │      │
│                                             └──────────┘      │
│                                                               │
│ ─────────────────────────────────────────────────────────── │
│ Product Stats  │  20k+ runners │ 6 sports │ ...               │
└───────────────────────────────────────────────────────────────┘
```

- Background: deep charcoal (`#1a1a1a`-ish via existing dark tokens) with a subtle warm radial highlight top-right, exactly like the reference.
- Headline: large display font, left-aligned, ~5 lines tall on desktop.
- Two CTAs: filled mint pill ("Get the app" / linked to App Store) + underlined text ("See features" anchor).
- Phone stack: uses existing screenshot assets — English uses `IMG_5586.PNG`-style activities screenshot, Chinese uses `IMG_5596.PNG`. A second smaller phone (analytics, `IMG_5591`/`IMG_5599`) sits behind/offset isometrically to create the layered feel.

## Floating highlighted widgets

The "floating away from the phone" elements that are highlighted in mint:
1. **Top-floating widget** — the **HRV** card cropped from the analytics screenshot, tilted ~ -8°, mint glow ring (`shadow-[0_0_60px_hsl(var(--primary)/0.55)]`), positioned above the phone.
2. **Bottom-right floating widget** — the **Today Stats / Steps** card cropped from the activities screenshot, tilted +6°, same mint glow.
3. Optional small mini-card: VO₂max value chip, also glowing, anchored bottom-left of the stack.

The widgets are reproduced as real React/Tailwind cards (not image crops) so they stay crisp, read in both languages, and can carry the glow. Each card has:
- mint border `border-primary/60`
- mint outer glow via box-shadow
- semi-transparent dark fill so they read as "lifted out of the screen"
- inner content mirrors the app: title + big number + unit.

Cards swap language with the existing `lang` state — EN versions show "Steps / Daily Steps / HRV" etc., ZH versions show "步數 / 每日步數 / HRV".

## Phones

- Use existing `IPhoneFrame` component to wrap two screenshot images.
- Primary phone (right): activities tab screenshot — `IMG_5586.PNG` (EN) / `IMG_5596.PNG` (ZH).
- Secondary phone (slightly behind, rotated): analytics tab — `IMG_5591.PNG` (EN) / `IMG_5599.PNG` (ZH).
- Upload all four screenshots to lovable-assets and import via `*.asset.json`.
- Apply `rotate-[-12deg] skew-y-[-6deg]` style isometric transform on the group, with subtle hover lift.

## Product Stats strip (bottom of hero)

Below the hero, replicate the reference's stat bar:
- 4 stats: e.g. "Runners onboarded", "Workouts logged", "Races indexed", "Countries". Numbers can be placeholders matching what the marketing page already states elsewhere (reuse existing copy where possible — won't fabricate new numbers if existing landing already has them).
- Mint accent bar to the left of the title block, mirroring the reference's mint label tab.

## Mobile

Stack vertically: headline → CTAs → phone composition centered, with floating widgets repositioned around the single primary phone (still glowing). Stats become a 2×2 grid.

## Files touched

- `src/pages/Landing.tsx` — replace hero JSX only (top section through stats strip). Nav, features, pricing, footer untouched.
- `src/components/landing/HeroPhoneStack.tsx` *(new)* — isometric phones + floating highlighted widget cards, language-aware.
- `src/components/landing/HeroStats.tsx` *(new)* — stat strip.
- `src/assets/appstore/` — add 4 new `.asset.json` pointers for the uploaded screenshots (EN activities, EN analytics, ZH activities, ZH analytics) via `lovable-assets create` from `/mnt/user-uploads/`.

## Out of scope

- No changes to features carousel, pricing table, FAQ, footer.
- No new copy in languages beyond what already exists; only the hero headline/CTAs get new strings (EN + ZH).
- No backend or data changes.
