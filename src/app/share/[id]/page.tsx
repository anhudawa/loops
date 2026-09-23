import { redirect } from "next/navigation";

/**
 * Old share links (/share/<id>) go to the one, fully built route page
 * (map, elevation, weather, GPX). The separate share page was a dead end:
 * no elevation, no weather, and its GPX button was hidden for most routes.
 */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/routes/${id}`);
}
