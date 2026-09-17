# Friendlier More page

## Goal
Make the first More screen the place for personal information and achievements, while the four categories focus only on connections, guides, and settings.

## Main More screen
- Keep the compact profile header and its Edit Profile action at the top.
- Keep Premium directly visible in its current position.
- Place the Personal Bests panel immediately below Premium.
- Add a polished Personal Bests achievement panel directly on this screen:
  - prominent trophy/medal treatment and Running Score;
  - show the runner’s recorded distances and times without entering a category;
  - retain Detect from activities, manual record entry, and delete controls in an expandable editor so the main screen stays concise;
  - show a purposeful empty state for runners without records.
- Place Heart Rate Zones immediately below Personal Bests, before the four-category grid:
  - show the five coloured zones and current max/resting heart-rate summary on the main screen;
  - provide an Edit action that opens the existing zone editor without passing through a category;
  - preserve links from activity details that currently open heart-rate settings.
- Signed-out visitors see concise sign-in states instead of private record and heart-rate data.

## Four categories
Replace the current category set with exactly:

1. **Connect Fitness Apps / 連接健身應用程式**
   - Primary fitness data source management.
   - Existing third-party connected-app access.
   - Keep the one-fitness-provider-at-a-time behaviour unchanged.

2. **Connect Communication Apps / 連接通訊應用程式**
   - WhatsApp and Telegram messaging connections.
   - Keep the current Beta status and existing connection flows.

3. **Running Guides / 跑步指南**
   - Training definitions, long-distance running guide, and fueling guide.

4. **App Settings / 應用程式設定**
   - Move leaderboard and public-run sharing switches here under a clear Community Privacy section.
   - Dark mode, language, text size, AI chat, activity notifications, home-screen widget, offer code, privacy policy, and account deletion.

Support, admin access, and sign-out remain below the category grid.

## UI treatment
- Preserve the selected Runward Fresh green-neutral palette and Outfit/Figtree typography.
- Make Personal Bests feel earned rather than like another settings card: trophy icon, strong score hierarchy, compact record tiles, and subtle achievement accents using existing semantic colours.
- Keep the four category tiles aligned and equal-height in English and Chinese.
- Avoid nested cards and keep the main page scannable on a phone.

## Technical details
- Refactor `ProfileSection` so its profile header, personal-best content, and heart-rate content can render as focused sections on the More screen instead of being coupled to the removed Profile & Health category.
- Split the current combined Connections destination into fitness and communication destinations while preserving all existing callbacks and state.
- Move `CommunityPrivacy` from `ProfileSection` to the App Settings view; its Supabase behaviour and opt-in defaults remain unchanged.
- Keep the existing `#hr-zones` and `focus-hr-zones` entry points working by scrolling to or opening the direct Heart Rate Zones editor.
- No database or business-rule changes.

## Verification
- Check signed-in and signed-out states in English and Chinese at phone width.
- Verify PB detection, adding/deleting records, heart-rate editing, all four category destinations, privacy switches, and back navigation.
- Confirm category titles/subtitles align, records do not overflow, and the page builds without errors.
