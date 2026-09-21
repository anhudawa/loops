# Bundled data

## places-eu.json — populated places (villages, towns, cities)

Used by the route generator to aim candidate loops at real places (on
roads) instead of geometric points (in the sea, on a mountainside). Loaded
in-process; no external lookup at request time.

- **Source:** [GeoNames](https://www.geonames.org) — full per-country
  files for IE, ES, PT, IT, FR (villages included) plus `cities500` for
  the rest of Europe. Bounding box 34–62°N, 12°W–32°E.
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0). Attribution is
  shown on the generate page ("Place data © GeoNames").
- **Format:** `{ v, source, built, n, p: [lat_e4, lng_e4, w, …] }` —
  coordinates as integer 1e-4 degrees, `w` 0 = village/hamlet,
  1 = town (pop ≥ 5 000), 2 = city (pop ≥ 50 000). ~250k places, ~3.9 MB.
- **Rebuild:** download the dumps from
  `https://download.geonames.org/export/dump/{IE,ES,PT,IT,FR,cities500}.zip`,
  unzip into one directory, then
  `node scripts/anchors/build-places.mjs <that-directory>`.
