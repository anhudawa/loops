import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";
const AAD = Buffer.from("loops-oauth-token-v1", "utf8");

function encryptionKey(): Buffer {
  const raw = process.env.LOOPS_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("LOOPS_TOKEN_ENCRYPTION_KEY is not configured");

  const key = /^[a-f\d]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("LOOPS_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function tokenEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function sealToken(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty token");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function openToken(envelope: string): string {
  const [marker, version, ivPart, tagPart, ciphertextPart] = envelope.split(":");
  if (`${marker}:${version}` !== PREFIX || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Refusing to use an unencrypted OAuth token");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
