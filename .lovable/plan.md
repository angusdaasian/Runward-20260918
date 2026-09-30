# RunWard native UI refresh

## Direction: RunWard Fresh

A light, performance-focused mobile interface that feels closer to a polished iOS fitness app than a responsive website.

- **Palette:** warm white `#F7F8F6`, soft health green `#E7F4EC`, RunWard green `#178A4B`, deep ink `#18211C`
- **Typography:** Outfit for headings and key numbers; Figtree for labels and body text
- **Structure:** modular bento layout, with one clear primary item per screen and quieter supporting information
- **Shape:** restrained 8–12px corners, thin borders, minimal shadows, no excessive pills or nested cards
- **Interaction:** 44px minimum touch targets, native bottom sheets, clear pressed states, subtle 150–250ms motion, reduced-motion support
- **Navigation:** preserve the existing five bottom tabs and their behavior, while simplifying the active state

## What will change

### 1. Unify the visual system
- Refine the existing semantic colors, spacing, type hierarchy, borders, shadows, and control states around the RunWard Fresh direction.
- Consolidate reusable mobile patterns for section headings, metric tiles, grouped rows, segmented controls, empty states, and loading states.
- Keep Traditional Chinese and English layouts equally readable, including larger text-size settings.

### 2. Refresh the mobile shell
- Make the header calmer and more compact while preserving the avatar-led settings access.
- Restyle the five-tab navigation as a stable native tab bar with clearer selection and no oversized sliding background.
- Preserve safe-area handling, tab state, and existing navigation behavior.

### 3. Redesign the Home experience
- Establish a strong hierarchy: daily health snapshot, latest activity, next workout, then monthly context.
- Turn the health summary into a balanced bento group rather than several equally prominent boxes.
- Simplify activity syncing, connected-app empty states, service notices, and loading feedback.
- Keep all current Stridee-first data priority, attribution, actions, and calculations unchanged.

### 4. Align Training and Analytics
- Give the current workout and weekly plan clear priority in Training; reduce visual density in calendars and supporting controls.
- Replace web-style underlined tabs and tiny utility actions with native segmented controls and icon actions.
- Standardize analytics widgets, chart containers, drag/customize controls, and detail sheets without changing their data or ordering features.

### 5. Simplify Races, Community, and More
- Apply the same hierarchy and reusable patterns to the remaining three tabs.
- Present More as native grouped settings and destination rows, reducing oversized tiles and repeated card framing.
- Preserve premium, privacy, connection, language, notification, admin, and account actions exactly as they work now.

### 6. Complete the native states
- Create consistent skeletons, empty states, error/retry states, disabled states, confirmations, and bottom sheets.
- Ensure icon buttons have labels for accessibility and every important action remains reachable at larger text sizes.

## Technical approach

- Keep this a presentation-only refactor: no database, synchronization, notification, provider, premium, or training-logic changes.
- Build shared visual primitives first, then migrate one tab at a time to reduce regression risk.
- Use semantic theme tokens throughout; provider branding and Garmin attribution remain untouched.
- Preserve client-side behavior outside the existing SSR blog.
- Verify English and Traditional Chinese at mobile widths, large text, empty/data-filled states, and reduced motion.
- Deliver copies of every edited file under `/mnt/documents` after validation.

## Rollout order

1. Design tokens, shared patterns, header, and bottom navigation
2. Home
3. Training and Analytics
4. Races, Community, and More
5. Cross-screen state, accessibility, and mobile visual QA
