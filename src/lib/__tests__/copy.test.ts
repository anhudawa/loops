import { describe, it, expect } from "vitest";
import { plural, placeLabel, freeGpxPhrase, gpxIsPublic } from "@/lib/copy";
import { GPX_ACCESS } from "@/config/constants";

describe("plural", () => {
  it("handles 1, many and Postgres string counts", () => {
    expect(plural(1, "route")).toBe("1 route");
    expect(plural("1", "cycling route")).toBe("1 cycling route");
    expect(plural(2, "route")).toBe("2 routes");
    expect(plural(0, "region")).toBe("0 regions");
  });
});

describe("placeLabel", () => {
  it("drops a country already named by the location", () => {
    expect(placeLabel("Dublin & Wicklow, Ireland", "Ireland")).toBe("Dublin & Wicklow, Ireland");
    expect(placeLabel("Ireland", "Ireland")).toBe("Ireland");
    expect(placeLabel("Dublin", "Ireland")).toBe("Dublin, Ireland");
    expect(placeLabel(null, "Spain")).toBe("Spain");
  });
  it("does not treat a substring of a word as a match", () => {
    expect(placeLabel("Northern Irelandish", "Ireland")).toBe("Northern Irelandish, Ireland");
  });
});

describe("freeGpxPhrase", () => {
  it("only promises free downloads when GPX is public", () => {
    const access: string = GPX_ACCESS;
    const pub = access === "everyone";
    expect(gpxIsPublic()).toBe(pub);
    expect(freeGpxPhrase()).toBe(pub ? "free GPX downloads" : "free GPX with a free LOOPS account");
    expect(freeGpxPhrase({ title: true }).charAt(0)).toBe("F");
  });
});
