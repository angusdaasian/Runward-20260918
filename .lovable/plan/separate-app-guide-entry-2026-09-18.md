# Separate App Guide entry

## Changes
- Remove the full usage guide from the Support & Help page so that page remains focused on tickets and contact support.
- Add a separate `App Guide` / `使用教學` row immediately below Support & Help in More.
- Open the existing detailed bilingual guide as its own in-app page with a back button returning to More.

## Technical details
- Add a lightweight App Guide route that reuses `HowToUseGuide`.
- Preserve the current language and return location when navigating.
- Verify the app compiles and the two More entries open distinct pages.
