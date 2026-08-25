# Expanded road-cycling destination sources

**Checked:** 25 August 2026<br>
**Purpose:** Widen future route acquisition without changing the Ireland-first
rollout or weakening the human-ridden publication gate.

## Result

The private staging queue contains 304 source candidates across ten
destinations. This expansion adds 100 candidates across seven further cycling
hubs.

| Destination | Leads | Sources | Why it qualified |
|---|---:|---|---|
| Tenerife | 41 | [Bike Point Tenerife](https://bikepointtenerife.com/download-gps-bike-routes-in-tenerife/), [Tenerife Tourism](https://www.webtenerife.co.uk/what-to-do/routes/cycling/) | A local bike shop says its route library was built by people who ride there; the official tourism index supplies an independent endpoint and statistics check. Four incomplete shop cards were excluded. |
| Calpe / Costa Blanca | 25 | [Cycling Calpe](https://www.cyclingcalpe.eu/) | Dedicated destination operator publishes loop descriptions, GPX references and Strava route links with distance and ascent. |
| Lanzarote | 9 | [Lanzarote Bike](https://en.lanzarotebike.com/routes) | Local bike shop publishes a road-only collection with route descriptions, statistics and GPX/Komoot references. |
| Tuscany | 8 | [Tuscany Trail 365](https://cyclingintuscany.tuscanytrail.it/itinerari/) | Publisher explicitly says every listed route was designed, ridden and verified by its team; only the eight road loops were selected. |
| Alpe d'Huez / Oisans | 7 | [Epic Road Rides](https://epicroadrides.com/destinations/cycling-france/alpe-d-huez-region/) | Named cyclist-author supplies route-specific notes, distances and ascent from a Bourg d'Oisans base. |
| Gran Canaria | 5 | [Epic Road Rides](https://epicroadrides.com/destinations/cycling-spain/gran-canaria/) | Named cyclist-author describes riding from the island and publishes route-specific notes and public tracks. |
| Dolomites | 5 | [CyclingHero](https://cyclinghero.cc/blog/cycling-the-dolomites-5-epic-routes-with-gpx-insider-tips) | Named author says the selection distils ten years riding in the region and provides GPX references, distances, ascent and detailed notes. |

## What source validation means

The staging queue records one of three public-source states:

- `metadata_checked`: the current public route card and core facts were parsed
  successfully;
- `locally_curated`: the route comes from an official destination body or a
  local cycling business that presents it as its own curated library;
- `publisher_claims_ridden`: a named author or publisher explicitly describes
  the route selection as personally ridden or team-ridden.

Current totals are 175 metadata-checked, 104 locally curated and 25 with a
publisher-ridden claim.

These are research confidence levels, not LOOPS verification. Even a publisher
claim does not establish which adult rode the exact downloadable version,
whether that file is their personal timestamped recording, whether it is
current, or whether LOOPS has publication rights.

## Format and publication boundary

The 304-candidate audit reports:

- 178 source-labelled loops;
- 18 linear routes;
- 3 out-and-back routes;
- 105 unknown-format candidates;
- zero geometry stored in the candidate schema;
- zero promoted candidates;
- zero public or draft LOOPS routes.

Only a source-labelled loop should enter the contributor acquisition shortlist.
It still advances only after the exact-version rider submits first-party
timestamped evidence, grants rights and privacy consent, and a different
curator approves the immutable version. Workout suitability remains a separate
segment assessment performed by a human who rode that version.
