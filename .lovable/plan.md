# Fix running group rename

## What will change
- Replace the direct group-table edit with a dedicated rename action.
- Allow only the signed-in group leader to rename their group.
- Keep blank names rejected and show the actual failure message when saving fails.

## Technical details
- Add a security-definer database function that verifies `auth.uid()` owns the group before updating its name.
- Grant only signed-in users access to call it; ownership remains enforced inside the function.
- Update the group menu to call this function and refresh the displayed group list after success.
