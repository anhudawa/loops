# Routing server — provisioning record (Phase 1)

**Date:** 2026-09-21 · **Project:** Hetzner Cloud `loops` (only) · **Method:** Hetzner Cloud API + cloud-init (no SSH)

## Billable resources created
| Resource | Details | Monthly (VAT incl.) |
|---|---|---|
| ~~Server `loops-routing-1` (id 166821563)~~ | v1 — Docker image didn't exist; **deleted 2026-09-21** (no ongoing cost) | — |
| Server `loops-routing-2` (id 166828758) | CX33 · 4 vCPU / 8 GB / 80 GB · Ubuntu 24.04 · Falkenstein (fsn1) · IPv4 **2.28.33.245** (same IP reassigned) · BRouter 1.7.10 + `loops-road` | €10.44 |
| Automatic backups (enable_backup) | 20% of server price | ~€2.09 |
| Firewall `loops-routing-fw` (id 11657836) | inbound 22/tcp + 17777/tcp only | €0.00 |
| **Total** | | **~€12.53 / month** (under the €13 Phase 1 ceiling) |

Approved by owner: CX33 + backups (2026-09-21). Nothing created outside the `loops` project. No paid extras.

## What the server runs
cloud-init (`scripts/routing/cloud-init-brouter.yaml`): OS hardening (key-only SSH,
fail2ban, unattended security updates, ufw), Docker, BRouter segment tiles for
Ireland + 10 destination regions, BRouter served on :17777.

## Wiring the app
Vercel env var: `BROUTER_URL=http://2.28.33.245:17777/brouter` → redeploy.
Rollback: remove the env var (app falls back to the public brouter.de).

## Verified LIVE 2026-09-21 (owner's browser): GeoJSON returned, `loops-road` profile present.
## Verified END-TO-END 2026-09-21: production loops.ie generation via this engine — Clontarf '2 hour rolly loop' → 53 km, quality 84, 0% main roads, no spur (40.8 s). Note: BROUTER_URL must live on the Vercel project `gravel-ireland` (the one serving www.loops.ie).

## Verify from any browser
`http://2.28.33.245:17777/brouter?lonlats=-6.11,53.57|-6.05,53.60&profile=loops-road&alternativeidx=0&format=geojson`
→ a GeoJSON route = engine live.

## Phase 2 — CANCELLED (owner: "Zero cost confirmed", 2026-09-21)
GraphHopper/PostGIS not needed. The engine's own per-segment road tags
(BRouter geojson `messages`) now feed quality scoring and the Road Standard
compromise report (`src/lib/road-segments.ts`). No new spend.

## cloud-init v3 — built, NOT yet applied (needs a fresh API token)
`scripts/routing/cloud-init-brouter.yaml` is now generated from
`cloud-init-brouter.template.yaml` + `profiles/*.brf` by
`node scripts/routing/build-cloud-init.mjs`. v3 embeds BOTH profiles:
- `loops-road` with `correctMisplacedViaPoints = true` (the live server still
  runs v2 with `false`);
- `loops-road-relaxed` — the fallback the app calls ONLY when the strict
  profile finds no route; the app then measures and names the compromise
  stretch or drops the candidate.
Until the server is re-provisioned with v3, relaxed-profile requests return
400 and the app simply declines those candidates (safe). Re-provision =
rebuild `loops-routing-2` with the new user_data (no new server, no new
cost), verify `profile=loops-road-relaxed` returns GeoJSON, then revoke the
token.

## cloud-init v3 addendum (2026-09-22)
- Strict profile `loops-road` now costs primary 30×, trunk 60×, fast roads
  20× instead of "impossible" (the engine's cost ceiling made a 200 m link
  dearer than a 70 km detour; Girona loops ballooned to 200 km). Motorways,
  unpaved, tracks, paths stay impossible. Every main/fast metre is still
  measured and named by the compromise detector; the serving policy decides.
- The custom-profile directory is passed RELATIVE (`../../custom`). Verified
  locally: `POST /brouter/profile` returns `{"profileid":"custom_<n>"}`,
  `POST /brouter/profile/custom_<n>` updates it in place, and
  `profile=custom_<n>` routes. After the v3 rebuild the app can push profile
  updates itself — no further re-provisioning for profile changes.
- The LIVE server (v2) still has the absolute path and the old 10000-cost
  profile, so uploads fail there and Girona/Calpe loops keep declining until
  the rebuild.

