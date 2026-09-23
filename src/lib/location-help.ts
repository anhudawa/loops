/**
 * How to turn location back on, for the rider's own phone and browser.
 * Once a site is blocked the browser will not show the prompt again, so the
 * page has to say exactly where the switch is.
 */
export type LocationHelp = { where: string; steps: string[] };

export function locationHelpFor(ua: string, isBrave = false): LocationHelp {
  const ios = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  const chromeIos = /CriOS/.test(ua);
  const firefoxIos = /FxiOS/.test(ua);
  const inApp = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\//.test(ua);

  if (inApp) {
    return { where: "this in-app browser", steps: [
      "Tap ••• or the share icon and choose Open in Safari (or Open in Chrome).",
      "Allow location when LOOPS asks.",
    ] };
  }
  if (ios) {
    const app = isBrave ? "Brave" : chromeIos ? "Chrome" : firefoxIos ? "Firefox" : null;
    if (app) {
      return { where: `${app} on iPhone`, steps: [
        `Open the Settings app → Privacy & Security → Location Services: make sure it is on.`,
        `In the same list, tap ${app} → choose "While Using the App".`,
        `Come back here and tap Try again.`,
      ] };
    }
    return { where: "Safari on iPhone", steps: [
      "Tap the aA (or page settings) button in the address bar → Website Settings → Location → Allow.",
      "If that is already Allow: Settings app → Privacy & Security → Location Services → Safari Websites → While Using the App.",
      "Come back here and tap Try again.",
    ] };
  }
  if (android) {
    return { where: isBrave ? "Brave on Android" : "your Android browser", steps: [
      "Tap the icon at the left of the address bar (lock or settings) → Permissions → Location → Allow.",
      "Make sure the phone's location is on (swipe down → Location).",
      "Come back here and tap Try again.",
    ] };
  }
  return { where: "your browser", steps: [
    "Click the icon at the left of the address bar → Location → Allow.",
    "Then tap Try again.",
  ] };
}
