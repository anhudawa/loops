import { getRoute } from "@/lib/db";
import { initialRouteForPage } from "@/lib/public-route";
import RouteDetailView from "@/components/RouteDetailView";

// Server-render with the route so the page paints complete; the client view
// refreshes quietly and keeps its own fail-soft retry when the DB is down.
export default async function RouteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let initialRoute: Record<string, unknown> | null = null;
  try {
    const r = await getRoute(id);
    if (r) initialRoute = initialRouteForPage(r as unknown as Record<string, unknown>);
  } catch {
    initialRoute = null;
  }
  return <RouteDetailView initialRoute={initialRoute as never} />;
}
