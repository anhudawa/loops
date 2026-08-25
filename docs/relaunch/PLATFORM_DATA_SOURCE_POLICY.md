# LOOPS platform and route-data source policy

Status: launch policy, pending Irish legal review  
Reviewed: 25 August 2026  
Scope: commercial Ireland road beta

This document is an operational product policy, not legal advice. Irish counsel
must review the contributor licence, privacy notice, consumer terms and each
planned platform integration before the paid public launch.

## Non-negotiable rule

Mapping and fitness platforms may help a rider record, export or receive a
route. They never replace the named person who rode it.

A file can enter LOOPS review only when it is:

1. uploaded by the named contributor from their own completed ride;
2. a GPX, FIT or TCX activity recording with timestamps, not a planned route;
3. consistent with the contributor's claimed ride date and closed as a loop;
4. hashed and tied to the exact immutable geometry version;
5. covered by the contributor's rights and sensitive-location declarations;
6. reviewed by a LOOPS curator before publication.

No public links, heatmaps, segments, popular-route feeds or other users'
activities may be scraped or copied to seed the catalogue.

## Integration decisions

| Source | Ireland beta decision | What LOOPS may do now | Gate for direct integration |
|---|---|---|---|
| Rider-owned GPX/FIT/TCX | Allow | Accept a timestamped completed-ride file and retain only the parsed route plus evidence metadata | Human review and contributor declarations |
| Strava | File export only; API blocked | A contributor may identify their upload as a Strava file export; LOOPS does not connect to Strava or ingest API data | Written platform clearance and Irish legal review; current API restrictions are incompatible with using Strava data to populate a shared commercial route library |
| RideWithGPS | File export only for beta | Accept a contributor's own completed-trip export and record RideWithGPS as private provenance | Obtain written commercial/API permission and agree attribution, retention, deletion and onward-publication rules before OAuth or API work |
| Komoot | File export only | Accept a contributor's own completed-activity GPX | Komoot states that it has no publicly accessible API; pursue an approved partner integration, never an undocumented endpoint |
| Garmin | File export only | Accept a contributor's own FIT/GPX/TCX recording | Apply to the Garmin Connect Developer Program, execute its agreement, rebuild with OAuth 2, pass partner testing and satisfy branding/attribution requirements |
| Wahoo | File export only | Accept a timestamped rider-owned recording | Obtain Cloud API approval, request only the necessary OAuth scopes, complete legal review and implement deletion/disconnection handling |
| Other devices/apps | File export only | Accept a timestamped rider-owned recording | Add a named integration only after product, security, privacy and legal approval |

## Why direct Strava ingestion is blocked

Strava's API Agreement and Policy effective 1 June 2026 say that developers may
not create competing applications, restrict disclosure of one user's Strava
data to other users, and prohibit commercial or third-party access through its
MCP outside personal use. That does not fit a shared commercial LOOPS library.
The code therefore hard-disables Strava connection, activity browsing and
direct route import. Contributor-uploaded exports remain a separate legal
question for counsel; they are allowed only as a controlled beta intake path,
not treated as platform permission.

Official sources:

