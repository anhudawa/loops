#!/usr/bin/env node
/**
 * Build scripts/routing/cloud-init-brouter.yaml from the template plus every
 * profile in scripts/routing/profiles/. The profiles in the repo are the
 * single source of truth; the server gets exact copies at provision time.
 *
 *   node scripts/routing/build-cloud-init.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "cloud-init-brouter.template.yaml"), "utf8");
const profilesDir = join(here, "profiles");
const files = readdirSync(profilesDir).filter((f) => f.endsWith(".brf")).sort();

const blocks = files.map((f) => {
  const body = readFileSync(join(profilesDir, f), "utf8").replace(/\s+$/, "");
  const indented = body.split("\n").map((l) => (l.length ? "      " + l : "")).join("\n");
  return `  - path: /opt/brouter/profiles/${f}\n    permissions: "0644"\n    content: |\n${indented}\n`;
});

const out = template.replace("#__PROFILES__\n", blocks.join(""));
writeFileSync(join(here, "cloud-init-brouter.yaml"), out);
console.log(`cloud-init-brouter.yaml: ${files.length} profile(s) embedded (${files.join(", ")}), ${(out.length / 1024).toFixed(1)} KB`);
