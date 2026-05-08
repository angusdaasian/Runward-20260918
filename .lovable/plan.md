## Change

In `src/components/activities/ActivityCalendar.tsx`, extend the calendar header subtitle to show this week's running distance next to the monthly total.

New format:
- EN: `12.4 km ran / 5.2 km ran this week`
- ZH: `12.4 km 已跑 / 5.2 km 本週已跑`

If there are no monthly activities, keep the existing "No activities" / "暫無活動" message (no week segment).

## Implementation

1. Add a `weeklyTotalKm` `useMemo` after `monthlyTotalKm` (line 154):
   - Compute Monday of the current real week (today, not viewed month): `day = now.getDay()`; `offsetToMon = day === 0 ? 6 : day - 1`.
   - Sum `act.distance / 1000` for activities where `start_date` falls in `[monday, monday+7d)`.
   - Dependency: `[activities]`.

2. Update the `<p>` at lines 180–184 to append ` / ${weeklyTotalKm.toFixed(1)} km ran this week` (or ZH equivalent) when `monthlyTotalKm > 0`.

## Notes

- "This week" is always the real current week, independent of which month the user is viewing in the calendar (so the value stays meaningful when navigating to past months).
- Uses local time, consistent with the existing `formatDateKey` logic.
