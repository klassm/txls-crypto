import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted } from "./encryption.service.js";

const originalEnv = process.env.ENCRYPTION_KEY;

describe("EncryptionService", () => {
  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe("without ENCRYPTION_KEY", () => {
    it("should return plaintext when encrypting", () => {
      const result = encrypt("my-api-key");
      expect(result).toBe("my-api-key");
    });

    it("should return ciphertext when decrypting", () => {
      const result = decrypt("my-api-key");
      expect(result).toBe("my-api-key");
    });

    it("should return false for isEncrypted", () => {
      expect(isEncrypted("my-api-key")).toBe(false);
    });
  });

  describe("with ENCRYPTION_KEY", () => {
    beforeEach(() => {
      process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
    });

    it("should encrypt and decrypt correctly", () => {
      const plaintext = "my-secret-api-key";
      const encrypted = encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.startsWith("enc:")).toBe(true);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext", () => {
      const plaintext = "my-secret-api-key";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it("should return true for isEncrypted on encrypted values", () => {
      const encrypted = encrypt("my-api-key");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for isEncrypted on plaintext", () => {
      expect(isEncrypted("my-api-key")).toBe(false);
    });

    it("should return false for isEncrypted on null", () => {
      expect(isEncrypted(null)).toBe(false);
    });

    it("should handle empty string", () => {
      const encrypted = encrypt("");
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe("");
    });

    it("should decrypt plaintext values (passthrough)", () => {
      const result = decrypt("plaintext-value");
      expect(result).toBe("plaintext-value");
    });

    it("should throw error for corrupted encrypted data", () => {
      const encrypted = encrypt("my-api-key");
      const corrupted = encrypted.slice(0, -10) + "XXXXXXXXX";

      expect(() => decrypt(corrupted)).toThrow();
    });

    it("should throw error for invalid base64", () => {
      expect(() => decrypt("enc:!!!invalid-base64!!!")).toThrow();
    });
  });
});
