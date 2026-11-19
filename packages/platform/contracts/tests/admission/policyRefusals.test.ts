import { expect, test } from "bun:test";
import { DEFAULT_RELEASE_LIMITS, verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import { StoredReleaseCache } from "ulvia-contracts/core/admission/cache/StoredReleaseCache";
import { fixture, outcome, referenceVerification } from "./support";
import { capabilityDocument } from "../support/fixtures";

test("cached structure cannot bypass stricter capability, byte or nesting limits", async () => {
    const admitted = await fixture({
        capabilities: [
            { ...capabilityDocument(), bindings: [{ id: "agent", transport: "mcp" }] },
            { ...capabilityDocument(), id: "email.message.preview", bindings: [{ id: "agent", transport: "mcp" }] },
        ],
    });
    await verifyStoredContractReleaseJson(admitted.canonicalJson, admitted.digest);
    for (const limits of [
        { ...DEFAULT_RELEASE_LIMITS, maxCapabilities: 1 },
        { ...DEFAULT_RELEASE_LIMITS, maxDocumentBytes: 1 },
        { ...DEFAULT_RELEASE_LIMITS, maxJsonDepth: 1 },
        { ...DEFAULT_RELEASE_LIMITS, maxSchemaNodes: 1 },
        { ...DEFAULT_RELEASE_LIMITS, maxStringLength: 1 },
    ]) {
        const expected = await outcome(admitted.canonicalJson, admitted.digest, limits);
        expect(expected).not.toHaveProperty("value");
        expect(await outcome(admitted.canonicalJson, admitted.digest, limits, verifyStoredContractReleaseJson)).toEqual(
            expected,
        );
    }
});

test("inherited or accessor policies retain ordinary verification and error order", async () => {
    const admitted = await fixture();
    let calls = 0;
    const cache = new StoredReleaseCache(async (...args) => {
        calls += 1;
        return referenceVerification(...args);
    });
    const inherited = Object.create(DEFAULT_RELEASE_LIMITS) as typeof DEFAULT_RELEASE_LIMITS;
    const accessor = { ...DEFAULT_RELEASE_LIMITS };
    Object.defineProperty(accessor, "maxDocumentBytes", { get: () => DEFAULT_RELEASE_LIMITS.maxDocumentBytes });
    for (const limits of [inherited, accessor, { ...DEFAULT_RELEASE_LIMITS, maxJsonDepth: 0 }]) {
        for (let index = 0; index < 2; index += 1) {
            expect(
                await outcome(admitted.canonicalJson, admitted.digest, limits, (...args) => cache.get(...args)),
            ).toEqual(await outcome(admitted.canonicalJson, admitted.digest, limits));
        }
    }
    expect(calls).toBe(6);
    expect(cache.snapshot()).toEqual({ entries: 0, bytes: 0, pending: 0, pendingBytes: 0 });
});
