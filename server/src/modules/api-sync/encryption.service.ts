import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:";

function deriveKey(encryptionKey: string): Buffer {
  const salt = "txls-api-key-encryption";
  return scryptSync(encryptionKey, salt, 32);
}

export function encrypt(plaintext: string): string {
  const key = config.apiSync.encryptionKey;
  if (!key) {
    return plaintext;
  }

  const derivedKey = deriveKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + combined.toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = config.apiSync.encryptionKey;
  if (!key) {
    return ciphertext;
  }

  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext;
  }

  const derivedKey = deriveKey(key);
  const combined = Buffer.from(ciphertext.slice(PREFIX.length), "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Failed to decrypt API key - invalid key or corrupted data");
  }
}

export function isEncrypted(value: string | null): boolean {
  return value !== null && value.startsWith(PREFIX);
}
