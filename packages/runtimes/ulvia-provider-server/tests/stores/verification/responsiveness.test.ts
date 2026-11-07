import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { inlineCollectionVerifier } from "@bernouy/cms-repository/collections/sources";
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

test("official collection verification keeps the host heartbeat responsive", async () => {
    const root = new URL("../../../../ulvia-cli/dist/bootstrap/", import.meta.url);
    const index = await Bun.file(new URL("index.json", root)).json();
    const entry = index.collections.find(
        (item: { release: string }) => item.release === "collections/mossa/release.json",
    );
    const json = (await Bun.file(new URL(entry.release, root)).text()).trim();
    const value = JSON.parse(json);
    const admitted = await inlineCollectionVerifier.metadata(
        value,
        `sha256:${createHash("sha256").update(json).digest("hex")}`,
    );
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
