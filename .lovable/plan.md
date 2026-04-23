

## Onboarding redesign — "Quiet Sport" direction

Restyling `src/components/Onboarding.tsx` only. No logic, validation, auth, i18n, or asset changes.

### Design language

- **Surface**: solid `--background` dark on all data steps. Photo only on the welcome screen (darkened to 80% with bottom gradient).
- **Type**: `font-display` (Space Grotesk) for question headers at ~28px / semibold / tight tracking. Inter for body and helpers.
- **Icons**: replace every emoji header with a 24px monochrome `lucide-react` icon in `text-muted-foreground`. Emojis removed from buttons and microcopy.
- **Inputs**: borderless underline style — `border-0 border-b border-border/50 rounded-none bg-transparent focus:border-primary` — replacing the glass pill inputs.
- **Buttons**: standardized `h-12 rounded-lg`. Primary = `bg-primary text-primary-foreground`. Secondary = `border border-border/50 bg-transparent`. Tertiary = ghost link.
- **Progress**: single 2px line at the top, fills left-to-right with `--primary`. Replaces the segmented pill bar.
- **Accent**: only `--primary` (existing green). White is text only.
- **Theme lock**: wrap the onboarding root in a `dark` class so the redesign renders consistently regardless of system preference.

### Screen-by-screen

| Step | Change |
|---|---|
| 0 Welcome | Keep hero photo, darken to 80%, add bottom gradient. 64px logo. Display headline "Run with intention." Filled primary CTA + ghost "I have an account" + small "Continue as guest" link. |
| 1 Name / 3 Gender / 4 Age | Solid dark surface. Lucide icon (User / UserCircle / Cake) at 24px. Display question header. Underline input, 56px height. Helper line below in muted-foreground. |
| 5 Runs/week | Horizontal segmented selector 0–7 in one row. Selected = primary fill, others = subtle border. |
| 6 Race time | 2×2 distance cards keeping the medal images, distance label in display type. Time inputs as one inline group (HH : MM : SS) with monospace digits. Inline validation. |
| 7 Before/After | Replace teal gradient with dark card + thin primary left-edge bar. Replace dotted runner row with a horizontal line + small primary arrow icon. Time deltas use success token. Add caption: "Projected after a 12-week training block." |
| 8 Email + social | Apple (black), Google (outlined white), divider, underline email input. |
| 9 Password | Two underline inputs + 3-bar live strength meter beneath the first. |
| 10 Plan prompt | Remove 🎉. Headline "Your plan is ready." Primary card "Start 7-day free trial — Generate my plan", ghost card "Skip for now". Redemption code as collapsed link. |
| 11 Loading | 3-dot phased loader with rotating microcopy ("Calibrating pace zones…", "Reading your VDOT…"). |
| 12 OTP | Restyle slots to match underline input language. |
| Sign-in | Same dark surface as data steps (no photo bg). |

### Preserved

- All step state machine, validation, Supabase auth, OTP/reset, VDOT/distance math, i18n keys, existing assets (`gingrun-logo.png`, badge PNGs, `onboarding-bg.jpg`).
- No new dependencies, no migrations, no new files.

### Files

- `src/components/Onboarding.tsx` — visual restructure only.

