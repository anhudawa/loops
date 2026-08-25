# LOOPS Ireland-first commercial relaunch

Status: active  
Product scope: road cycling  
Expansion order: Ireland → Girona → Mallorca  
Core rule: no public loop without evidence that a named human rode that exact version

## Product promise

LOOPS finds enjoyable road loops for a rider's location, available time and
session. Software interprets, filters, analyses and ranks the library. It does
not invent consumer route geometry when the library has no human-ridden match.

Every public route must show who rode it, when it was last ridden, which exact
geometry version was assessed and whether LOOPS has permission to publish it.
Workout suitability is a separate, segment-level assessment.

## Launch sequence

### 1. Ireland beta

- Dublin and Wicklow supply first; broaden only when search coverage is dense.
- 25–40 reviewed road loops before a closed rider beta.
- Endurance, tempo, sweet spot and threshold matching at launch.
- 50–100 invited riders from clubs, coaches and existing communities.
- Public pages can explain the catalogue, but route matching, GPX access and
  ride measurement are limited to approved beta riders while willingness to
  pay for route and workout intelligence is tested.
- Contributor recruitment, supply allocation, beta waves and commercial test
  rules are defined in
  [`IRELAND_CONTRIBUTOR_AND_BETA_OPERATIONS.md`](./IRELAND_CONTRIBUTOR_AND_BETA_OPERATIONS.md).
- The offers, payment prerequisites, decision thresholds and operator pilot are
  pre-registered in
  [`COMMERCIAL_VALIDATION_PLAN.md`](./COMMERCIAL_VALIDATION_PLAN.md).

### 2. Girona pilot

- Start only after the Ireland trust and usage gates pass.
- One named local operator, coach or bike shop partner.
- 20–30 permissioned routes ridden by local contributors.
- First paid operator pilot and Garmin/RideWithGPS distribution work.

### 3. Mallorca pilot

- Start after Girona proves the repeatable destination playbook.
- Reuse the same contributor agreements, evidence model, editorial workflow,
  freshness rules and operator product.

## Phase 0: trust reset

### Code and data controls

- [x] Make Ireland the only active launch market.
- [x] Make road the only launch discipline.
- [x] Disable fresh consumer route generation.
- [x] Disable direct Strava-to-public-route importing.
- [x] Disable arbitrary public route URL importing.
- [x] Require uploaded ride evidence, a ridden date and a rights declaration.
- [x] Add immutable route-version and ride-attestation schema.
- [x] Create the route, first version and attestation atomically.
- [x] Enforce matching route/version ownership for evidence, reviews,
  workout assessments and beta events.
- [x] Replace ratings-based verification with evidence-based eligibility.
- [x] Prevent unreviewed drafts from appearing in public library queries.
- [x] Add an administrator publication endpoint with provenance preconditions.
- [x] Add explicit independent rejection with contributor-visible reasons.
- [x] Let contributors track submissions and supply fresh evidence or a newer
  immutable version for rejected, stale and quarantined routes.
- [x] Add a mandatory publication-review checklist and permanent status audit trail.
- [x] Show named rider, last-ridden date, evidence type and review date publicly.
- [x] Expire route evidence after 365 days and interval assessments after 180 days.
- [x] Quarantine critical condition reports and add an administrator incident queue.
- [x] Prevent synthetic seeds from becoming approved or verified.
- [x] Decommission legacy public-GPX import, generated-GPX and synthetic product
  seed scripts so they cannot materialise catalogue routes.
- [x] Add a read-only provenance audit command.
- [x] Add a disposable PostgreSQL migration rehearsal to CI.
- [x] Prevent route page views from mutating an immutable route version.
- [ ] Apply the provenance migration to a copied/staging database.
- [ ] Run the audit against production and save the signed-off report.
- [ ] Back up production before any cleanup.
- [ ] Identify and remove synthetic users, ratings and comments from public
  statistics without deleting genuine community records.
- [ ] Review all legacy Ireland road routes and attach evidence or quarantine.
- [ ] Remove legacy international routes from the relaunch catalogue while
  retaining them privately for later rights review.

### Technical release gate

- [ ] Rotate every historical database and integration credential.
- [x] Encrypt or remove stored third-party OAuth tokens.
- [x] Resolve production dependency vulnerabilities.
- [x] Make linting a blocking CI check.
- [x] Replace request-time schema changes with ordered deployment migrations.
- [x] Add privacy-minimised beta measurement for views, actions, plans,
  confirmed rides and retention.
- [x] Add a route-safety incident log and quarantine queue.
- [x] Add privacy-safe structured application-error capture and an administrator
  error-resolution queue.
- [x] Add signed-in rider/contributor applications, administrator cohort review,
  and access-level enforcement for route search and uploads.
