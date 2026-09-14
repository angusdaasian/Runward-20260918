# Edit private group names

## What will change
- Add an edit action beside each private group name for the group leader only.
- Let the leader rename the group inline, then save or cancel.
- Keep members’ group names read-only.
- Show clear success and error feedback, and refresh group lists after saving.

## Technical details
- Use the existing owner-only update permission on `leaderboard_groups`; no database changes are needed.
- Validate that the edited name is not blank before saving.
- Reuse the existing buttons, input, language handling, and group refresh callback.
