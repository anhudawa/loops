/** Compute and store a route's recommend_status (rules in recommendable.ts). */
import { storeRecommendStatus } from "./db";
import { RECOMMEND_RULES_VERSION, shapeVerdict, turnaround, type RecommendStatus } from "./recommendable";
import { outAndBackAlternative } from "./route-generator";

export async function checkRecommendable(route: { id: string; name?: string | null; coordinates: string }): Promise<RecommendStatus | null> {
  let coords: [number, number][];
  try {
    coords = (JSON.parse(route.coordinates) as number[][]).map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
  } catch {
    return null;
  }
  const shape = shapeVerdict(coords, route.name ?? "");
  let status: RecommendStatus;
  let evidence: Record<string, unknown> = { v: RECOMMEND_RULES_VERSION, at: new Date().toISOString(), shape };
  if (shape !== "out-and-back") status = shape;
  else {
    const alt = await outAndBackAlternative(coords[0], turnaround(coords));
    status = alt.status;
    evidence = { ...evidence, ...alt };
  }
  await storeRecommendStatus(route.id, status, evidence);
  return status;
}

/** True when the stored verdict is missing or from older rules. */
export function needsRecommendCheck(route: { recommend_checked?: unknown }): boolean {
  const v = (route.recommend_checked as { v?: number } | null | undefined)?.v;
  return v !== RECOMMEND_RULES_VERSION;
}