- [x] Add administrator pause, restore and removal controls with a permanent
  beta-membership audit event and required reason.
- [ ] Connect structured application logs to a contracted monitoring service
  and test production alert delivery using the
  [`ERROR_MONITORING_RUNBOOK.md`](./ERROR_MONITORING_RUNBOOK.md).
- [x] Draft privacy, contributor and platform-integration terms and source policy.
- [ ] Obtain Irish legal review of privacy, contributor, consumer-safety and platform terms.
- [ ] Contract a production map, routing and geocoding provider with the required keys and attribution.

## Human-ridden publication workflow

1. Named contributor uploads their own GPX, FIT or TCX ride recording.
2. Contributor enters the date ridden and grants publication rights.
3. LOOPS atomically stores the route, immutable geometry version, SHA-256
   geometry hash and pending attestation.
4. Submission enters `in_review`; it is not publicly discoverable.
5. Automated checks inspect loop closure, distance, elevation, surface and road
   risks. These checks never count as a human ride.
6. A human curator reviews the evidence and route.
7. The curator either rejects with a contributor-visible reason or approves
   the attestation and publishes only if all required evidence is present.
8. The contributor can track the decision at `/submissions`. Identical
   geometry can receive fresh ridden evidence; changed geometry creates a new
   immutable version. Both paths require independent review.
9. Condition incidents can immediately quarantine the route.

Publication states:

`draft → in_review → published → stale/quarantined → in_review → published or retired`

## Interval product backlog

Route verification and workout suitability are different records. A route can
be human-ridden and still be unsuitable for structured efforts.

### Ireland beta

- [x] Add route-segment records tied to immutable route versions.
- [x] Separate tempo and sweet spot rather than treating both as generic Z3.
- [x] Support effort duration in seconds as well as minutes.
- [x] Add human segment assessment: direction, sightlines, surface, junctions,
  traffic pattern, entry, recovery and run-out.
- [x] Match endurance, tempo, sweet spot and threshold sessions only to
  approved segment assessments.
- [x] Show an honest no-match response when evidence is insufficient.
- [x] Fix a repeatable Dublin/Wicklow coverage set: 24 discovery searches and
  eight supported workout searches.
- [ ] Pass the coverage audit against the migrated staging catalogue.

### Later

- [ ] VO2 sections after the Ireland beta proves the assessment workflow.
- [ ] Anaerobic sections after additional safety review.
- [ ] Sprint sections only after two independent rider assessments, legal and
  insurance review, and a tested incident process.

## Suggested launch gates

### Trust and supply

- 100% of public routes have a current ride attestation and rights grant.
- 100% show the rider and last-ridden date.
- 100% of workout claims have a separate approved segment assessment.
- No synthetic social proof appears in public metrics.
- Serious condition reports quarantine a route immediately.

### Ireland product gate

- At least 25 reviewed routes before invitations begin.
- At least three credible results for 80% of supported Dublin/Wicklow searches.
- At least one human-assessed match for every fixed supported workout search.
- At least 30% of route views produce a save, GPX download or device transfer.
- At least 25% of planned routes are confirmed ridden within 14 days.
- At least 25% four-week retention among the first 100 genuine beta riders.

Measurement definitions and cohort rules are fixed in
[`IRELAND_BETA_MEASUREMENT.md`](./IRELAND_BETA_MEASUREMENT.md) so the gates
cannot be reinterpreted after results arrive.

### Girona expansion gate

- Ireland trust gate remains at 100%.
- Repeat usage demonstrates value beyond one-off GPX downloads.
- The Wave 3 rider offer has a closed, documented result under the pre-registered
  rules; stated willingness to pay is not sufficient.
- At least one local Girona supply partner signs the contributor/rights terms.
- At least one operator agrees to a paid or explicitly time-boxed pilot.

### Mallorca expansion gate

- Girona route acquisition and review cost is known and repeatable.
- At least two paid operator relationships or equivalent recurring revenue.
- The condition and freshness workflow functions across a remote destination.

## Deployment order for the provenance release

1. Take a verified database backup.
2. Run `npm run audit:provenance` and retain its JSON output.
3. Apply every numbered SQL file in `migrations/` to staging in order.
4. Confirm that the legacy catalogue is quarantined and public queries return
   only fully evidenced routes.
5. Submit, review and publish one test Ireland road loop end to end.
6. Run the full test, typecheck, lint and production-build gates.
7. Apply the migration to production.
8. Deploy application code.
9. Confirm public catalogue, route privacy, GPX permissions and incident
   quarantine behaviour.

Never deploy the code before the provenance migration. Never apply the
migration to production without a backup and a staging rehearsal.
