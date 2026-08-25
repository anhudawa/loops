const PRIVATE_ROUTE_FIELDS = new Set([
  "gpx_filename",
  "strava_activity_id",
]);

/**
 * Route rows are used internally by review and evidence workflows. Public API
 * responses must not carry recording filenames or legacy activity identifiers,
 * both of which can contain contributor-specific information.
 */
export function toPublicRoute<T extends object>(route: T): Omit<T, "gpx_filename" | "strava_activity_id"> {
  const entries = Object.entries(route).filter(([key]) => !PRIVATE_ROUTE_FIELDS.has(key));
  return Object.fromEntries(entries) as Omit<T, "gpx_filename" | "strava_activity_id">;
}

export function toPublicRoutes<T extends object>(routes: T[]): Array<Omit<T, "gpx_filename" | "strava_activity_id">> {
  return routes.map(toPublicRoute);
}
