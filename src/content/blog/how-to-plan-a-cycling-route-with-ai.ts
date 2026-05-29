import type { BlogPost } from "@/lib/blog";

export const aiRoutePlanning: BlogPost = {
  slug: "how-to-plan-a-cycling-route-with-ai",
  title: "How to Plan a Cycling Route with AI",
  description:
    "A practical guide to planning cycling routes with AI: what to tell it, how training-aware planning works, how it differs from old route builders, and how to do it on LOOPS.",
  excerpt:
    "AI route planning has quietly become the fastest way to get a ride that actually fits your legs, your time and your training. Here's how to use it well.",
  date: "2026-05-22",
  category: "Product",
  author: "LOOPS",
  readingTime: 8,
  keywords: [
    "plan cycling route with AI",
    "AI route planner cycling",
    "AI bike route generator",
    "cycling route planner",
    "training-aware route planning",
    "how to plan a bike ride",
  ],
  body: [
    {
      type: "p",
      text: "For years, planning a bike ride meant dragging waypoints around a map, second-guessing whether that road was busy, and exporting a GPX you hoped wasn't full of gravel you didn't want. AI route planning changes the workflow entirely: you describe the ride you want in plain language — where you are, how long you've got, what you're training for — and you get a route that actually fits. This guide explains how it works, how to get good results, and how to do it on LOOPS.",
    },
    { type: "h2", text: "How AI route planning works" },
    {
      type: "p",
      text: "Traditional route builders are drawing tools: you do the thinking, they draw the line. An AI route planner is a reasoning tool. It combines map and road data — distance, elevation, surface, traffic, road type — with an understanding of what you're asking for, then proposes a route that satisfies your constraints. Instead of placing every turn, you state your intent and the AI handles the optimisation: closing the loop at the right distance, finding the climbing you wanted, avoiding the motorway, keeping you on the surface your bike is set up for.",
    },
    {
      type: "p",
      text: "The leap forward isn't just convenience. A good AI planner can balance competing constraints a human would find tedious — 'about 80 km, 1,200 m of climbing, mostly quiet roads, finishing on a café' — in seconds, and adjust instantly when you change your mind.",
    },
    { type: "h2", text: "What to tell the AI" },
    {
      type: "p",
      text: "The quality of your route depends on the quality of your brief. The more context you give, the better the result. Useful things to specify:",
    },
    {
      type: "ul",
      items: [
        "**Start location** — your address, a town, or a landmark.",
        "**Distance or duration** — '60 km' or 'about two hours'.",
        "**Climbing preference** — flat and fast, rolling, or as much elevation as possible.",
        "**Surface and bike** — road, gravel, or mixed; this determines which roads and tracks are in play.",
        "**Loop or point-to-point** — and whether you want to finish back where you started.",
        "**Training intent** — and this is where it gets powerful (see below).",
      ],
    },
    { type: "h2", text: "Training-aware route planning" },
    {
      type: "p",
      text: "This is what sets a modern planner apart. The best sessions need the right terrain, and matching them by hand is fiddly. A training-aware planner can find the road that fits the workout:",
    },
    {
      type: "ul",
      items: [
        "**Zone 2 endurance:** a rolling-to-flat loop with few junctions or stops, so you can hold a steady aerobic effort. See our guide to [structuring a Zone 2 ride](/blog/how-to-structure-a-zone-2-endurance-ride).",
        "**Tempo and threshold:** a long, steady climb of 3–6% with little traffic, ideal for [threshold intervals](/blog/where-to-do-threshold-intervals-safely-outdoors).",
        "**VO2 max:** a 3–5 minute climb for long reps, or quiet rolling roads for [short-short intervals](/blog/vo2-max-intervals-complete-outdoor-guide).",
      ],
    },
    {
      type: "p",
      text: "Instead of riding to your interval road and hoping it's quiet, you ask for the session and the planner builds the ride around it — warm-up, the right stretch of road, and a cool-down home.",
    },
    {
      type: "cta",
      text: "Tell us your location, your time and your session — get a route built for it in seconds.",
      href: "/generate",
      label: "Try AI route planning",
    },
    { type: "h2", text: "How to plan a route on LOOPS" },
    {
      type: "ol",
      items: [
        "**Open the route planner** and enter where you're starting from.",
        "**Describe the ride** — distance or time, how much climbing, road or gravel, loop or one-way.",
        "**Add training intent** if you have one — a Zone 2 spin, threshold intervals, a VO2 session, or just a scenic café ride.",
        "**Review the proposed route** — check the distance, elevation profile and surface breakdown.",
        "**Refine in plain language** — 'add more climbing', 'keep it flatter', 'avoid that main road' — and the route updates.",
        "**Export the GPX** to your head unit and ride it.",
      ],
    },
    { type: "h2", text: "Tips for better results" },
    {
      type: "ul",
      items: [
        "Be specific about surface — it's the single biggest factor in whether you enjoy the ride.",
        "State your real constraints up front (time, climbing limit) rather than over-correcting later.",
        "Use it to explore new areas on trips — it's especially valuable somewhere you don't know the roads.",
        "Combine it with our curated [collections](/collections) when you want hand-picked, proven loops instead of a generated one.",
      ],
    },
    {
      type: "p",
      text: "AI route planning won't replace local knowledge entirely — nothing beats a friend who knows the best descent — but it gets you a ride that fits in seconds, anywhere, and that's transformative when you're travelling, training to a plan, or simply short on time.",
    },
  ],
  faqs: [
    {
      question: "How do you plan a cycling route with AI?",
      answer:
        "You describe the ride you want in plain language — your start location, distance or duration, how much climbing, road or gravel, and any training intent — and the AI builds a route that fits. On LOOPS you enter your start point, describe the ride, review the proposed route and elevation, refine it with natural language, then export the GPX to your head unit.",
    },
    {
      question: "How is an AI route planner different from a normal route builder?",
      answer:
        "A traditional route builder is a drawing tool — you place every waypoint yourself. An AI route planner is a reasoning tool: you state your intent and it optimises the route to match, balancing distance, climbing, surface and traffic automatically, and updating instantly when you change your request.",
    },
    {
      question: "Can AI plan a route for a specific training session?",
      answer:
        "Yes. A training-aware planner can match terrain to the workout — a rolling, low-interruption loop for Zone 2 endurance, a steady 3–6% climb for threshold intervals, or a 3–5 minute climb for VO2 max reps — and build the warm-up and cool-down around it.",
    },
    {
      question: "What information should I give an AI route planner?",
      answer:
        "Provide your start location, your target distance or time, your climbing preference, the surface and type of bike, whether you want a loop or point-to-point, and any training intent. The more context you give, the better and more relevant the resulting route.",
    },
    {
      question: "Is AI route planning good for cycling in unfamiliar places?",
      answer:
        "It's especially useful when you don't know the roads, such as on a trip or training camp. Instead of researching local routes manually, you describe the ride you want and get a suitable loop in seconds. Pairing it with curated local collections gives you both generated and proven options.",
    },
  ],
};
