import { describe, expect, it } from "vitest";
import {
  parseCurroBikes,
  parseCyclingIreland,
  parseMallorcaCyclingCenter,
  parseMallorcaVelo,
  parseSportIreland,
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
});
