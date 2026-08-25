import { describe, expect, it } from "vitest";
import {
  parseBikePointTenerife,
  parseCurroBikes,
  parseCyclingCalpe,
  parseCyclingIreland,
  parseLanzaroteBike,
  parseMallorcaCyclingCenter,
  parseMallorcaVelo,
  parseSportIreland,
  parseTuscanyTrail365,
  parseWebTenerife,
} from "../../../scripts/source-candidates/source-parsers";

describe("route source candidate parsers", () => {
  it("extracts Cycling Ireland metadata without geometry", () => {
    const html = `<li><a data-src="/route-popup-content.asp?ID=1067"><h2 class="hat">Shannon to Quin</h2><div class="stats"><span class="stat"><i></i>Clare</span><span class="stat"><i></i>38km</span></div></a></li>`;
    expect(parseCyclingIreland(html)[0]).toMatchObject({ sourceKey: "cycling-ireland:1067", county: "Clare", distanceKm: 38, routeFormat: "unknown" });
  });

  it("preserves Sport Ireland loop versus linear format", () => {
    const html = `<article data-trail-id="1146" data-trail-title="Achill Cycle Hub - Loop 3" data-trail-county="Mayo" data-trail-length="11.7 km" data-trail-format="Loop" data-trail-url="/outdoors/cycling-on-road/trails/achill"></article>`;
    expect(parseSportIreland(html)[0]).toMatchObject({ routeFormat: "loop", distanceKm: 11.7, sourceClaimsRecorded: false });
  });

  it("deduplicates MallorcaVelo navigation entries", () => {
    const anchor = `<a href="/routes/far-de-formentor"><span class="nav-entry-label">Far de Formentor</span><span class="nav-entry-meta">93.0 km</span></a>`;
    expect(parseMallorcaVelo(anchor + anchor)).toHaveLength(1);
  });

  it("excludes gravel from the road-only CurroBikes intake", () => {
    const road = `<div class="cbr-card" id="cbr-calobra"><span class="cbr-badge-type">Circular</span><h2 class="cbr-card-name">Sa Calobra</h2><div class="cbr-spec-val">38 km</div><div class="cbr-spec-val">+900 m</div>`;
    const gravel = `<div class="cbr-card" id="cbr-gravel"><h2 class="cbr-card-name">Campos Gravel</h2>`;
    expect(parseCurroBikes(road + gravel)).toEqual([expect.objectContaining({ routeName: "Sa Calobra", routeFormat: "loop", elevationGainM: 900 })]);
  });

  it("extracts Mallorca Cycling Center route statistics", () => {
    const html = `<a href="https://www.mallorcacyclingcenter.com/routes/llucmajor " class="track"><h2>1 Llucmajor</h2><span>62.67 km / 395 m</span></a>`;
    expect(parseMallorcaCyclingCenter(html)[0]).toMatchObject({ routeName: "Llucmajor", distanceKm: 62.67, elevationGainM: 395 });
  });

  it("keeps only statistically complete road routes from Bike Point Tenerife", () => {
    const complete = `<article class="gps-route-card post-10" data-route-card data-title="The Masca loop" data-start="Shop" data-finish="Shop" data-type="road" data-distance="59.8" data-ascent="1991"><h3><a href="https://bikepointtenerife.com/gps-route/masca/">The Masca loop</a></h3></article>`;
    const gravel = `<article class="gps-route-card post-11" data-route-card data-title="South Side Gravel" data-start="Shop" data-finish="Shop" data-type="road" data-distance="50" data-ascent="500"><h3><a href="#">South Side Gravel</a></h3></article>`;
    const incomplete = `<article class="gps-route-card post-12" data-route-card data-title="Mystery" data-start="Shop" data-finish="Not specified" data-type="road" data-distance="" data-ascent=""><h3><a href="#">Mystery</a></h3></article>`;
    expect(parseBikePointTenerife(complete + gravel + incomplete)).toEqual([
      expect.objectContaining({ routeName: "The Masca loop", routeFormat: "loop", sourceValidationStatus: "locally_curated" }),
    ]);
  });

  it("extracts Calpe loop facts and stores the Strava reference rather than GPX geometry", () => {
    const html = `<article class="flex flex-col overflow-hidden"><h3>Calpe - 57 km - 790 m</h3><p>Short loop over Coll de Rates.</p><a href="/gpx/calpe-57km-790m.gpx">Download GPX</a><a href="https://www.strava.com/routes/123">Strava</a></article>`;
    expect(parseCyclingCalpe(html)[0]).toMatchObject({ distanceKm: 57, elevationGainM: 790, routeFormat: "loop", sourceTrackUrl: "https://www.strava.com/routes/123" });
  });

  it("separates Lanzarote road cards from the MTB section", () => {
    const html = `>Road bike routes<h3>Hop On, Hop Off</h3><p>Distance: 45.5 km Elevation gain: 640 m This loop is compact.</p><a href="https://www.komoot.com/tour/123">Komoot</a>>MTB Routes<h3>Trail</h3>`;
    expect(parseLanzaroteBike(html)).toEqual([
      expect.objectContaining({ routeName: "Hop On, Hop Off", distanceKm: 45.5, routeFormat: "loop" }),
    ]);
  });

  it("retains the publisher-ridden distinction for Tuscany road loops", () => {
    const html = `<a class="itxcard" data-type="Road" href="/itinerari/pacr-road-1"><span class="rcard-badge road">Road</span><b>Marsiliana Road</b><span class="itx-meta"><span><b>83.9 km</b></span><span>523 m D+</span></span></a>`;
    expect(parseTuscanyTrail365(html)[0]).toMatchObject({ routeName: "Marsiliana Road", routeFormat: "loop", sourceValidationStatus: "publisher_claims_ridden" });
  });

  it("parses English thousands separators from the official Tenerife index", () => {
    const html = `<article class="card card--background"><a class="card__link" href=https://www.webtenerife.co.uk/what-to-do/routes/cycling/garachico-masca/><h3>Route 1</h3><div class="card__description">Start: Garachico. Finish: Garachico. Distance: 54 km. Cumulative ascent: 1,589 m.</div></a></article>`;
    expect(parseWebTenerife(html)[0]).toMatchObject({ distanceKm: 54, elevationGainM: 1589, routeFormat: "loop" });
  });
});
