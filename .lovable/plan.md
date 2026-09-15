# Group chat inside running groups

Private text chat for each running group. Only members of a group can read or post; there are no public chats and no direct one-to-one chats.

## UI approach — keep it clean

Today groups live inside a popup (invite code, members, toggles), which is the wrong place for a conversation. Chat becomes its own space:

1. A new **Groups / 群組** section in the Community tab (beside Leaderboards, Social, CityHunter).
2. That section lists your groups as rows: emoji, name, member count, last message preview, time, and an unread dot with count.
3. Tapping a row opens a **full-height chat screen**: back arrow + group name in a sticky header, messages below, message box pinned at the bottom, and a small menu in the header for the existing group settings (invite code, members, notification and invite toggles, rename, leave/delete) so nothing is duplicated.
4. If you are in no group yet, the section shows a single friendly empty state with the existing create/join controls.

Chat bubbles: your own messages right-aligned in the app's primary colour, others left-aligned on the card surface with avatar + name above the first message of a run of messages. Day separators. Messages grouped by sender. Auto-scroll to newest, "jump to latest" button when scrolled up. Bilingual (EN / 繁中) throughout.

## Behaviour

- Messages are text only, 1–1000 characters, trimmed; empty messages rejected.
- New messages appear live for everyone in the group (realtime subscription, cleaned up on unmount).
- Long press / tap-and-hold on your own message lets you delete it; group leader can delete any message in their group.
- Unread count per group = messages newer than your last-read marker for that group. Opening the chat marks it read.
- Optional: reuse the existing per-group notification switch so a new chat message also pushes to members who have that group's notifications on. (Included — same toggle, same wording, no new setting.)

## Database (migration)

New tables, both with grants + RLS:

- `group_messages` — `id`, `group_id` (FK `leaderboard_groups`, cascade), `user_id`, `body text`, `created_at`, `deleted_at`. Indexed on `(group_id, created_at desc)`.
  - Read: only members (`is_leaderboard_group_member(group_id, auth.uid())`).
  - Insert: only members, and `user_id = auth.uid()`.
  - Update/delete (soft delete): own message, or group owner.
- `group_message_reads` — `group_id`, `user_id`, `last_read_at`; primary key `(group_id, user_id)`. Own-row read/write only.

New SECURITY DEFINER helpers (EXECUTE to `authenticated` + `service_role`, revoked from `PUBLIC`/`anon`), matching the existing group RPC style:

- `get_group_messages(p_group_id uuid, p_before timestamptz, p_limit int)` → message rows joined to `profiles` for `display_name` / `avatar_url`, newest-first paging.
- `send_group_message(p_group_id uuid, p_body text)` → validates membership + length, inserts, returns the row.
- `delete_group_message(p_message_id uuid)` → soft delete, own message or group owner.
- `get_my_group_chat_summaries()` → per group: last message body, last message time, last sender name, unread count. Powers the group list rows.
- `mark_group_chat_read(p_group_id uuid)` → upsert `last_read_at = now()`.

`group_messages` added to the realtime publication so the live subscription works with RLS intact.

## Files

**New**
- `src/components/community/GroupChatList.tsx` — the group rows with last message + unread badge, plus empty state wrapping the existing create/join controls.
- `src/components/community/GroupChatRoom.tsx` — full-height chat screen: header (back, name, settings menu), message list, composer.
- `src/components/community/GroupChatMessage.tsx` — one bubble (grouping, day separator, delete action).
- `src/hooks/use-group-chat.ts` — loads messages, paginates older on scroll-up, realtime subscribe/cleanup, send, delete, mark-read.
- `src/hooks/use-group-chat-summaries.ts` — group list summaries + total unread count.

**Changed**
- `src/components/RewardsTab.tsx` — add the Groups tab (mobile).
- `src/components/dashboard/DashboardCommunity.tsx` — add the same Groups sub-tab (desktop).
- `src/components/community/GroupManager.tsx` — expose it as the chat header's settings menu content in addition to its current button, so settings are reachable from inside a chat.
- `supabase/functions/notify-group-activity/index.ts` — reuse its push helper for new-message notifications (or a small sibling function `notify-group-message`, registered in `supabase/config.toml` with `verify_jwt = false` and the same `x-webhook-key` check + trigger pattern already used for activity pushes).

## Technical notes

- Message send is optimistic: the bubble appears immediately with a sending state, replaced by the server row (or marked failed with a retry tap).
- Paging: 40 messages initially, 40 more when scrolled to the top.
- Realtime: one channel per open chat (`group-chat:<group_id>`), subscribed in `useEffect`, `supabase.removeChannel` in cleanup.
- Unread badge also shows on the Community tab's Groups label so users notice new messages without opening it.
- No new privacy toggle: group chat visibility follows group membership, which is already invite-only.

## Verification
- Build passes; no new lint errors.
- Two members in one group: message sent by one appears live for the other.
- Non-member cannot read or insert (RLS check via a direct query).
- Unread count increments, then clears on open.
- Own message deletes; leader can delete another member's message; a normal member cannot.
