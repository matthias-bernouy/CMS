import { describe, expect, test } from "bun:test";
import {
    BufferedEndpointPerformanceRecorder,
    InMemoryEndpointPerformanceStore,
    type EndpointPerformanceQuery,
} from "@bernouy/cms-analytics";

const query = {
    range: "7d",
    sort: "requests",
    order: "desc",
    limit: 50,
} as const satisfies EndpointPerformanceQuery;

describe("InMemoryEndpointPerformanceStore retention and health", () => {
    test("does not let a caller-supplied report clock destroy retained data", async () => {
        const clock = new Date("2026-07-23T12:00:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => clock });
        const recorder = recorderFor(store, () => clock);
        observe(recorder, clock);
        await recorder.flush();

        const future = await store.dashboard(query, new Date("2027-07-23T12:00:00.000Z"));
        expect(future.summary.requests).toBe(0);
        const current = await store.dashboard(query, new Date("2026-07-23T12:01:00.000Z"));
        expect(current.summary.requests).toBe(1);
    });

    test("prunes against the store clock after the retention window", async () => {
        let clock = new Date("2026-07-01T12:00:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => clock });
        const recorder = recorderFor(store, () => clock);
        observe(recorder, clock);
        await recorder.flush();

        clock = new Date("2026-07-17T12:00:00.000Z");
        await store.dashboard(query, new Date("2026-07-01T12:01:00.000Z"));
        clock = new Date("2026-07-01T12:02:00.000Z");
        const removed = await store.dashboard(query, clock);
        expect(removed.summary.requests).toBe(0);
    });

    test("surfaces partial, uncertain, and stale collector health", async () => {
        const bucket = new Date("2026-07-23T12:00:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => bucket });
        await store.write({
            rollups: [],
            collectors: [
                {
                    collectorId: "unhealthy",
                    bucket,
                    accepted: 2,
                    dropped: 1,
                    invalid: 1,
                    flushFailures: 1,
                    uncertain: true,
                    lastFlushAt: bucket,
                },
            ],
        });

        const partial = await store.dashboard(query, new Date("2026-07-23T12:01:00.000Z"));
        expect(partial.meta).toMatchObject({
            accepted: 2,
            dropped: 1,
            invalid: 1,
            flushFailures: 1,
            collectorCountsExact: false,
            partial: true,
            stale: false,
        });
        const stale = await store.dashboard(query, new Date("2026-07-23T12:11:00.000Z"));
        expect(stale.meta.stale).toBe(true);
    });
});

function recorderFor(store: InMemoryEndpointPerformanceStore, now: () => Date) {
    return new BufferedEndpointPerformanceRecorder(store, {
        collectorId: "retention-test",
        now,
    });
}

function observe(recorder: BufferedEndpointPerformanceRecorder, ts: Date): void {
    recorder.observe({
        ts,
        surface: "control",
        endpointUrn: "urn:test:retention",
        method: "GET",
        status: 200,
        stagesMs: { cms_total: 25 },
    });
}
