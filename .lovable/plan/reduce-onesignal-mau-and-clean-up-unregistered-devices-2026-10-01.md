# Reduce OneSignal MAU and clean up unregistered devices

## Audit findings
- The app only links a phone to an account after sign-in (`setonesignalplayerid` with the account ID), and never before. So the website code does not create the extra users.
- The extra ~1,000 come from the iPhone/Android app wrapper (Despia): it starts OneSignal as soon as the app opens, so every install, including people who never sign up, becomes an anonymous OneSignal user and counts toward MAU.
- Signing out never unlinks the phone, so a shared or reinstalled phone can stay attached to an old account.
- All notifications are sent by account ID (`include_external_user_ids`), so anonymous devices never receive anything. Deleting them loses nothing.

## 1. One-off cleanup (admin-only, dry run first)
- New admin-only server function `onesignal-cleanup`:
  1. Requests a OneSignal CSV export of all subscriptions (the export API in the delete-users guide), downloads it and reads it.
  2. Sorts each row into: linked to a current account / linked to a deleted account / no account (anonymous).
  3. **Dry run (default):** returns the counts only. Nothing is deleted.
  4. **Delete run:** removes the anonymous and deleted-account users one by one with `DELETE /apps/{app_id}/users/by/onesignal_id/{id}`, with throttling, batches that continue on their own, and a report at the end.
- Admin Panel → Notifications gets a "Clean up OneSignal" card with "Check" (dry run) and "Delete N unregistered" buttons.
- Deleted-account users are also removed going forward: the delete-account function will delete that account's OneSignal user (`/users/by/external_id/{uid}`).

## 2. Future registration: only after sign-up
- Turn off "auto-register for push on launch" / the startup permission prompt in Despia's OneSignal settings (a dashboard setting you change; I'll give the exact steps). OneSignal then won't create a user until the app asks for it.
- After sign-in, the app links the account first, then asks for notification permission (Despia's push permission request), so the prompt shows only for real accounts.
- On sign-out, the phone is unlinked from the account (Despia's OneSignal logout, if available), so it stops getting that person's notifications.

## Notes
- MAU already counted this month won't go down until next month's billing period, even after deletes.
- Deletes in OneSignal can't be undone, so the dry-run counts are shown before anything is removed.
- Requires the OneSignal REST key to be a current "App API key" (the deletion API rejects old legacy keys); I'll check it and ask you for a new one if needed.

## Technical details
- Files: new `supabase/functions/onesignal-cleanup/index.ts` (admin check via `has_role`, self-chaining with `EdgeRuntime.waitUntil`), `src/components/admin/NotificationManager.tsx` card, `supabase/functions/delete-account/index.ts`, `src/contexts/AuthContext.tsx` (permission request after linking, unlink on sign-out).
- Matching uses `profiles.user_id` / auth user IDs against each subscription's `external_user_id`.
