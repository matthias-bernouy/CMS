import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptAesGcm, encryptAesGcm, LocalKekRingProvider, parseBlob, serializeBlob } from "@bernouy/envelope-crypto";

const KEY = randomBytes(32);

describe("aesGcm", () => {
    test("round-trips a utf8 string", () => {
        const blob = encryptAesGcm("héllo wörld", KEY);
        expect(decryptAesGcm(blob, KEY).toString("utf8")).toBe("héllo wörld");
    });

    test("a tampered ciphertext fails the GCM tag check", () => {
        const blob = encryptAesGcm("payload", KEY);
        const tampered = Buffer.from(blob.ciphertext);
        tampered[0] = tampered[0]! ^ 0xff;
        expect(() => decryptAesGcm({ ...blob, ciphertext: tampered }, KEY)).toThrow();
    });

    test("decrypting with another key fails", () => {
        const blob = encryptAesGcm("payload", KEY);
        expect(() => decryptAesGcm(blob, randomBytes(32))).toThrow();
    });

    test("rejects non-AES-256 key lengths upfront", () => {
        expect(() => encryptAesGcm("x", randomBytes(16))).toThrow("32 bytes");
        expect(() => decryptAesGcm(encryptAesGcm("x", KEY), randomBytes(31))).toThrow("32 bytes");
    });
});

describe("LocalKekRingProvider", () => {
    test("rejects a KEK that is not 32 bytes", () => {
        expect(() => new LocalKekRingProvider("test", { test: randomBytes(16) })).toThrow("32 bytes");
    });

    test("generateDek → unwrap round-trips the plaintext DEK", async () => {
        const kek = new LocalKekRingProvider("test", { test: KEY });
        const { wrapped, plaintext } = await kek.generateDek();
        expect(plaintext.length).toBe(32);
        expect(wrapped).not.toContain(plaintext.toString("base64"));
        expect((await kek.unwrap(wrapped, "test")).equals(plaintext)).toBe(true);
    });

    test("unwrap fails under a different KEK", async () => {
        const { wrapped } = await new LocalKekRingProvider("test", { test: KEY }).generateDek();
        await expect(
            new LocalKekRingProvider("test", { test: randomBytes(32) }).unwrap(wrapped, "test"),
        ).rejects.toThrow();
    });

    test("a key ring wraps with the active key and retains historical unwrap keys", async () => {
        const oldKey = randomBytes(32);
        const activeKey = randomBytes(32);
        const oldRing = new LocalKekRingProvider("old", { old: oldKey });
        const generated = await oldRing.generateDek();
        const ring = new LocalKekRingProvider("active", { old: oldKey, active: activeKey });

        expect(ring.hasKey("old")).toBe(true);
        expect(ring.hasKey("active")).toBe(true);
        expect((await ring.unwrap(generated.wrapped, generated.keyId)).equals(generated.plaintext)).toBe(true);
        expect((await ring.wrap(generated.plaintext)).keyId).toBe("active");
    });

    test("unwrap requires the persisted key ID without assuming the active key", async () => {
        const ring = new LocalKekRingProvider("active", { active: KEY });
        const generated = await ring.generateDek();
        await expect(ring.unwrap(generated.wrapped, undefined as never)).rejects.toThrow("unavailable");
    });

    test("a key ring refuses an unavailable historical key", async () => {
        const ring = new LocalKekRingProvider("active", { active: randomBytes(32) });
        await expect(ring.unwrap("ignored", "removed")).rejects.toThrow('referenced KEK "removed" is unavailable');
    });

    test("serializeBlob/parseBlob round-trip; malformed string is rejected", () => {
        const blob = encryptAesGcm("x", KEY);
        const parsed = parseBlob(serializeBlob(blob));
        expect(parsed.iv.equals(blob.iv)).toBe(true);
        expect(parsed.ciphertext.equals(blob.ciphertext)).toBe(true);
        expect(() => parseBlob("no-dot-separator")).toThrow("malformed");
    });
});
