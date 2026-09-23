import { describe, it, expect } from "vitest";
import { locationHelpFor } from "../location-help";

const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
describe("locationHelpFor", () => {
  it("Brave on iPhone points at the Brave entry in Location Services", () => {
    const h = locationHelpFor(IOS_SAFARI, true);
    expect(h.where).toBe("Brave on iPhone");
    expect(h.steps.join(" ")).toMatch(/tap Brave → choose "While Using the App"/);
  });
  it("Safari on iPhone points at Website Settings and Safari Websites", () => {
    const h = locationHelpFor(IOS_SAFARI);
    expect(h.where).toBe("Safari on iPhone");
    expect(h.steps.join(" ")).toMatch(/Safari Websites/);
  });
  it("WhatsApp's in-app browser says open in Safari", () => {
    expect(locationHelpFor(IOS_SAFARI + " WhatsApp/24.1").steps[0]).toMatch(/Open in Safari/);
  });
  it("Android and desktop get the address-bar route", () => {
    expect(locationHelpFor("Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile").steps[0]).toMatch(/address bar/);
    expect(locationHelpFor("Mozilla/5.0 (Macintosh) Chrome/128").steps[0]).toMatch(/address bar/);
  });
});
