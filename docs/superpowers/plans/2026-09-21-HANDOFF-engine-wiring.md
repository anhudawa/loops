# HANDOFF — routing engine wiring (for tomorrow)

## State
- Our routing server **loops-routing-2** (Hetzner, 2.28.33.245:17777) is LIVE and
  verified from the owner's browser, with the `loops-road` road-standard profile.
- The spur rule, the honest decline, and precise diagnostics are all deployed.
- **Production loops.ie is NOT using our engine yet.** Decline diagnostics show
  `_engine: brouter.de` → the app still calls the public demo, which now
  returns HTTP 400 to every candidate (`NO_PATH[http:400] × 5`).

## Root cause
`BROUTER_URL` is not visible to the production runtime. Almost certainly the
Vercel variable was not applied to the **Production** environment (or the name
has a typo). The engine itself is fine.

## Fix (owner, ~2 minutes)
1. Vercel → loops project → Settings → Environment Variables.
2. Ensure an entry: Name **`BROUTER_URL`**, Value **`http://2.28.33.245:17777/brouter`**
   (http, not https; ends in /brouter), Environment: **Production ✓**.
3. Redeploy production.
4. Verify instantly (no generation needed): open
   **https://www.loops.ie/api/engine/status** → `own_engine: true`, `engine: "2.28.33.245:17777"`.
5. Then the live test: "2 hour rolly loop" from Clontarf should serve a clean
   quiet-road loop (locally it returns 53 km, quality 84, 0% main roads).
6. Only then: say "engine verified" → revoke the Hetzner token.

## Rollback
Remove BROUTER_URL → app falls back to brouter.de (public, unreliable).
