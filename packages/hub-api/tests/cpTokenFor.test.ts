import { describe, test, expect } from "bun:test";
import { createControlPlaneIssuer, MemoryKeyStore } from "@bernouy/issuer-kit";
import { createCpTokenFor } from "src/core/issuer/cpTokenFor";

function freshIssuer(now: () => number = () => Math.floor(Date.now() / 1000)) {
    return createControlPlaneIssuer({
        issuer:   "https://hub.example",
        keyStore: new MemoryKeyStore({ now, keyOverlapSeconds: 300 }),
        now,
    });
}

describe("cpTokenFor", () => {
    test("every call mints a fresh token — no cache (TP enforces JTI replay, base.md §4.5)", async () => {
        const cp = createCpTokenFor({ issuer: freshIssuer() });
        const t1 = await cp("delivery-acme");
        const t2 = await cp("delivery-acme");
        expect(t2).not.toBe(t1);
    });

    test("different providerIds get different tokens", async () => {
        const cp = createCpTokenFor({ issuer: freshIssuer() });
        const tA = await cp("a");
        const tB = await cp("b");
        expect(tA).not.toBe(tB);
    });
});