- [Strava API Agreement](https://www.strava.com/legal/api)
- [Strava API Policy](https://www.strava.com/legal/api_policy)
- [Strava Terms](https://www.strava.com/legal/terms)

## RideWithGPS position

RideWithGPS documents an OAuth API and says in its Community Guidelines that
people retain ownership of rides and routes they create. Its general Terms also
place responsibility on contributors to have the rights needed for copying and
use. Those public pages are not enough by themselves to establish LOOPS' right
to republish route data obtained through an automated commercial integration.
LOOPS will start with contributor-owned completed-trip exports and seek a
written partnership before direct sync.

Official sources:

- [RideWithGPS API documentation](https://ridewithgps.com/api/v1/doc/)
- [RideWithGPS Terms](https://ridewithgps.com/terms)
- [RideWithGPS Community Guidelines](https://support.ridewithgps.com/hc/en-us/articles/32004052138907-Community-Guidelines)

## Komoot position

Komoot supports exporting routes and completed activities as GPX files, but it
states that it has no publicly accessible API. LOOPS may accept a contributor's
own completed-activity export. It will not scrape Komoot or use undocumented
interfaces. A direct sync requires Komoot partner approval.

Official sources:

- [Komoot export and import guidance](https://support.komoot.com/hc/en-us/articles/10115477099674-Export-and-import-Routes-and-Activities)
- [Komoot API position](https://support.komoot.com/hc/en-us/articles/7464746034458-Komoot-API)

## Garmin position

Garmin describes its Connect Developer Program as an enterprise/business
programme. Its Activity API can provide activity files and its Courses API can
send routes to devices after approval. Garmin's current programme documentation
uses OAuth 2. The old untested OAuth 1 client in this repository is therefore
hard-disabled even if credentials are present. Re-enable only after programme
approval, an OAuth 2 rebuild, partner-environment testing and brand review.

Official sources:

- [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/)
- [Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/)
- [Garmin Courses API](https://developer.garmin.com/gc-developer-program/courses-api/)
- [Garmin programme FAQ](https://developer.garmin.com/gc-developer-program/program-faq/)

## Wahoo position

Wahoo's Cloud API supports OAuth scopes for reading and writing routes, but
Wahoo limits API use to applications it approves. During the Ireland beta,
Wahoo is therefore a recording-source label only. A later approved integration
should be designed first for sending a reviewed LOOPS route to the consenting
rider's account. Reading a private completed activity as evidence is a separate
capability and requires its own minimised scope, retention rules and legal
approval.

Official source:

- [Wahoo Cloud API](https://developers.wahooligan.com/cloud)

## Capability architecture

LOOPS treats the external-platform relationship as four separate permissions.
The checked-in `PLATFORM_INTEGRATION_POLICY` makes these decisions testable.

| Capability | Ireland beta | Later release gate |
|---|---|---|
| Owner completed-ride file | Allowed for every listed source | Timestamp validation, contributor declarations, immutable evidence hash and independent review |
| Direct private activity evidence | Disabled | Named-user OAuth consent, platform approval where required, Irish legal review, data-minimisation design, revocation/deletion handling and integration tests |
| Public catalogue import | Prohibited | No release gate: public visibility is not contributor authority or proof of a completed ride |
| Send reviewed route to rider/device | Disabled | Platform/partner approval, minimum OAuth scopes, brand review, version-safe delivery and a support/runbook owner |

This lets LOOPS “lean on” the established platforms without outsourcing its
trust model to them. They provide recording provenance and, later, convenient
delivery; LOOPS retains the named rider, ride evidence, route version, curator
decision, suitability assessment and publication history.

## Base maps, routing and geocoding

OpenStreetMap data is suitable for commercial products under the ODbL when its
licence and attribution requirements are followed. The community tile and
Nominatim servers are not commercial infrastructure: both are best-effort,
capacity-limited services whose access can be withdrawn. Production LOOPS must
use a contracted OSM-derived tile/geocoding/routing provider or self-hosted
services, with visible OSM and provider attribution.

The current CARTO basemap URL also needs a LOOPS-issued API key under CARTO's
basemap terms. A contracted map stack is therefore a launch gate, not an item to
defer until traffic grows.

Official sources:

- [OpenStreetMap copyright and ODbL attribution](https://www.openstreetmap.org/copyright)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [CARTO basemap terms](https://carto.com/legal/basemap-terms/)

### Road-intelligence map matching

The Clontarf lab may map-match an already approved contributor recording to a
directed road graph. This is analysis of evidence LOOPS is already permitted
to process; it is not permission to ingest another platform's public route
catalogue. The current implementation supports Valhalla `trace_attributes`
because it returns the traversed OSM way/node identity and normalized road
attributes required for evidence coverage.

There is deliberately no default public map-matching URL. Staging writes
require a contracted or self-hosted endpoint and an explicit environment
approval. A public demonstration server can be useful for manual technical
evaluation but is not commercial infrastructure.

Official source:

- [Valhalla map-matching API](https://valhalla.github.io/valhalla/api/map-matching/)

## Data minimisation and publication

- Source references remain visible only to LOOPS reviewers.
- LOOPS does not publish timestamps, heart rate, power, cadence or device IDs.
- The raw file is hashed; the published product uses the reviewed geometry,
  summary elevation and route description.
- Contributor names, route geometry and ride date are public only after review.
- A start or finish that may reveal a home or other sensitive place is rejected;
  changing it requires a newly evidenced route version, not silent editing.
- Rights withdrawal, deletion and platform-disconnection procedures must be
  operational before the paid beta.

## Commercial rollout order

1. Build the first 25–40 Irish loops through named club, coach and rider
   contributors using file exports and the review workflow.
2. Apply to Garmin's business programme and open a RideWithGPS partnership
   conversation while the closed beta is running.
3. Contract the production map/geocoding/routing stack before public traffic.
4. Add direct integrations only when written terms, deletion handling,
   attribution, security and human-ride provenance all pass review.
5. Re-run this review before Girona and again before Mallorca; permissions and
   operator relationships do not automatically transfer between markets.

## Integration delivery order

1. **Ireland closed beta:** manual completed-activity uploads in GPX/FIT/TCX;
   reviewed GPX downloads for riders. No account connections.
2. **Ireland product validation:** begin Garmin, RideWithGPS and Wahoo partner
   applications. Prefer outbound course delivery because it improves the rider
   experience without weakening route provenance.
3. **Ireland scale:** consider consented private activity retrieval only if
   manual contribution is the measured supply bottleneck. Preserve the same
   declarations and human review; an API response never auto-publishes.
4. **Girona readiness:** repeat legal/platform review, recruit local riders and
   curators, and create a Girona-specific evidence set. Do not copy Irish
   publication decisions or infer safety from platform popularity.
5. **Mallorca readiness:** follow the same gated process only after Girona's
   quality, retention and commercial targets are met.
