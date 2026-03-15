import Link from "next/link";
import { slugify } from "@/lib/seo";

interface RelatedRoute {
  id: string;
  name: string;
  distance_km: number;
  discipline: string;
  elevation_gain_m: number;
}

interface RelatedRoutesProps {
  routes: RelatedRoute[];
  regionOrCountry: string;
  country: string;
  isRegion: boolean;
}

export default function RelatedRoutes({ routes, regionOrCountry, country, isRegion }: RelatedRoutesProps) {
  if (routes.length === 0) return null;

  const linkHref = isRegion
    ? `/routes/country/${slugify(country)}/${slugify(regionOrCountry)}`
    : `/routes/country/${slugify(country)}`;

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        More routes in {regionOrCountry}
      </h3>
      <div className="grid gap-2">
        {routes.map((route) => (
          <Link
            key={route.id}
            href={`/routes/${route.id}`}
            className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors hover:opacity-80"
            style={{ background: "var(--bg-raised)" }}
          >
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {route.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {route.distance_km}km · {route.elevation_gain_m}m climbing
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={linkHref}
        className="inline-block mt-3 text-sm font-semibold hover:opacity-80"
        style={{ color: "var(--accent)" }}
      >
        View all routes in {regionOrCountry} &rarr;
      </Link>
    </div>
  );
}
