/**
 * The 16 Dublin & Wicklow loops LOOPS designed on its own engine
 * (src/data/hub-bundles/dublin-designed.json, all meeting the Road Standard)
 * go into the library by themselves — no admin tap needed. Idempotent: a
 * name already in the library is left alone (the same rule as /admin
 * "Import Dublin & Wicklow loops"), and each loop is added to the Dublin &
 * Wicklow collection. Runs at most once per server instance; callers are
 * the Dublin/Wicklow guide and collection renders and the daily cron.
 */
import { v4 as uuidv4 } from "uuid";
import designed from "@/data/hub-bundles/dublin-designed.json";
import { insertCuratedRoute, getRoutesByName, getCollectionIdBySlug, addRouteToCollection } from "@/lib/db";

type Designed = Omit<Parameters<typeof insertCuratedRoute>[0], "id">;

let done: Promise<{ inserted: number; existing: number }> | null = null;

export function ensureDesignedLoops(): Promise<{ inserted: number; existing: number }> {
  done ??= (async () => {
    let inserted = 0, existing = 0;
    const collectionId = await getCollectionIdBySlug("dublin").catch(() => null);
    for (const [i, r] of (designed as Designed[]).entries()) {
      const status = await insertCuratedRoute({ ...r, id: uuidv4() });
      if (status === "inserted") inserted++; else existing++;
      if (collectionId) {
        const [row] = await getRoutesByName(r.name, r.country);
        if (row) await addRouteToCollection(collectionId, row.id, 100 + i);
      }
    }
    if (inserted) console.log(JSON.stringify({ evt: "designed_loops_imported", inserted, existing }));
    return { inserted, existing };
  })().catch((e) => {
    done = null; // try again on the next call
    console.error("[designed-loops] import failed:", e instanceof Error ? e.message : e);
    return { inserted: 0, existing: 0 };
  });
  return done;
}
