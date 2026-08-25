import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export interface MigrationFile {
  filename: string;
  checksum: string;
  sql: string;
}

export async function readOrderedMigrations(directory: URL): Promise<MigrationFile[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => /^\d+.*\.sql$/.test(filename))
    .sort();
  return Promise.all(filenames.map(async (filename) => {
    const sql = await readFile(new URL(filename, directory), "utf8");
    return {
      filename,
      checksum: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  }));
}
