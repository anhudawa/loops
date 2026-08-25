# Ireland contributor and closed-beta operations

Status: ready for founder review and execution  
Supply target: 35 reviewed road loops  
Beta target: 50–100 genuine riders  
Initial geography: Dublin and Wicklow

## Operating principle

LOOPS recruits people, not route files. Every public loop must come from a
named contributor who rode that exact version, owns or controls the recording,
grants publication rights and passes the evidence checks. A separate logged-in
curator reviews the contribution; contributors cannot approve their own route
or workout assessment.

The target is coverage, not raw route count. Thirty-five near-identical Wicklow
loops would be a failed catalogue. The accompanying supply tracker allocates
routes across start areas, distances, terrain and workout needs.

## Founding contributor cohort

Recruit 12–16 people capable of supplying two to four genuinely useful loops:

- four road-club captains or experienced ride leaders;
- three qualified or established cycling coaches;
- four experienced Dublin/Wicklow riders with strong local knowledge;
- two to five shop, café, tour or community partners who can introduce named
  riders rather than providing scraped/public route libraries.

Contributor qualification call:

1. Which Dublin/Wicklow roads do you ride repeatedly and in which conditions?
2. Can you provide your own timestamped completed-ride GPX, FIT or TCX file?
3. Are you comfortable being named publicly with the month/date last ridden?
4. Does any start or finish expose a home or sensitive location?
5. Which stretches have you personally used for endurance, tempo, sweet spot
   or threshold work, and at what time of day?
6. Can LOOPS contact you when evidence expires or a condition report arrives?

Do not accept route packs, club archives or links on the call. Each route must
be uploaded and attested by the person who rode it.

## Contributor invitation

> LOOPS is rebuilding as a trusted library of Irish road loops. We never
> invent or copy routes: every loop is tied to the named person who rode that
> exact version and is reviewed before publication. We are inviting a small
> group of experienced Dublin/Wicklow riders to contribute two to four routes
> they genuinely know. You upload your own completed-ride GPX, FIT or TCX,
> confirm the ride date and publication rights, and flag any private start or
> safety issue. We then review it with you. Would you be open to a 20-minute
> contributor call?

No payment or benefit should be promised until the founder chooses and budgets
the contributor model. Options to test are recognition only, complimentary
founding membership, a fixed honorarium per approved loop, or a partner
revenue share. Compensation never weakens the evidence or review standard.

## Intake and review service level

1. Candidate signs in at `/beta` and applies as a rider or contributor using
   only a coarse Irish riding area. A LOOPS administrator records an approve,
   waitlist or decline decision and a private reason.
2. Approval creates personal closed-beta access. Rider access can search the
   reviewed library; contributor access also unlocks route submission. Admins
   never grant contribution rights merely because someone already has an account.
3. An approved contributor uploads their own completed recording. LOOPS
   atomically creates the route, immutable version and pending attestation.
4. Automated evidence checks reject planned files, missing timestamps, date
   mismatches, open routes and unsupported formats immediately.
5. A curator acknowledges a valid submission within two working days.
6. The curator reviews identity, rights, privacy, exact geometry, start/finish,
   surface, road suitability, warnings and description.
7. The curator either publishes or rejects with a specific reason within five
   working days. The contributor sees the decision at `/submissions`.
   Rejected, stale and quarantined routes can receive another ridden file;
   identical geometry gets fresh evidence and changed geometry creates the
   next immutable version. Both return to independent review.
8. Workout details are recorded only when the named rider has assessed the
   exact stretch, direction, traffic, sightlines, junctions, entry, recovery
   and run-out. A different reviewer approves the assessment.
9. Critical reports quarantine the route immediately. Evidence expires after
   365 days; workout assessment expires after 180 days.

The admin `Beta` queue is the cohort system of record. Do not approve a person
from an email or spreadsheet without their signed-in application and recorded
consent. Contributor approval automatically includes rider access; rider
approval never grants upload access.

Administrators can pause, restore or remove access from the `Beta` queue only
with a recorded reason. Every change is retained in `beta_membership_events`.
Pausing or removal immediately disables route matching, GPX actions and
contributor submissions without deleting application or route history.

## Weekly supply review

Every Friday, review the tracker and the generated readiness report:

- approved routes versus the 35-route target;
- empty start-area/distance cells;
- the 24 fixed searches with fewer than three credible matches;
- the eight workout searches with no human-assessed match;
- submissions waiting more than five working days;
- evidence expiring in the next 30 days;
- open incidents and routes currently quarantined;
- contributor concentration: no single person should supply more than 20% of
  the public beta catalogue.

Run `npm run audit:beta-readiness` against the migrated staging/copy database
and retain the dated JSON report. Do not open invitations until at least 25
routes exist and discovery coverage passes 80%.

## Closed-beta waves

### Wave 0: operational rehearsal — 5 people

Contributors and curators only. Submit, review, publish, plan, download and
confirm one route end to end. Test a quarantine and recovery exercise. No
marketing claims and no payment.

### Wave 1: trust and usability — 15 riders

Mix club riders, coaches and independent riders. Observe whether they can find
a route, understand its provenance, download it and safely use the plan/confirm
flow. Interview every participant after their first ride.

### Wave 2: repeat value — 35 additional riders

Invite only when Wave 1 has no unresolved critical safety issue and the fixed
coverage audit still passes. Measure repeat discovery, ride confirmation and
which workout requests produce honest no-matches.

### Wave 3: commercial signal — up to 50 additional riders

Invite only after privacy/legal wording, production maps, error alerts and the
incident duty rota are operational. This wave tests an actual paid offer, not
only stated willingness to pay.

## Commercial validation sequence

During the closed beta, route matching and GPX access are personal to approved
riders. Wave 3 tests whether public browsing and basic GPX should later remain
free while frequent riders pay for trustworthy session matching, freshness
and trip-ready route intelligence.

1. After a rider has viewed at least three routes or confirmed one ride, show a
   clearly described founding-member offer. Do not interrupt first use.
2. Test one offer at a time for a complete cohort. Initial founder-review
   candidate: €39 per year for workout matching, freshness alerts and saved
   trip planning; the exact free allowance is a test variable, not a promise.
3. Count only completed, non-refunded payments as demand. Surveys, email clicks
   and checkout starts are supporting evidence, not conversions.
4. Require at least ten genuine payments and 10% conversion among eligible,
   active Wave 3 riders before calling the consumer hypothesis promising.
5. Interview purchasers and non-purchasers. Record the job they were paying
   for, not just feature requests.
6. Do not begin Girona supply acquisition on consumer interest alone: the
   Ireland trust gate must remain at 100%, repeat usage must pass, and a Girona
   operator must agree to a paid or explicitly time-boxed pilot.

Pricing, tax, cancellation, refund, insurance and payment-provider terms need
legal/accounting review before money is accepted.

## Stop conditions

Pause invitations immediately when any of these occurs:

- a public route lacks current evidence, rights or independent review;
- a critical condition report does not quarantine its route;
- a rider is shown a workout claim without a current approved segment record;
- personal/sensitive start-location data is exposed;
- the incident queue has no accountable reviewer for more than one working day;
- a platform or mapping provider raises a permission or attribution concern.

The beta can resume only after the issue is contained, affected records are
audited, the cause is documented and the relevant control is retested.
