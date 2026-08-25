# Website route discovery and acquisition

**Created:** 25 August 2026  
**Scope:** Ireland first; Girona second; Mallorca third  
**Priority backlog:** `WEBSITE_ROUTE_SOURCE_BACKLOG.csv`<br>
**Private staging source queue:** 204 metadata-only leads

## The creative move

Popular route websites are not merely files to download. They are maps of the
people who already possess the knowledge LOOPS needs: local guides, route
authors, club captains, trail managers and repeat riders.

Use the public route as the lead, then acquire a new permissioned contribution
from the human behind it:

```text
public route page
  -> identify operator / author / guide
  -> ask for the person who rode the exact version
  -> named rider joins protected contributor intake
  -> rider uploads their own timestamped recording and grants rights
  -> different curator reviews evidence and geometry
  -> rider separately assesses exact workout segments
  -> publish with agreed source credit and current warnings
```

This preserves the founder's rule—LOOPS never creates a route without the
human who rode it—while turning large public catalogues into a much faster
supply funnel.

## What was found

The manually curated first pass records 33 high-priority road-route leads. A
repeatable metadata-only sync broadens the acquisition funnel to 204 leads:

- **Ireland: 139.** Cycling Ireland contributes 73 index entries and Sport
  Ireland Outdoors contributes 66 on-road trail entries. Dublin Coast,
  Megalithic Spin, Swords to Oldtown, Blessington Lake and Baltyboys remain the
  most relevant early leads. Event routes are introducer leads only because
  closed-road or marshalled conditions do not establish everyday suitability.
- **Girona: 20.** Eat Sleep Cycle publishes an operator route bank;
  several entries are explicitly labelled recorded loops. Its staff-guide
  model provides the shortest credible path to the actual rider. Epic Road
  Rides adds detailed authored guides and alternate versions of the core
  Girona classics.
- **Mallorca: 45.** MallorcaVelo's reconstructed signposted network,
  CurroBikes, Mallorca Cycling Center and Epic Road Rides provide a balanced
  future funnel: recovery/rolling roads, signature coast rides, climbing loops
  and epic endurance days.

No geometry or GPX file from these sites has been copied into LOOPS. Every row
is `source_only` until the named-rider and rights gates are complete. The queue
currently contains 98 loop-labelled leads, 10 linear routes and 96 unknowns;
linear and unknown entries are recruitment/context leads, not loop inventory.

Run `npm run sources:sync` for a read-only live-source count. Pass `-- --apply`
only with the guarded staging environment. The command refuses to write
outside staging, stores no geometry and never inserts into `routes`.

## Acquisition order

### 1. Ireland operator introductions

Ask Cycling Ireland to introduce the local expert or route maintainer behind
the five Dublin/Wicklow leads. Ask Sport Ireland trail managers for named
riders only when the Dublin/Wicklow workflow is working. The public index does
not establish who rode the route or whether its geometry is current.

### 2. Eat Sleep Cycle as the Girona design partner

Eat Sleep Cycle is the best first Girona conversation because it has:

- a local Girona hub and guide team;
- a public route bank with loop and recording metadata;
- short leisure, intermediate, advanced and epic road options;
- the exact mix needed to test scenic discovery and workout-specific matching.

The initial ask should not be “may we copy your library?” It should be:

> Would you nominate two guides who personally rode these exact versions and
> are willing to contribute them in their own names? We will preserve the
> recording hash and route version, show agreed credit, require an independent
> review, and never infer workout suitability from the route description.

Start with Sant Andreu Salou Lanes, Els Àngels and Santa Pelaia, Costa Brava
Classic and Les Serres/Mas Llunes. Together they cover recovery, climbing,
scenery and rolling training roads without beginning with an extreme route.

### 3. Epic Road Rides for cross-checking and breadth

Epic Road Rides provides strong editorial descriptions, route warnings and
alternate versions. Use it to compare route concepts and recruit the named
author or local collaborator. Where its route overlaps Eat Sleep Cycle, select
one current rider-backed version; do not publish duplicate geometry merely
because two downloads exist.

### 4. Mallorca via named guide networks

The Epic Road Rides/SunVelo articles already identify the guide behind several
less obvious Mallorca loops. That is more useful to LOOPS than another generic
route dump. Defer intake until Ireland passes its beta gates and Girona proves
the partner model.

## Platform-specific discovery tactics

| Source | Use it for | Never treat it as |
|---|---|---|
| Operator websites | Route concepts, warnings, guide and author identification | Publication permission |
| Wikiloc | Recorded-loop signal, operator account and candidate metadata | A named rider attestation |
| Ride with GPS | Organisation and trip links supplied by the rider | Permission to bulk-copy public geometry |
| Strava | Finding local clubs, repeat riders and meaningful training segments | A shared commercial route database |
| Komoot | Collections, highlights and possible local creator introductions | An undocumented API or scraping source |
| Official route portals | Trail managers, regional coverage and public-route context | Proof of current open-road safety |

## Workout-route rule

The `workout_hypothesis` column is a recruiting and testing hypothesis only.
It is never displayed to riders and never becomes a workout tag automatically.
The named assessor must ride the exact immutable version and identify the
usable direction, uninterrupted segment, gradient, recovery space, junctions,
surface and descent risk for each session type.

## Release gates for a discovered website route

A row may move from `discovery_only` to staging submission only when:

1. the operator or author identifies the adult rider of the exact version;
2. that rider controls and uploads their own timestamped GPX/FIT/TCX recording;
3. the rider accepts the contributor rights and privacy declarations;
4. LOOPS records the immutable evidence hash and route version;
5. a different curator approves the route under ordinary open-road conditions;
6. any workout tag receives a separate human segment assessment;
7. source credit, update, takedown and commercial-use terms are recorded.
