import { CapabilityGateway } from "@bernouy/cms-gateway";
import { gatewayObservability } from "@bernouy/cms-gateway/observability/node";
import { gatewayRoute, NOW } from "../../cms-gateway/tests/fixtures";
import { CmsObservability, assertLogAcknowledgement } from "@bernouy/cms-observability";
import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import { InMemoryJournalStore } from "@bernouy/cms-observability/memory";
import { BufferedLogCollector, LogDeliveryError, createObservabilityLogger } from "@bernouy/cms-observability/logging";
import { mongoFilter } from "../src/default-implementation/mongo/filter";

const entry = () => ({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level: "error" as const,
    event: "delivery.test",
    attributes: { value: "before" },
});

test("permanent rejections cannot poison later batches and drops are counted", async () => {
    const collector = new BufferedLogCollector(NOOP_LOGGER);
    let calls = 0;
    collector.connect(async () => {
        calls += 1;
        if (calls === 1) {
            throw new LogDeliveryError(false);
        }
    });
    collector.enqueue(entry());
    await collector.flush();
    expect(collector.stats()).toMatchObject({ queued: 0, dropped: 1 });
    collector.enqueue(entry());
    await collector.flush();
    expect(collector.stats()).toMatchObject({ queued: 0, dropped: 1 });
    expect(calls).toBe(2);
    await collector.close();
});

test("the byte ceiling and snapshot boundary hold before asynchronous delivery", async () => {
    const full = new BufferedLogCollector(NOOP_LOGGER, { maxBytes: 1 });
    full.enqueue(entry());
    expect(full.stats()).toMatchObject({ queued: 0, dropped: 1, bytes: 0 });
    await full.close();
    const collector = new BufferedLogCollector(NOOP_LOGGER);
    const item = entry();
    collector.enqueue(item);
    item.attributes.value = "after";
    collector.connect(async (entries) => {
        expect(entries[0]!.attributes.value).toBe("before");
    });
    await collector.close();
});

test("Mongo treats event prefixes as literals and keeps expiry and tenant filters", () => {
    const filter = mongoFilter(
        "instance-a",
        { from: "2026-10-25T00:00:00.000Z", to: "2026-10-26T00:00:00.000Z", eventPrefix: ".*", limit: 10 },
        "2026-10-26T00:00:00.000Z",
    );
    expect(filter.instanceId).toBe("instance-a");
    expect(filter.expiresAt).toEqual({ $gt: new Date("2026-10-26T00:00:00.000Z") });
    const prefix = filter.$and![0]!.event as { $regex: string };
    expect(new RegExp(prefix.$regex).test("other.event")).toBe(false);
    expect(new RegExp(prefix.$regex).test(".*literal")).toBe(true);
});

test("an incomplete success acknowledgement never releases the full producer batch", () => {
    expect(() => assertLogAcknowledgement({ accepted: 2, stored: 1, duplicates: 1 }, 2)).not.toThrow();
    for (const value of [
        null,
        {},
        { accepted: 1, stored: 1, duplicates: 0 },
        { accepted: 2, stored: 1, duplicates: 0 },
        { accepted: 2, stored: -1, duplicates: 3 },
    ]) {
        expect(() => assertLogAcknowledgement(value, 2)).toThrow("not fully acknowledged");
    }
});

test("redaction expansion remains readable and idempotent after the producer truncates a tag", async () => {
    const journal = new CmsObservability({
        store: new InMemoryJournalStore(),
        instanceId: "instance-a",
        cursorKey: "x".repeat(32),
    });
    const diagnostics = createObservabilityLogger({ service: "cms-edge", fallback: () => undefined });
    let id = "";
    diagnostics.collector.connect(async (entries) => {
        id = entries[0]!.id;
        expect(entries[0]!.attributes.note).toHaveLength(1024);
        expect(await journal.append({ entries }, "cms-edge")).toEqual({ accepted: 1, stored: 1, duplicates: 0 });
        expect(await journal.append({ entries }, "cms-edge")).toEqual({ accepted: 1, stored: 0, duplicates: 1 });
    });
    try {
        diagnostics.logger.info("delivery.test", { note: "x".repeat(1016) + " token=a" });
        await diagnostics.collector.flush();
        expect(id).not.toBe("");
        const detail = await journal.get({ id });
        expect(detail.attributes.note).toHaveLength(1024);
        expect(detail.attributes.note).not.toContain("token=a");
        expect(diagnostics.collector.stats()).toMatchObject({ queued: 0, dropped: 0, failures: 0 });
    } finally {
        await diagnostics.collector.close();
    }
});

test("Mongo reception-time windows match the pagination order and preserve tenant expiry", () => {
    const filter = mongoFilter(
        "instance-a",
        {
            from: "2026-10-26T12:00:00.000Z",
            to: "2026-10-26T12:01:00.000Z",
            timeField: "receivedAt",
            limit: 200,
        },
        "2026-10-26T12:01:00.000Z",
    );
    expect(filter.time).toBeUndefined();
    expect(filter.receivedAt).toEqual({ $gte: "2026-10-26T12:00:00.000Z", $lt: "2026-10-26T12:01:00.000Z" });
    expect(filter.instanceId).toBe("instance-a");
    expect(filter.expiresAt).toEqual({ $gt: new Date("2026-10-26T12:01:00.000Z") });
});

test("Gateway invocation observations cannot recursively collect their own journal delivery", async () => {
    const diagnostics = createObservabilityLogger({ service: "cms-edge", fallback: () => undefined });
    const route = await gatewayRoute();
    const gateway = new CapabilityGateway({
        ...gatewayObservability(diagnostics.logger),
        now: () => NOW,
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        transport: { send: async () => ({ output: { items: [] } }) },
    });
    let deliveries = 0;
    const invoke = () =>
        gateway.invoke({
            siteId: "site-a",
            contractId: "catalog",
            capabilityId: "item.list",
            input: {},
            actor: { kind: "anonymous" },
        });
    diagnostics.collector.connect(async () => {
        deliveries += 1;
        await invoke();
    });
    try {
        await invoke();
        await diagnostics.collector.flush();
        await diagnostics.collector.flush();
        expect(deliveries).toBe(1);
        expect(diagnostics.collector.stats().queued).toBe(0);
    } finally {
        await diagnostics.collector.close();
    }
});
