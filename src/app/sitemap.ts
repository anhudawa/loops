import type { MetadataRoute } from "next";
import { getAllRoutesForSitemap, getCountries, getRegions } from "@/lib/db";
import { slugify } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [routes, countries] = await Promise.all([
    getAllRoutesForSitemap(),
    getCountries(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: "https://loops.ie", changeFrequency: "weekly", priority: 1.0 },
    { url: "https://loops.ie/login", changeFrequency: "monthly", priority: 0.3 },
    { url: "https://loops.ie/about", changeFrequency: "monthly", priority: 0.2 },
    { url: "https://loops.ie/privacy", changeFrequency: "monthly", priority: 0.2 },
    { url: "https://loops.ie/terms", changeFrequency: "monthly", priority: 0.2 },
  ];

  const routePages: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `https://loops.ie/routes/${route.id}`,
    lastModified: new Date(route.created_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const countryPages: MetadataRoute.Sitemap = countries.map((country) => ({
    url: `https://loops.ie/routes/country/${slugify(country)}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Get regions for each country
  const regionPages: MetadataRoute.Sitemap = [];
  for (const country of countries) {
    const regions = await getRegions(country);
    for (const region of regions) {
      regionPages.push({
        url: `https://loops.ie/routes/country/${slugify(country)}/${slugify(region)}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return [...staticPages, ...routePages, ...countryPages, ...regionPages];
}
