import { describe, it, expect } from "vitest";
import { isBot, deviceOf, sourceOf, cleanPath, visitorCode } from "@/lib/traffic";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("traffic helpers", () => {
  it("skips bots and preview fetchers, keeps phones", () => {
    expect(isBot(IPHONE)).toBe(false);
    expect(isBot(MAC)).toBe(false);
    expect(isBot("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0")).toBe(true);
    expect(isBot("")).toBe(true);
  });
  it("classes devices", () => {
    expect(deviceOf(IPHONE)).toBe("mobile");
    expect(deviceOf(MAC)).toBe("desktop");
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
  });
  it("names the source: utm first, then referrer, then the in-app browser", () => {
    expect(sourceOf({ utm: "Podcast", ref: "https://www.google.com/" })).toBe("podcast");
    expect(sourceOf({ ref: "https://www.google.ie/search?q=x" })).toBe("google");
    expect(sourceOf({ ref: "https://l.instagram.com/?u=x" })).toBe("instagram");
    expect(sourceOf({ ref: "https://www.roadmancycling.com/blog" })).toBe("roadmancycling.com");
    expect(sourceOf({ ref: "https://www.loops.ie/routes" })).toBe("direct");
    expect(sourceOf({ ua: IG })).toBe("instagram");
    expect(sourceOf({ ua: IPHONE })).toBe("direct");
  });
  it("keeps same-site paths only, without the query", () => {
    expect(cleanPath("/ride/abc?t=1&m=x")).toBe("/ride/abc");
    expect(cleanPath("/routes/")).toBe("/routes");
    expect(cleanPath("/")).toBe("/");
    expect(cleanPath("/admin")).toBeNull();
    expect(cleanPath("/api/x")).toBeNull();
    expect(cleanPath("https://evil.com/")).toBeNull();
    expect(cleanPath("//evil.com")).toBeNull();
  });
  it("visitor code: same person same month, new code next month, never the IP", () => {
    const a = visitorCode("s", "1.2.3.4", IPHONE, new Date(Date.UTC(2026, 8, 1)));
    expect(visitorCode("s", "1.2.3.4", IPHONE, new Date(Date.UTC(2026, 8, 29)))).toBe(a);
    expect(visitorCode("s", "1.2.3.4", IPHONE, new Date(Date.UTC(2026, 9, 1)))).not.toBe(a);
    expect(visitorCode("s", "1.2.3.5", IPHONE, new Date(Date.UTC(2026, 8, 1)))).not.toBe(a);
    expect(a).not.toContain("1.2.3.4");
  });
});
