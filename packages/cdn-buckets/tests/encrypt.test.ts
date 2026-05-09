import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";

import { encryptAesGcm, decryptAesGcm } from "src/core/crypto/encrypt";
import { loadKek } from "src/core/crypto/loadKek";

describe("encryptAesGcm / decryptAesGcm", () => {
    test("roundtrip recovers plaintext", () => {
        const key = randomBytes(32);
        const blob = encryptAesGcm("hello world", key);
        const out = decryptAesGcm(blob, key);
        expect(out.toString("utf8")).toBe("hello world");
    });

    test("each call produces a different IV for identical inputs", () => {
        const key = randomBytes(32);
        const a = encryptAesGcm("same", key);
        const b = encryptAesGcm("same", key);
        expect(a.iv.equals(b.iv)).toBe(false);
        expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    });

    test("rejects keys of the wrong length", () => {
        const k16 = randomBytes(16);
        expect(() => encryptAesGcm("x", k16)).toThrow();
    });

    test("decrypt with wrong key throws", () => {
        const k1 = randomBytes(32);
        const k2 = randomBytes(32);
        const blob = encryptAesGcm("secret", k1);
        expect(() => decryptAesGcm(blob, k2)).toThrow();
    });

    test("tampered ciphertext fails GCM tag check", () => {
        const key = randomBytes(32);
        const blob = encryptAesGcm("secret", key);
        blob.ciphertext[0] = blob.ciphertext[0]! ^ 0x01;
        expect(() => decryptAesGcm(blob, key)).toThrow();
    });
});

describe("loadKek", () => {
    test("accepts a valid 32-byte base64 KEK", () => {
        const valid = randomBytes(32).toString("base64");
        const out = loadKek(valid);
        expect(out.length).toBe(32);
    });

    test("rejects missing env value", () => {
        expect(() => loadKek(undefined)).toThrow(/missing/i);
        expect(() => loadKek("")).toThrow(/missing/i);
    });

    test("rejects wrong-length base64", () => {
        const tooShort = randomBytes(16).toString("base64");
        expect(() => loadKek(tooShort)).toThrow(/32 bytes/);
    });
});
