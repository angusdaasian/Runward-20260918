# RunWard MCP server

Lets Claude (and other MCP clients) read a RunWard user's runs and daily health data, read-only.
Each user creates a private link in RunWard → More → "Connect Claude".

## Deploy (GitHub + Netlify)
1. Push this folder to a new GitHub repo.
2. Netlify → Add new site → Import from GitHub → pick the repo (settings are read from netlify.toml).
3. Site settings → Environment variables:
   - `SUPABASE_URL` = https://kbghvclwhxnjeskdodeh.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase dashboard → Project Settings → API → service_role key (keep secret!)
   Redeploy after adding them.
4. Domain: Netlify → Domain management → Add domain `mcp.runwardapp.com`.
   At your DNS provider add: CNAME `mcp` → `<your-site>.netlify.app`. Netlify issues HTTPS automatically.

## Use in Claude
Settings → Connectors → Add custom connector → paste
`https://mcp.runwardapp.com/mcp?key=rw_...` (from the app).

## Tools
- list_runs(from?, to?, min_km?, limit?)
- get_run(id)
- daily_health(from?, to?)
- training_summary(from?, to?)

## Test
curl -X POST "https://mcp.runward.site/mcp?key=rw_..." -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
