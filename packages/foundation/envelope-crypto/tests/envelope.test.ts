import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
    decryptAesGcm,
    encryptAesGcm,
    EnvelopeSecretCrypto,
    LocalKekProvider,
    type DekRecord,
    type DekRepository,
} from "@bernouy/envelope-crypto";
import { makeDekRepo } from "./support/memoryDekRepository";

const KEY = randomBytes(32);

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
        expect(() => decryptAesGcm(blob, Buffer.from(row!.wrapped, "base64").subarray(0, 32))).toThrow();
    });

    test("scopes are isolated: a blob from one scope does not decrypt in another", async () => {
        const { repo } = makeDekRepo();
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo);
        const blob = await crypto.encrypt("tenant-a", "value");
        await crypto.encrypt("tenant-b", "other");
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
        expect(await crypto.decrypt("tenant-a", blobs[0]!)).toBe("one");
        expect(await crypto.decrypt("tenant-a", blobs[2]!)).toBe("three");
    });

    test("losing the cross-process create race adopts the winner's DEK", async () => {
        const kek = new LocalKekProvider(KEY);
        const winnerRecord: DekRecord = {
            scopeId: "tenant-a",
            wrapped: (await kek.generateDek()).wrapped,
            createdAt: new Date(),
            rotatedAt: null,
        };
        const losingRepo: DekRepository = {
            async get() {
                return null;
            },
            async create() {
                return winnerRecord;
            },
            async delete() {},
        };
        const loser = new EnvelopeSecretCrypto(kek, losingRepo);
        const blob = await loser.encrypt("tenant-a", "value");

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
        expect(calls.get).toBe(1);

        const expiring = new EnvelopeSecretCrypto(new LocalKekProvider(KEY), repo, { ttlMs: 0 });
        await expiring.decrypt("tenant-a", blob);
        await expiring.decrypt("tenant-a", blob);
        expect(calls.get).toBe(3);
    });
});
