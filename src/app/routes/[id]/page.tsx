import { notFound } from "next/navigation";
import { getRoute } from "@/lib/db";
import { initialRouteForPage } from "@/lib/public-route";
import { withBundleCorrection } from "@/lib/bundle-corrections";
import RouteDetailView from "@/components/RouteDetailView";

// Server-render with the route so the page paints complete; the client view
// refreshes quietly and keeps its own fail-soft retry when the DB is down.
export default async function RouteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let initialRoute: Record<string, unknown> | null = null;
  // A route that definitively does not exist (the DB answered, no row) is a
  // real 404; a DB error is not.
  let missing = false;
  try {
    const r0 = await getRoute(id);
    const r = r0 ? await withBundleCorrection(r0) : r0;
    missing = r === undefined;
    if (r) initialRoute = initialRouteForPage(r as unknown as Record<string, unknown>);
  } catch {
    initialRoute = null;
  }
  if (missing) notFound();
  return <RouteDetailView initialRoute={initialRoute as never} />;
}
