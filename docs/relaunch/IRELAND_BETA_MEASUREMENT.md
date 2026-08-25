# Ireland beta measurement

Status: implemented, awaiting staging migration  
Scope: signed-in Ireland road beta riders  
Window: rolling 28 days unless stated otherwise

LOOPS uses first-party, route-level measurement to decide whether the Ireland
beta is useful enough to continue and whether expansion is justified. It does
not use a third-party analytics SDK or store an IP address, user agent, device
fingerprint, precise search location or free-form analytics payload.

Every event is attached to the signed-in rider, the reviewed route and its
exact immutable version. Repeat events of the same kind for the same rider and
route are reduced to one per UTC day.

## Events

| Event | Recorded when |
|---|---|
| `route_view` | A signed-in beta rider opens a published Ireland road route |
| `route_saved` | The rider adds the route to favourites |
| `gpx_download` | LOOPS serves the rider the route GPX |
| `device_transfer` | Reserved for an approved future device integration |
| `route_planned` | The rider explicitly selects **Plan this ride** |
| `ride_confirmed` | The rider confirms **I rode this exact loop** against an open plan for the same route version |

Cancelled plans remain operational records but are excluded from the ride
confirmation denominator. A plan cannot be confirmed after its route version
changes; the rider must plan the current reviewed version instead.

## Gate definitions

### Published supply

Count of routes that pass every public eligibility rule: Ireland, road-only,
published, human-ridden, current evidence, current rights, current immutable
version, approved ride attestation and approved human review.

Beta invitation gate: at least 25 routes.

### Route view to action

Distinct signed-in rider/route pairs with a view in the last 28 days that also
have a save, GPX download or approved device transfer in that window, divided
by distinct rider/route view pairs in that window.

Gate: at least 30%.

### Planned route confirmed ridden

Completed plans confirmed no later than 14 days after planning, divided by all
non-cancelled plans that have either been completed or have had a full 14 days
to mature. Recent uncompleted plans are withheld from the denominator until
their 14-day window closes.

Gate: at least 25%.

### Four-week retention

Among the first 100 non-admin beta riders whose first event is at least 28 days
old, the share with another event from day 22 through day 28 after their first
event. Riders who have not yet had four weeks to mature are excluded.

Gate: at least 25%.

## Metrics that still require operations

- Search coverage uses a fixed set of 24 Dublin/Wicklow queries across eight
  start areas and three ride lengths; LOOPS does not retain raw rider location
  searches merely to calculate it. Run `npm run audit:beta-readiness` against a
  migrated staging/copy database. The same audit requires at least one real,
  human-assessed result for each of eight supported workout cases.
- Route safety and freshness remain curator/incident metrics, not engagement
  events.
- Revenue and willingness-to-pay follow the pre-registered eligibility,
  payment and decision rules in
  [`COMMERCIAL_VALIDATION_PLAN.md`](./COMMERCIAL_VALIDATION_PLAN.md). Payment
  events are not implemented until the legal, accounting and provider gates
  pass.

The administrator dashboard shows the four implemented gates, their cohort
sizes and the raw numerator/denominator behind each percentage. A percentage is
shown as unavailable rather than zero when no mature cohort exists.
