import type { BlogPost } from "@/lib/blog";

export const komootAlternative: BlogPost = {
  slug: "komoot-alternative-for-road-cyclists",
  title: "Looking for a Komoot Alternative? What Road Cyclists Should Know in 2026",
  description:
    "Komoot now charges €59.99/yr just to sync routes to your Garmin. Here's what changed, what road cyclists actually need from a route planner, and how LOOPS compares.",
  excerpt:
    "Device sync behind a paywall, region locks, and routes that surprise you with gravel. If you're shopping for a Komoot alternative, here's what to look for.",
  date: "2026-06-10",
  category: "Product",
  author: "LOOPS",
  readingTime: 6,
  keywords: [
    "Komoot alternative",
    "Komoot alternative road cycling",
    "Komoot premium price",
    "Komoot Garmin sync",
    "best cycling route planner",
    "RideWithGPS vs Komoot",
  ],
  body: [
    {
      type: "p",
      text: "In March 2025 Komoot was acquired and, within months, most of the original team was gone, one-time map purchases were discontinued, and syncing a route to a Garmin or Wahoo — the single most basic thing a serious cyclist does with a route planner — moved behind a €59.99-per-year subscription. If you're reading this, you probably noticed.",
    },
    { type: "h2", text: "What actually matters in a route planner" },
    {
      type: "p",
      text: "Strip away the feature lists and road cyclists need five things: routes that never surprise you with gravel or a main road; a clean handoff to the head unit; honest information about surface and traffic before you commit; elevation you can trust; and no paywall between you and your own GPX file. Everything else is decoration.",
    },
    { type: "h2", text: "The surprise-gravel problem" },
    {
      type: "p",
      text: "The most common complaint about automatic route planners is being sent down a 'road' that turns out to be a rocky farm track 60 km from home on 25 mm tyres. It happens because map data mislabels surfaces and most planners don't check. The fix is to score every road on a route against real surface and traffic data — and to show you the paved/unpaved split up front, not bury it. If a planner can't tell you what percentage of a route is paved, it doesn't know either.",
    },
    { type: "h2", text: "What LOOPS does differently" },
    {
      type: "p",
      text: "LOOPS was built around one rule: a rider who gets one bad route never comes back. Every generated route passes hard guardrails — no motorways, no sliproads, no unpaved sectors on a road bike request — and is scored on surface quality, traffic, and safety using live road data. Each route shows its paved percentage and its quality factors, itemised. If we can't build a route we'd stand over, we say so and explain why.",
    },
    {
      type: "p",
      text: "It also does things Komoot never did: describe a ride in plain words — 'three hours, quiet roads, tailwind on the way home' — and get a loop oriented so the wind helps you home, with the forecast painted along the route. Or give it a structured workout, and it finds a stretch of road that can actually hold a 20-minute effort — no junctions, no lights, steady gradient — and builds the loop around it, with effort alerts in the GPX for your head unit.",
    },
    { type: "h2", text: "And the paywall question" },
    {
      type: "p",
      text: "GPX downloads on LOOPS are free with a free account. No region unlocks, no premium tier for your own routes. We think the head-unit handoff is the moment of truth in this product category, and charging for it is how you lose a sport's trust.",
    },
    {
      type: "cta",
      text: "Try it: describe your ideal ride in one sentence and see what comes back.",
      href: "/generate",
      label: "Plan a ride with LOOPS",
    },
  ],
  faqs: [
    {
      question: "Is LOOPS free?",
      answer:
        "Yes — browsing routes, generating rides and downloading GPX files are free with a free account. There are no region unlocks and no premium tier for device files.",
    },
    {
      question: "Does LOOPS work with Garmin and Wahoo?",
      answer:
        "Every route exports as a standard GPX that loads into Garmin Connect, Wahoo, Hammerhead and any app that accepts GPX. Workout routes include effort markers that appear as alerts on the head unit. Direct one-tap sync to Garmin Connect is in development.",
    },
    {
      question: "How does LOOPS avoid routing me onto gravel?",
      answer:
        "Road-bike requests use a paved-only routing profile, every candidate is checked against live road-surface data, and each route displays its paved percentage so you can see the surface split before you ride.",
    },
  ],
};
