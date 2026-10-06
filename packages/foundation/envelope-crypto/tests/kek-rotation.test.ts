import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
    EnvelopeSecretCrypto,
    LocalKekRingProvider,
    rotateDekWrapping,
    verifyDekKeyAvailability,
} from "@bernouy/envelope-crypto";
import { makeDekRepo } from "./support/memoryDekRepository";

describe("KEK rotation", () => {
    test("rewraps DEKs without changing their encrypted values", async () => {
        const oldKey = randomBytes(32);
        const activeKey = randomBytes(32);
        const { repo, rows, calls } = makeDekRepo();
        const writer = new EnvelopeSecretCrypto(new LocalKekRingProvider("old", { old: oldKey }), repo);
        const encrypted = await writer.encrypt("tenant-a", "secret");
        const ring = new LocalKekRingProvider("active", { old: oldKey, active: activeKey });
        const events: string[] = [];

        expect(await verifyDekKeyAvailability(ring, repo, 1)).toBe(1);
        const report = await rotateDekWrapping(ring, repo, {
            batchSize: 1,
            now: () => new Date("2026-01-02T03:04:05.000Z"),
            onRewrapped: (event) => events.push(`${event.scopeId}:${event.previousKeyId}->${event.activeKeyId}`),
        });

        expect(report).toEqual({ inspected: 1, rewrapped: 1, activeKeyId: "active" });
        expect(rows.get("tenant-a")?.keyId).toBe("active");
        expect(rows.get("tenant-a")?.rotatedAt?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
        expect(events).toEqual(["tenant-a:old->active"]);
        expect(calls.rewrap).toBe(1);
        const reader = new EnvelopeSecretCrypto(new LocalKekRingProvider("active", { active: activeKey }), repo);
        expect(await reader.decrypt("tenant-a", encrypted)).toBe("secret");
    });

    test("is idempotent when replayed after a completed rotation", async () => {
        const oldKey = randomBytes(32);
        const activeKey = randomBytes(32);
        const { repo } = makeDekRepo();
        await new EnvelopeSecretCrypto(new LocalKekRingProvider("old", { old: oldKey }), repo).encrypt(
            "tenant-a",
            "secret",
        );
        const ring = new LocalKekRingProvider("active", { old: oldKey, active: activeKey });
        await rotateDekWrapping(ring, repo);

        expect(await rotateDekWrapping(ring, repo)).toEqual({ inspected: 1, rewrapped: 0, activeKeyId: "active" });
    });

    test("fails readiness before touching data when a historical key is missing", async () => {
        const oldKey = randomBytes(32);
        const { repo, rows } = makeDekRepo();
        await new EnvelopeSecretCrypto(new LocalKekRingProvider("old", { old: oldKey }), repo).encrypt(
            "tenant-a",
            "secret",
        );
        const wrappedBefore = rows.get("tenant-a")?.wrapped;
        const incompleteRing = new LocalKekRingProvider("active", { active: randomBytes(32) });

        await expect(verifyDekKeyAvailability(incompleteRing, repo)).rejects.toThrow('unavailable KEK "old"');
        expect(rows.get("tenant-a")?.wrapped).toBe(wrappedBefore);
    });

    test("surfaces a compare-and-swap conflict instead of overwriting a concurrent change", async () => {
        const oldKey = randomBytes(32);
        const activeKey = randomBytes(32);
        const { repo } = makeDekRepo();
        await new EnvelopeSecretCrypto(new LocalKekRingProvider("old", { old: oldKey }), repo).encrypt(
            "tenant-a",
            "secret",
        );
        const conflictingRepo = {
            ...repo,
            async rewrap() {
                return false;
            },
        };
        const ring = new LocalKekRingProvider("active", { old: oldKey, active: activeKey });

        await expect(rotateDekWrapping(ring, conflictingRepo)).rejects.toThrow("rotation conflicted");
    });
});
