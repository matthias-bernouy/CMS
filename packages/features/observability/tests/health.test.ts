import { expect, test } from "bun:test";
import { createMemoryLogger } from "@bernouy/logging/testing";
import { BufferedLogCollector, createObservabilityLogger, LogDeliveryError } from "@bernouy/observability/logging";
import type { LogRecord } from "@bernouy/logging";

const entry = () => ({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level: "info" as const,
    event: "test.entry",
    attributes: {},
});

test("overflow is reported immediately, subsequent losses are summarized and shutdown reports the remainder", async () => {
    let now = 0;
    const memory = createMemoryLogger({ service: "collector" });
    const collector = new BufferedLogCollector(memory.logger, { maxEntries: 1, now: () => now });
    collector.enqueue(entry());
    for (let index = 0; index < 100; index++) {
        collector.enqueue(entry());
    }
    expect(memory.records).toHaveLength(1);
    expect(memory.records[0]).toMatchObject({
        event: "observability.delivery.dropped",
        attributes: { lost: 1, dropped: 1, queued: 1 },
    });
    expect(collector.stats()).toMatchObject({ dropped: 100, connected: false, flushing: false });
    now = 10_000;
    await collector.flush();
    expect(memory.records[1]).toMatchObject({ attributes: { lost: 99, dropped: 100 } });
    collector.enqueue(entry());
    await collector.close();
    expect(memory.records[2]).toMatchObject({
        event: "observability.delivery.dropped",
        attributes: { lost: 1, dropped: 101 },
    });
});

test("collection health exposes pending delivery, retry deadlines and the last successful acknowledgement", async () => {
    let now = 0;
    let fail = true;
    const memory = createMemoryLogger({ service: "collector" });
    const collector = new BufferedLogCollector(memory.logger, { now: () => now });
    collector.connect(async () => {
        expect(collector.stats().queued).toBe(1);
        if (fail) {
            throw new Error("offline");
        }
    });
    collector.enqueue(entry());
    const first = collector.flush();
    expect(collector.stats().flushing).toBe(true);
    await first;
    expect(collector.stats()).toMatchObject({
        failures: 1,
        connected: true,
        flushing: false,
        lastSuccessAt: undefined,
    });
    expect(collector.stats().retryAt).toBeGreaterThan(0);
    now = 100_000;
    fail = false;
    await collector.flush();
    expect(collector.stats()).toMatchObject({ failures: 0, queued: 0, retryAt: 0, lastSuccessAt: now });
    await collector.close();
});

test("loss summaries cannot enqueue themselves even when the fallback is another collecting logger", async () => {
    const fallback = createObservabilityLogger({ service: "fallback", fallback: () => undefined });
    const collector = new BufferedLogCollector(fallback.logger, { maxBytes: 1 });
    collector.enqueue(entry());
    expect(collector.stats().dropped).toBe(1);
    expect(fallback.collector.stats().queued).toBe(0);
    await collector.close();
    await fallback.collector.close();
});

test("collector loss diagnostics retain their configured instance without borrowing another request identity", async () => {
    const records: LogRecord[] = [];
    for (const instanceId of ["instance-a", "instance-b"]) {
        const diagnostics = createObservabilityLogger({
            service: "provider",
            attributes: { instanceId },
            context: () => ({ requestId: "unrelated-request" }),
            fallback: (record) => {
                records.push(record);
            },
        });
        diagnostics.collector.connect(async () => {
            throw new LogDeliveryError(false);
        });
        diagnostics.logger.info("service.ready");
        await diagnostics.collector.flush();
        await diagnostics.collector.close();
    }
    const losses = records.filter((record) => record.event === "observability.delivery.dropped");
    expect(losses.map((record) => record.attributes?.instanceId)).toEqual(["instance-a", "instance-b"]);
    for (const record of losses) {
        expect(record.attributes?.requestId).toBeUndefined();
        expect(record.attributes).toMatchObject({ lost: 1, dropped: 1 });
    }
});
