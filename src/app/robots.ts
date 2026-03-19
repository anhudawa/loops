import type { MetadataRoute } from "next";

const BASE_URL = "https://www.loops.ie";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/privacy", "/terms"],
        // Auth-required and admin routes should not be indexed
        disallow: ["/routes/", "/upload", "/profile", "/messages", "/admin", "/feedback", "/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
