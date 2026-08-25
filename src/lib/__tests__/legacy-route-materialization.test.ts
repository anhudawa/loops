import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legacyMaterializers = [
  "scripts/add-eat-sleep-cycle-routes.mjs",
  "scripts/add-girona-routes.mjs",
  "scripts/add-mallorca-routes.mjs",
  "scripts/add-traka-routes.mjs",
  "scripts/build-all-girona-gpx.mjs",
  "scripts/import-routes.mjs",
  "scripts/insert-girona-routes.mjs",
];

describe("legacy route materialisation", () => {
  it.each(legacyMaterializers)("keeps %s decommissioned", (script) => {
    const source = readFileSync(resolve(process.cwd(), script), "utf8");
    expect(source).toContain('import "./legacy-route-materialization-disabled.mjs";');
  });

  it("keeps the synthetic product seed decommissioned", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/seed.ts"), "utf8");
    expect(source).toContain("synthetic users and routes cannot seed a product database");
  });

  it("fails the shared guard closed", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/legacy-route-materialization-disabled.mjs"),
      "utf8"
    );
    expect(source.trimStart().startsWith("throw new Error(")).toBe(true);
  });
});
