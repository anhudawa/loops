import { describe, it, expect } from "vitest";
import {
  attributionFromParams,
  encodeAttribution,
  decodeAttribution,
} from "@/lib/attribution";

const P = (q: string) => new URLSearchParams(q);

describe("attributionFromParams", () => {
  it("returns null when there is nothing to attribute", () => {
    expect(attributionFromParams(P(""), null)).toBeNull();
    expect(attributionFromParams(P("page=2"), null)).toBeNull();
  });

  it("buckets the podcast", () => {
    const a = attributionFromParams(P("utm_source=roadman_podcast&utm_medium=show"), null);
    expect(a?.source).toBe("podcast");
    expect(a?.raw_source).toBe("roadman_podcast");
  });

  it("buckets the newsletter (incl. beehiiv/saturday spin)", () => {
    expect(attributionFromParams(P("utm_source=beehiiv"), null)?.source).toBe("newsletter");
    expect(attributionFromParams(P("utm_source=saturday-spin"), null)?.source).toBe("newsletter");
    expect(attributionFromParams(P("utm_medium=email&utm_source=list"), null)?.source).toBe("newsletter");
  });

  it("buckets the community (clubhouse/skool)", () => {
    expect(attributionFromParams(P("utm_source=skool"), null)?.source).toBe("clubhouse");
    expect(attributionFromParams(P("source=clubhouse"), null)?.source).toBe("clubhouse");
  });

  it("buckets paid/organic search and search-engine referrers", () => {
    expect(attributionFromParams(P("utm_medium=cpc&utm_source=google"), null)?.source).toBe("search");
    expect(attributionFromParams(P(""), "www.google.com")?.source).toBe("search");
  });

  it("buckets social from params and referrers", () => {
    expect(attributionFromParams(P("utm_source=instagram"), null)?.source).toBe("social");
    expect(attributionFromParams(P(""), "l.instagram.com")?.source).toBe("social");
  });

  it("an unrecognised explicit source is 'other', a foreign referrer is 'referral'", () => {
    expect(attributionFromParams(P("utm_source=some-blog"), null)?.source).toBe("other");
    expect(attributionFromParams(P(""), "someforum.example")?.source).toBe("referral");
  });

  it("respects explicit ?source and ?ref shorthands", () => {
    expect(attributionFromParams(P("source=podcast"), null)?.source).toBe("podcast");
    expect(attributionFromParams(P("ref=skool"), null)?.source).toBe("clubhouse");
  });

  it("lowercases and captures medium + campaign", () => {
    const a = attributionFromParams(P("utm_source=Podcast&utm_medium=Show&utm_campaign=Launch"), null);
    expect(a?.raw_source).toBe("podcast");
    expect(a?.medium).toBe("show");
    expect(a?.campaign).toBe("launch");
  });
});

describe("encode/decode round-trip", () => {
  it("survives a round trip", () => {
    const a = attributionFromParams(P("utm_source=roadman_podcast&utm_medium=show&utm_campaign=ep42"), null)!;
    const back = decodeAttribution(encodeAttribution(a));
    expect(back).toEqual(a);
  });

  it("decodes garbage to null", () => {
    expect(decodeAttribution(undefined)).toBeNull();
    expect(decodeAttribution("")).toBeNull();
    expect(decodeAttribution("not-json")).toBeNull();
    expect(decodeAttribution(encodeURIComponent("{}"))).toBeNull();
  });
});
