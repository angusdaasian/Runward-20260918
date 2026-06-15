import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-muted rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{children}</pre>
);

export default function ApiDocs() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 bg-background z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-lg font-semibold">Runward API Documentation</h1>
      </header>
      <main className="max-w-3xl mx-auto p-4 prose prose-sm prose-neutral dark:prose-invert space-y-6">

        <section>
          <h2>Overview</h2>
          <p>
            The Runward API lets your app read a user's profile and activities, and receive a webhook whenever
            a new activity is recorded from any of the user's connected sources (Strava, Intervals.icu, Garmin,
            Polar, Suunto, Apple Health, Terra).
          </p>
          <ul>
            <li>OAuth 2.0 authorization code flow with PKCE (S256)</li>
            <li>Bearer-token authentication on every API call</li>
            <li>HMAC-SHA256 signed webhooks</li>
            <li>Default rate limits: <b>200 requests / 15 min</b>, <b>2,000 / day</b>, up to <b>300 athletes per app</b></li>
          </ul>
        </section>

        <section>
          <h2>1. Register your app</h2>
          <ol>
            <li>Sign in to Runward and open <a href="/developers" className="text-primary underline">the Developer Portal</a>.</li>
            <li>Click <b>New app</b> and provide: name, contact email, one or more <code>redirect_uris</code>, and (optional) a <code>webhook_url</code>.</li>
            <li>Apps are reviewed manually. Once approved you'll see your <code>client_id</code>; the <code>client_secret</code> and webhook signing secret are revealed <b>only once</b>. Store them securely.</li>
          </ol>
        </section>

        <section>
          <h2>2. OAuth authorization</h2>
          <p>Redirect the user's browser to:</p>
          <Code>{`GET https://welcome-ward-start.lovable.app/oauth/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=activity:read
  &state=RANDOM_OPAQUE
  &code_challenge=BASE64URL(SHA256(verifier))
  &code_challenge_method=S256`}</Code>
          <p>The user approves; Runward redirects to your <code>redirect_uri</code> with <code>?code=…&amp;state=…</code>.</p>
        </section>

        <section>
          <h2>3. Exchange code for tokens</h2>
          <Code>{`POST ${BASE}/oauth-token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "code": "<code from redirect>",
  "redirect_uri": "https://yourapp.com/callback",
  "code_verifier": "<the PKCE verifier>"
}`}</Code>
          <p>Response:</p>
          <Code>{`{
  "token_type": "Bearer",
  "access_token": "...",   // valid 6 hours
  "refresh_token": "...",  // valid 60 days, single-use (rotates on refresh)
  "expires_in": 21600,
  "scope": "activity:read"
}`}</Code>
        </section>

        <section>
          <h2>4. Refresh tokens</h2>
          <Code>{`POST ${BASE}/oauth-token
{
  "grant_type": "refresh_token",
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "..."
}`}</Code>
        </section>

        <section>
          <h2>5. API endpoints</h2>
          <p>All endpoints require <code>Authorization: Bearer &lt;access_token&gt;</code>.</p>

          <h3>GET /api-v1/athlete</h3>
          <Code>{`GET ${BASE}/api-v1/athlete

{
  "id": "uuid",
  "display_name": "Jane",
  "avatar_url": "https://...",
  "age": 34,
  "sex": "F"
}`}</Code>

          <h3>GET /api-v1/activities</h3>
          <p>Query params: <code>per_page</code> (max 100, default 30), <code>before</code>, <code>after</code> (ISO timestamps).</p>
          <Code>{`GET ${BASE}/api-v1/activities?per_page=30

{
  "activities": [
    {
      "id": "strava_8127...",
      "source": "strava",
      "name": "Morning run",
      "type": "Run",
      "start_date": "2026-06-15T07:21:00Z",
      "distance": 8421,
      "moving_time": 2654,
      "total_elevation_gain": 75
    }
  ]
}`}</Code>

          <h3>GET /api-v1/activities/:id</h3>
          <p>Returns the full provider-specific record. <code>id</code> is the prefixed id from the list endpoint.</p>
        </section>

        <section>
          <h2>6. Rate limits</h2>
          <p>Every response includes:</p>
          <Code>{`X-RateLimit-Remaining-15min: 197
X-RateLimit-Remaining-Day: 1843`}</Code>
          <p>On 429:</p>
          <Code>{`HTTP/1.1 429 Too Many Requests
Retry-After: 412
{"error":"rate_limit_exceeded"}`}</Code>
        </section>

        <section>
          <h2>7. Webhooks</h2>
          <p>
            When a new activity is recorded for an authorized user, Runward POSTs the following JSON to your
            registered <code>webhook_url</code>.
          </p>
          <Code>{`POST https://yourapp.com/runward/webhook
Content-Type: application/json
X-Runward-Signature: sha256=<hex hmac of raw body>

{
  "event": "activity.created",
  "object_type": "activity",
  "object_id": "strava_8127...",
  "owner_id": "<runward user uuid>",
  "app_id": "<your app uuid>",
  "delivered_at": "2026-06-15T07:25:01.234Z",
  "data": {
    "id": "strava_8127...",
    "source": "strava",
    "activity": { /* full activity row */ }
  }
}`}</Code>
          <h3>Verifying the signature</h3>
          <p>Compute HMAC-SHA256 of the <b>raw request body</b> using your app's webhook signing secret and compare hex-encoded to the value after <code>sha256=</code>. Constant-time compare.</p>
          <Code>{`// Node.js example
import crypto from "crypto";
const sig = req.headers["x-runward-signature"].split("=")[1];
const expected = crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return res.status(401).end();
}`}</Code>
          <h3>Retries</h3>
          <p>Non-2xx or timeout (10s) responses retry at <b>1m, 5m, 30m, 2h, 12h</b>, then marked dead.</p>
        </section>

        <section>
          <h2>8. Errors</h2>
          <table>
            <thead><tr><th>Status</th><th>error</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td>400</td><td>invalid_request / invalid_grant / unsupported_grant_type</td><td>Malformed or expired OAuth request</td></tr>
              <tr><td>401</td><td>invalid_client / invalid_token / token_expired</td><td>Bad client credentials or access token</td></tr>
              <tr><td>404</td><td>not_found</td><td>Unknown resource</td></tr>
              <tr><td>429</td><td>rate_limit_exceeded</td><td>Backoff per <code>Retry-After</code></td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>9. Scopes</h2>
          <ul>
            <li><code>activity:read</code> — read profile + activities + receive activity webhooks</li>
          </ul>
        </section>

        <section>
          <h2>10. Revocation</h2>
          <p>
            Users can revoke access any time from <b>Settings → Connected apps</b>. Once revoked, all API calls
            return <code>401 invalid_token</code> and no further webhooks fire.
          </p>
        </section>

        <section>
          <h2>Support</h2>
          <p>Questions: contact support@runward.app</p>
        </section>
      </main>
    </div>
  );
}
