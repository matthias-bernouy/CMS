import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { writeResourceArchive } from "@bernouy/resources";
import { HostPreparationPool } from "../../../src/runtime/instances/verification/HostPreparationPool";
import { prepareResourceTask } from "../../../src/runtime/instances/verification/resources/preview";
import { archiveFixture } from "./resourcesFixture";

async function measure(operation: () => Promise<unknown>) {
    let last = performance.now();
    let maxDelayMs = 0;
    let ticks = 0;
    const timer = setInterval(() => {
        const now = performance.now();
        maxDelayMs = Math.max(maxDelayMs, now - last - 10);
        last = now;
        ticks++;
    }, 10);
    try {
        await Bun.sleep(20);
        ticks = 0;
        const started = performance.now();
        const value = await operation();
        const durationMs = performance.now() - started;
        const duringTicks = ticks;
        await Bun.sleep(20);
        return { value, durationMs, maxDelayMs, duringTicks };
    } finally {
        clearInterval(timer);
    }
}

test("resource verification and candidate Page preview keep the host heartbeat responsive", async () => {
    const source = await archiveFixture();
    const archive = await writeResourceArchive({
        document: {
            ...source.document,
            blocs: Array.from({ length: 160 }, (_, index) => ({
                ...source.document.blocs[0]!,
                id: `sample-card-${index}`,
                viewJS: `${source.document.blocs[0]!.viewJS};/*${"padding".repeat(600)}*/`,
            })),
            pages: Array.from({ length: 16 }, (_, index) => ({
                ...source.document.pages[0]!,
                path: `/page-${index}`,
                html: `<div cms-bloc="sample-card-${index}"></div>`,
            })),
        },
        assets: source.assets.map(({ definition, bytes }) => ({ path: definition.entry, bytes })),
    });
    const execution = { fingerprint: "selected", selected: [], denied: [] };
    const system = await new InMemoryContentRepository().getSystem();
    const task = { kind: "resource-preview" as const, bytes: archive.bytes, digest: archive.digest, execution, system };
    const pool = new HostPreparationPool();
    try {
        await pool.resources.preview(archive, execution, system, new AbortController().signal);
        const inline = await measure(() => prepareResourceTask(task));
        const worker = await measure(() =>
            pool.resources.preview(archive, execution, system, new AbortController().signal),
        );
        expect(worker.value).toEqual(inline.value);
        console.info(
            "[resource-preparation]",
            JSON.stringify({
                inline: { durationMs: inline.durationMs, maxDelayMs: inline.maxDelayMs },
                worker: { durationMs: worker.durationMs, maxDelayMs: worker.maxDelayMs, ticks: worker.duringTicks },
            }),
        );
        expect(worker.duringTicks).toBeGreaterThan(0);
        expect(worker.maxDelayMs).toBeLessThan(Math.max(150, inline.maxDelayMs * 0.75));
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
    } finally {
        await pool.close();
    }
}, 30000);
