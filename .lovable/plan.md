## Garmin/Terra deeplink return via pacecalculator.fun

### Files

**1. New: `src/pages/TerraReturn.tsx`**
- Reads `?status=success|failure&provider=...`
- On mount: `window.location.href = "despia://pacecalculator.fun/?tab=more&page=connect-apps&terra=<status>&provider=<p>"`
- After 1.2s shows fallback card: "Open Runward app" button (re-fires deeplink) + "Continue in browser" link to `https://pacecalculator.fun/?tab=more&page=connect-apps&terra=<status>`
- Minimal standalone UI using design tokens (bg-background, bg-card, text-primary, etc.)

**2. `src/App.tsx`**
- Import `TerraReturn`
- Register `<Route path="/terra-return" element={<TerraReturn />} />`

**3. `src/components/ConnectApps.tsx` (handleTerraConnect, ~line 200)**
- Replace dynamic `window.location.origin` redirect URLs with hardcoded:
  - `https://pacecalculator.fun/terra-return?status=success&provider=<P>`
  - `https://pacecalculator.fun/terra-return?status=failure&provider=<P>`
- Existing in-app `?terra=success` handler (lines 175-191) remains unchanged — it fires once the deeplink reopens the app at `/?tab=more&page=connect-apps&terra=success`.

### No changes
- `terra-auth-init` edge function — already forwards whatever URLs the client sends
- Existing toast + `loadTerraConns()` polling in ConnectApps
