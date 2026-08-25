import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openToken, sealToken, tokenEncryptionConfigured } from "../token-crypto";

const originalKey = process.env.LOOPS_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.LOOPS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.LOOPS_TOKEN_ENCRYPTION_KEY;
  else process.env.LOOPS_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("OAuth token encryption", () => {
  it("round-trips a token through an authenticated AES-GCM envelope", () => {
    const envelope = sealToken("secret-access-token");
    expect(envelope).not.toContain("secret-access-token");
    expect(openToken(envelope)).toBe("secret-access-token");
  });

  it("rejects legacy plaintext tokens", () => {
    expect(() => openToken("legacy-plaintext-token")).toThrow(/unencrypted/i);
  });

  it("rejects a modified authentication tag", () => {
    const parts = sealToken("secret").split(":");
    const replacement = parts[3][0] === "A" ? "B" : "A";
    parts[3] = `${replacement}${parts[3].slice(1)}`;
    expect(() => openToken(parts.join(":"))).toThrow();
  });

  it("requires a valid 32-byte key", () => {
    process.env.LOOPS_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(tokenEncryptionConfigured()).toBe(false);
    expect(() => sealToken("secret")).toThrow(/32 bytes/i);
  });
});
