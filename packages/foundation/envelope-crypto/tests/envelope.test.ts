import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";
import {
    encryptAesGcm,
    decryptAesGcm,
    LocalKekProvider,
    serializeBlob,
    parseBlob,
    EnvelopeSecretCrypto,
    loadKek,
    type DekRepository,
    type DekRecord,
} from "@bernouy/envelope-crypto";

const KEY = randomBytes(32);

/** In-memory `DekRepository` with call counters, enough to observe the
 *  envelope's persistence + caching behaviour. */
function makeDekRepo() {
    const rows = new Map<string, DekRecord>();
    const calls = { get: 0, create: 0 };
    const repo: DekRepository = {
        async get(scopeId) {
            calls.get++;
            return rows.get(scopeId) ?? null;
        },
        async create(record) {
            calls.create++;
            const existing = rows.get(record.scopeId);
            if (existing) {
                return existing;
            }
            rows.set(record.scopeId, record);
            return record;
        },
        async delete(scopeId) {
            rows.delete(scopeId);
        },
    };
    return { repo, rows, calls };
}

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

describe("LocalKekProvider", () => {
    test("rejects a KEK that is not 32 bytes", () => {
        expect(() => new LocalKekProvider(randomBytes(16))).toThrow("32 bytes");
    });

    test("generateDek → unwrap round-trips the plaintext DEK", async () => {
        const kek = new LocalKekProvider(KEY);
        const { wrapped, plaintext } = await kek.generateDek();
        expect(plaintext.length).toBe(32);
        expect(wrapped).not.toContain(plaintext.toString("base64"));
        expect((await kek.unwrap(wrapped)).equals(plaintext)).toBe(true);
    });

    test("unwrap fails under a different KEK", async () => {
        const { wrapped } = await new LocalKekProvider(KEY).generateDek();
        const other = new LocalKekProvider(randomBytes(32));
        await expect(other.unwrap(wrapped)).rejects.toThrow();
    });

    test("serializeBlob/parseBlob round-trip; malformed string is rejected", () => {
        const blob = encryptAesGcm("x", KEY);
        const parsed = parseBlob(serializeBlob(blob));
        expect(parsed.iv.equals(blob.iv)).toBe(true);
        expect(parsed.ciphertext.equals(blob.ciphertext)).toBe(true);
        expect(() => parseBlob("no-dot-separator")).toThrow("malformed");
    });
});

describe("EnvelopeSecretCrypto", () => {
    test("encrypt/decrypt round-trips within a scope", async () => {
        const { repo } = makeDekRepo();
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blob = await crypto.encrypt("tenant-a", "sk_live_123");
        expect(await crypto.decrypt("tenant-a", blob)).toBe("sk_live_123");
    });

    test("first encrypt auto-creates the scope's DEK row, wrapped only", async () => {
        const { repo, rows } = makeDekRepo();
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blob = await crypto.encrypt("tenant-a", "value");
        const row = rows.get("tenant-a");
        expect(row).toBeDefined();
        expect(row!.rotatedAt).toBeNull();
        // The wrapped DEK must decrypt the data only after a KEK unwrap —
        // i.e. the row never contains a key that works as-is.
        expect(() => decryptAesGcm(blob, Buffer.from(row!.wrapped, "base64").subarray(0, 32))).toThrow();
    });

    test("scopes are isolated: a blob from one scope does not decrypt in another", async () => {
        const { repo } = makeDekRepo();
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blob = await crypto.encrypt("tenant-a", "value");
        await crypto.encrypt("tenant-b", "other"); // provisions tenant-b's distinct DEK
        await expect(crypto.decrypt("tenant-b", blob)).rejects.toThrow();
    });

    test("decrypt on a scope with no DEK throws instead of returning empty", async () => {
        const { repo } = makeDekRepo();
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blob = encryptAesGcm("x", randomBytes(32));
        await expect(crypto.decrypt("ghost", blob)).rejects.toThrow('no DEK for scope "ghost"');
    });

    test("concurrent encrypts on a fresh scope mint exactly one DEK", async () => {
        const { repo, calls } = makeDekRepo();
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blobs = await Promise.all([
            crypto.encrypt("tenant-a", "one"),
            crypto.encrypt("tenant-a", "two"),
            crypto.encrypt("tenant-a", "three"),
        ]);
        expect(calls.create).toBe(1);
        // All three ciphertexts must decrypt — none invalidated by a racing DEK.
        expect(await crypto.decrypt("tenant-a", blobs[0]!)).toBe("one");
        expect(await crypto.decrypt("tenant-a", blobs[2]!)).toBe("three");
    });

    test("losing the cross-process create race adopts the winner's DEK", async () => {
        const kek = new LocalKekProvider(KEY);
        // The row another process persisted between our `get` and `create`.
        const winnerRecord: DekRecord = {
            scopeId: "tenant-a",
            wrapped: (await kek.generateDek()).wrapped,
            createdAt: new Date(),
            rotatedAt: null,
        };
        const losingRepo: DekRepository = {
            async get() {
                return null;
            }, // we saw no row…
            async create() {
                return winnerRecord;
            }, // …but the store says someone else won
            async delete() {},
        };
        const loser = new EnvelopeSecretCrypto(kek, losingRepo);
        const blob = await loser.encrypt("tenant-a", "value");

        // The blob must decrypt under the WINNER's DEK — i.e. from any other
        // process reading the shared store — not under the loser's dead mint.
        const { repo, rows } = makeDekRepo();
        rows.set("tenant-a", winnerRecord);
        const reader = new EnvelopeSecretCrypto(kek, repo);
        expect(await reader.decrypt("tenant-a", blob)).toBe("value");
    });

    test("the DEK cache absorbs repeat reads; an expired entry refetches", async () => {
        const { repo, calls } = makeDekRepo();
        const cached = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blob = await cached.encrypt("tenant-a", "v");
        await cached.decrypt("tenant-a", blob);
        await cached.decrypt("tenant-a", blob);
        expect(calls.get).toBe(1); // only the initial encrypt hit the repo

        const expiring = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo, { ttlMs: 0 });
        await expiring.decrypt("tenant-a", blob);
        await expiring.decrypt("tenant-a", blob);
        expect(calls.get).toBe(3); // every read goes back to the repo
    });
});

describe("loadKek", () => {
    test("decodes a base64 32-byte KEK", () => {
        const kek = randomBytes(32);
        expect(loadKek(kek.toString("base64")).equals(kek)).toBe(true);
    });

    test("fails fast on a missing value, naming the env var", () => {
        expect(() => loadKek(undefined, "CMS_KEK")).toThrow("CMS_KEK");
        expect(() => loadKek("", "CMS_KEK")).toThrow("openssl rand");
    });

    test("rejects a value that does not decode to exactly 32 bytes", () => {
        expect(() => loadKek(randomBytes(16).toString("base64"))).toThrow("32 bytes");
        expect(() => loadKek("not base64 at all!!")).toThrow();
    });
});
