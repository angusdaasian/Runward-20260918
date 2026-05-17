## Findings

I checked `supabase/functions/_shared/terraWebhookHandler.ts`, which is the single entry point for all Terra webhooks (used by `terra-webhook` and `terra-webhook-test`).

### 1. `deauth` — ✅ Correct, does NOT re-launch auth

Lines 706–707:

```ts
} else if ((type === "deauth" || type === "access_revoked") && terraUserId) {
  await supa.from("terra_connections")
    .update({ active: false, last_webhook_at: new Date().toISOString() })
    .eq("terra_user_id", terraUserId);
}
```

The handler only flips `active = false` on the matching `terra_connections` row. No call to `authenticateUser`, no widget URL is generated, nothing is pushed to the client. So the "deauth preceded the first re-auth" you observed is simply Terra's normal lifecycle (Terra sends `deauth` for the old `user_id`, then later sends `auth` for the brand-new `user_id` after the user finishes the widget). Our code is not the trigger.

`terra-disconnect/index.ts` does call `deauthenticateUser`, but that's only when the user taps Disconnect in the app — never from a webhook.

### 2. `user_reauth` — ❌ Not handled at all (bug)

The switch in `processWebhook` only branches on `auth`, `deauth`/`access_revoked`, `activity`/`processed_activity`, `daily`, `sleep`. A `user_reauth` payload currently falls through with no action.

Per Terra's spec, the payload looks like:

```json
{
  "type": "user_reauth",
  "old_user": { "user_id": "<old-terra-uuid>", "provider": "GARMIN", ... },
  "new_user": { "user_id": "<new-terra-uuid>", "provider": "GARMIN", "reference_id": "<app-user-id>", ... }
}
```

Because we never update `terra_connections.terra_user_id` to `new_user.user_id`, every subsequent webhook for that connection (`activity`, `daily`, `sleep`, future `deauth`) arrives with the new id and fails to map to an app user via `findUserId`, so data silently stops flowing.

There is also a secondary parsing issue: `handleTerraWebhook` (line 954–955) reads `payload.user.user_id`, but `user_reauth` payloads don't have a `user` key — they have `old_user` / `new_user`. So `terraUserId` ends up `null` and even the event log row is missing identifying info.

## Plan

### A. Fix payload parsing in `handleTerraWebhook` (lines ~950–957)

For `user_reauth`:
- Treat `payload.new_user` as the primary user object (used for `terraUserId`, `referenceId`, `provider`).
- Pass `payload.old_user` through to `processWebhook` via a new optional argument so the handler can match the existing row.

For all other types, behavior is unchanged.

### B. Add `user_reauth` branch in `processWebhook` (insert after the `deauth` branch around line 707)

Logic (no widget, no re-launch — purely a server-side id swap):

```ts
} else if (type === "user_reauth" && terraUserId) {
  const oldTerraId: string | null = oldUser?.user_id ?? null;
  if (oldTerraId) {
    // Update the row keyed by the old Terra user id to the new one,
    // keep active = true, refresh scopes/reference if present.
    const rawScopes = user?.scopes;
    const scopesArr = Array.isArray(rawScopes)
      ? rawScopes
      : typeof rawScopes === "string" && rawScopes.length > 0
        ? rawScopes.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    const patch: Record<string, unknown> = {
      terra_user_id: terraUserId,
      active: true,
      last_webhook_at: new Date().toISOString(),
    };
    if (referenceId) patch.reference_id = referenceId;
    if (scopesArr !== undefined) patch.scopes = scopesArr;
    const { error } = await supa.from("terra_connections")
      .update(patch)
      .eq("terra_user_id", oldTerraId);
    if (error) processingError = `user_reauth update: ${error.message}`;
  } else {
    // Fallback: if Terra didn't send old_user, try reference_id which is
    // our app user id.
    if (referenceId) {
      await supa.from("terra_connections")
        .update({ terra_user_id: terraUserId, active: true, last_webhook_at: new Date().toISOString() })
        .eq("user_id", referenceId)
        .eq("provider", provider);
    }
  }
  // Stop — do NOT trigger a backfill (the connection itself is unchanged)
  // and do NOT launch a new auth flow.
}
```

Key properties:
- Stored `terra_user_id` is rewritten in place, so `findUserId` keeps working for the next `activity` / `daily` / `sleep` webhook.
- `active` is set back to `true` in case a paired `deauth` arrived first and flipped it off.
- No widget / no `authenticateUser` call — matches the spec's "stop" requirement.
- No backfill triggered — Terra continues sending data for the new id automatically.

### C. Log row improvement

In `handleTerraWebhook`, when `type === "user_reauth"`, write both `old_user` and `new_user` into `terra_webhook_events.payload` so it's diagnosable later.

### Out of scope

- No client-side changes. The widget is never launched from a webhook.
- No DB migration — `terra_connections.terra_user_id` is already writeable.
- `terra-disconnect` keeps calling `deauthenticateUser` (correct, user-initiated only).

## Files touched

- `supabase/functions/_shared/terraWebhookHandler.ts` — payload parsing + new `user_reauth` branch + improved event log payload.

That's it. Roughly ~40 lines added, no behavior changes to existing event types.
