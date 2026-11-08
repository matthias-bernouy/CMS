import { admitCollectionRelease } from "@bernouy/repository/collections";
import { expect, test } from "bun:test";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import { CollectionVerificationPool } from "../../../src/runtime/instances/verification/CollectionVerificationPool";

async function measure(operation: () => Promise<unknown>) {
    let last = performance.now();
    let maxDelayMs = 0;
    const timer = setInterval(() => {
        const now = performance.now();
        maxDelayMs = Math.max(maxDelayMs, now - last - 10);
        last = now;
    }, 10);
    try {
        await Bun.sleep(20);
        const started = performance.now();
        await operation();
        const durationMs = performance.now() - started;
        await Bun.sleep(20);
        return { durationMs, maxDelayMs };
    } finally {
        clearInterval(timer);
    }
}

test("large synthetic collection verification keeps the host heartbeat responsive", async () => {
    const admitted = await admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "test",
        collectionId: "test/large",
        version: "1.0.0",
        name: "name",
        locale: "en",
        translations: {
            en: Object.fromEntries([
                ["name", "Large verification fixture"],
                ...Array.from({ length: 3000 }, (_, i) => [`label-${i}`, `Label ${i}`]),
            ]),
        },
        blocs: [],
        assets: [],
    });
    const value = admitted.release;
    const pool = new CollectionVerificationPool();
    try {
        await pool.metadata(value, admitted.digest);
        const inline = await measure(() => inlineCollectionVerifier.metadata(value, admitted.digest));
        const worker = await measure(() => pool.metadata(value, admitted.digest));
        console.info("[collection-verification]", JSON.stringify({ inline, worker }));
        expect(worker.maxDelayMs).toBeLessThan(Math.max(150, inline.maxDelayMs * 0.75));
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
    } finally {
        await pool.close();
    }
}, 30_000);
