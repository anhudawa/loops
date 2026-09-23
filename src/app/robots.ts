import type { MetadataRoute } from "next";

// Share-preview images must stay crawlable (X, LinkedIn and Slack respect
// robots and drop a blocked og:image); the rest of /api/ — including full
// route tracks — is off limits to every crawler, AI bots included.
// Longest match wins, so these Allows beat "Disallow: /api/".
const ALLOW = ["/", "/api/og/", "/api/thumb/"];
const DISALLOW = ["/api/", "/admin", "/upload", "/messages", "/profile/edit"];
const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ALLOW, disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: ALLOW, disallow: DISALLOW })),
    ],
    sitemap: "https://www.loops.ie/sitemap.xml",
  };
}
