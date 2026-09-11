# Prevent home-screen content pop-in

## Goal
Show one stable loading screen until the data visible on the initial Home screen has resolved, then reveal the complete screen at once.

## Changes
- Add an explicit readiness signal for today’s wearable and Apple Health statistics.
- Include activity, connection, profile, premium, and today-stat readiness in one initial Home gate.
- Keep cached values for speed, but do not reveal a partial Home screen while uncached values are still loading.
- Preserve later background refreshes without hiding an already-visible Home screen again.

## Validation
- Verify a cold start shows only the existing Home skeleton before the complete screen.
- Verify no “connect,” empty-state, Today Stats, or premium content appears late.
- Confirm the project builds successfully.
