import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import { BufferedLogCollector, createObservabilityLogger } from "@bernouy/cms-observability/logging";

const entry = () => ({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level: "error" as const,
    event: "test.failed",
    attributes: {},
});

test("a failing destination retries the same IDs without throwing into the producer", async () => {
    let now = 0;
    const collector = new BufferedLogCollector(NOOP_LOGGER, { now: () => now });
    let fail = true;
    const batches: string[][] = [];
    collector.connect(async (entries) => {
        batches.push(entries.map(({ id }) => id));
        if (fail) {
            throw new Error("offline");
        }
    });
    collector.enqueue(entry());
    await collector.flush();
    expect(collector.stats()).toMatchObject({ queued: 1, failures: 1 });
    fail = false;
    now = 100_000;
    await collector.flush();
    expect(batches).toHaveLength(2);
    expect(batches[0]).toEqual(batches[1]);
    expect(collector.stats()).toMatchObject({ queued: 0, failures: 0 });
    await collector.close();
});

test("collection bounds are enforced and transport logs cannot reenter the collector", async () => {
    const collector = new BufferedLogCollector(NOOP_LOGGER, { maxEntries: 2 });
    collector.enqueue(entry());
    collector.enqueue(entry());
    collector.enqueue(entry());
    expect(collector.stats()).toMatchObject({ queued: 2, dropped: 1 });
    collector.connect(async () => undefined);
    await collector.close();
    expect(collector.stats().queued).toBe(0);
    const diagnostics = createObservabilityLogger({ service: "test", fallback: () => undefined });
    diagnostics.collector.connect(async () => {
        diagnostics.logger.error("transport.internal");
    });
    diagnostics.logger.info("application.started");
    await diagnostics.collector.flush();
    expect(diagnostics.collector.stats().queued).toBe(0);
    await diagnostics.collector.close();
});

test("concurrent flushes remain single-flight and only acknowledge the delivered prefix", async () => {
    const collector = new BufferedLogCollector(NOOP_LOGGER);
    collector.enqueue(entry());
    let release: (() => void) | undefined;
    let calls = 0;
    collector.connect(async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
            release = resolve;
        });
    });
    const first = collector.flush();
    const second = collector.flush();
    collector.enqueue(entry());
    expect(calls).toBe(1);
    release!();
    await Promise.all([first, second]);
    expect(collector.stats().queued).toBe(1);
    const closing = collector.close(20);
    await closing;
    expect(collector.stats().queued).toBe(1);
    release!();
});
