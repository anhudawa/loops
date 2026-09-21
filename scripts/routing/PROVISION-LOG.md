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

## Verify from any browser
`http://2.28.33.245:17777/brouter?lonlats=-6.11,53.57|-6.05,53.60&profile=loops-road&alternativeidx=0&format=geojson`
→ a GeoJSON route = engine live.

## Phase 2 (later, ~€86/mo)
Upgrade this server to GraphHopper for instant draw-to-snap + graph-native surface data.
