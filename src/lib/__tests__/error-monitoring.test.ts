import { describe, expect, it } from "vitest";
import { describeOperationalError } from "@/lib/error-descriptor";

describe("privacy-safe error grouping", () => {
  it("does not include the raw error message in its descriptor", async () => {
    const error = new Error("rider@example.test requested 53.3498,-6.2603");
    error.stack = `Error: private message\n    at GET (/app/src/route.ts:42:7)`;
    const descriptor = await describeOperationalError(error);
    expect(JSON.stringify(descriptor)).not.toContain("rider@example.test");
    expect(JSON.stringify(descriptor)).not.toContain("53.3498");
  });

  it("groups changing source line numbers into the same fingerprint", async () => {
    const first = new Error("first message");
    first.stack = `Error: first\n    at GET (${process.cwd()}/src/route.ts:42:7)`;
    const second = new Error("different message");
    second.stack = `Error: second\n    at GET (${process.cwd()}/src/route.ts:99:3)`;
    expect((await describeOperationalError(first)).fingerprint).toBe(
      (await describeOperationalError(second)).fingerprint
    );
  });

  it("keeps only safe characters from external error classes and codes", async () => {
    const descriptor = await describeOperationalError({
      name: "Bad Error <email@example.test>",
      code: "DB FAIL / secret",
    });
    expect(descriptor.errorName).toBe("BadErroremailexample.test");
    expect(descriptor.errorCode).toBe("DBFAILsecret");
  });
});
