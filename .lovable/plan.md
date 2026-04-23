

## How MFA works in the new `cyberjunky/python-garminconnect` + what you need to do

### How MFA is handled (upstream library)

The new library uses Garmin's **mobile SSO flow** (same as the Android app). MFA is not a separate endpoint — it's a **callback** you pass into the `Garmin()` constructor:

```python
client = Garmin(
    email,
    password,
    prompt_mfa=lambda: input("MFA code: "),   # called only when Garmin demands MFA
)
client.login("~/.garminconnect")  # writes garmin_tokens.json (mode 0600)
```

Key behaviour:
- `prompt_mfa` is called **only if** Garmin's SSO challenges with MFA. Accounts without MFA never trigger it.
- On success, the library exchanges the SSO ticket for **DI OAuth Bearer tokens** (`access_token` + `refresh_token`) and saves them to disk.
- Subsequent runs call `client.login("~/.garminconnect")` — it loads tokens and **auto-refreshes** them before each API call. No password, no MFA needed again until the refresh token itself expires/is revoked.

So MFA support in your Railway service = exposing `prompt_mfa` as a two-step HTTP flow:
1. `POST /garmin-login` with `{email, password}` → if MFA required, return `{needs_mfa: true, session_id}`.
2. `POST /garmin-login-mfa` with `{session_id, mfa_code}` → returns the serialised tokens.

For non-MFA accounts step 1 returns the tokens directly. The two-step shape is the only way to bridge Python's blocking `prompt_mfa` callback to a stateless HTTP API — typically done by running the login in a background thread and passing the code in via a queue, or by using `garth` directly (which exposes the same flow without a callback).

### Do you need to fork it into `angusdaasian/python-garminconnect`?

**No — you should stop forking and just install it as a dependency.**

Your fork made sense when you were patching the library. But:
- The upstream library is now actively maintained (release 0.3.3 yesterday, 70 releases, 2.2k stars).
- Forking means you have to manually sync forever and you lose auto-updates.
- Your Railway service doesn't need to *modify* the library — it just needs to *call* it.

**Recommended setup:**

| Repo | Role |
|---|---|
| `cyberjunky/python-garminconnect` | Pinned dependency: `pip install garminconnect>=0.3.3` |
| Your Railway service repo (whatever hosts `/garmin-activities`) | Imports `from garminconnect import Garmin`, exposes the HTTP endpoints, persists tokens to a writable path (e.g. `/tmp/tokens/{user_id}.json` or back to Supabase as JSON) |
| `angusdaasian/python-garminconnect` | **Archive or delete** — no longer needed |

If you previously had custom patches in your fork, port those into your Railway service code (wrap or subclass `Garmin`) instead of carrying a fork.

### What you actually need to do (in order)

1. **In your Railway service repo** (the Python service `GARMIN_RAILWAY_URL` points to):
   - Update `requirements.txt` / `pyproject.toml`:
     - Remove: `git+https://github.com/angusdaasian/python-garminconnect`
     - Add: `garminconnect>=0.3.3` and `curl_cffi`
   - Rewrite endpoints to use the new `Garmin(..., prompt_mfa=...).login(tokenstore)` pattern.
   - Add the two-step MFA flow (`/garmin-login` + `/garmin-login-mfa`) and a token-based `/garmin-activities`.
   - Persist `garmin_tokens.json` somewhere durable per user (or return tokens to Supabase and pass them back on each call).

2. **Archive `angusdaasian/python-garminconnect`** on GitHub (Settings → Archive). No more sync needed.

3. **Tell me the new endpoint shapes are live**, then I'll do the Lovable side (Part 2 from the previous plan): add `garmin_tokens jsonb` to `garmin_connections`, update `garmin-sync` edge function for the two-step MFA flow, and add the MFA code input to the connect UI.

### Optional: I can write the new Railway service code for you

If you want, I can produce a complete `main.py` (FastAPI) — all endpoints, MFA threading, token persistence — as a markdown file you paste into your Railway repo. Say the word and that becomes the next step.

