import { describe, expect, test } from "bun:test";
import { BufferedEndpointPerformanceRecorder, type EndpointPerformanceObservation } from "@bernouy/cms-analytics";
import type {
    EndpointPerformanceBatch,
    EndpointPerformanceBatchWriter,
} from "cms-analytics/core/rollups/endpoint-performance/types";

const now = new Date("2026-07-23T12:02:00.000Z");
const observation = (over: Partial<EndpointPerformanceObservation> = {}): EndpointPerformanceObservation => ({
    ts: now,
    surface: "delivery",
    endpointUrn: "urn:commerce:products",
    method: "GET",
    status: 200,
    stagesMs: { cms_total: 180, cms_upstream: 150 },
    ...over,
});

class CapturingWriter implements EndpointPerformanceBatchWriter {
    batches: EndpointPerformanceBatch[] = [];
    async write(batch: EndpointPerformanceBatch) {
        this.batches.push(batch);
    }
}

describe("BufferedEndpointPerformanceRecorder", () => {
    test("records every complete observation in memory and collapses equal dimensions", async () => {
        const writer = new CapturingWriter();
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { now: () => now });
        expect(recorder.observe(observation())).toBeUndefined();
        recorder.observe(observation({ status: 204, stagesMs: { cms_total: 220 } }));
        expect(writer.batches).toHaveLength(0);
        expect(recorder.stats()).toMatchObject({ accepted: 2, bufferedSeries: 1, dropped: 0 });

        await recorder.flush();
        const aggregate = writer.batches[0]?.rollups[0];
        expect(aggregate).toMatchObject({ requestCount: 2, errorCount: 0, statusClass: "2xx" });
        expect(aggregate?.stages.cms_total).toMatchObject({ count: 2, sumMs: 400, maxMs: 220 });
    });

    test("separates status, method, surface, and bucket dimensions", async () => {
        const writer = new CapturingWriter();
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { now: () => now });
        recorder.observe(observation());
        recorder.observe(observation({ status: 503 }));
        recorder.observe(observation({ method: "POST" }));
        recorder.observe(observation({ surface: "control" }));
        await recorder.flush();
        expect(writer.batches[0]?.rollups).toHaveLength(4);
        expect(writer.batches[0]?.rollups.find((row) => row.statusClass === "5xx")?.errorCount).toBe(1);
    });

    test("bounds new series while continuing to update existing keys", async () => {
        const writer = new CapturingWriter();
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { maxSeries: 1, now: () => now });
        recorder.observe(observation());
        recorder.observe(observation({ endpointUrn: "urn:commerce:brands" }));
        recorder.observe(observation({ stagesMs: { cms_total: 200 } }));
        await recorder.flush();
        expect(writer.batches[0]?.rollups[0]?.requestCount).toBe(2);
        expect(recorder.stats()).toMatchObject({ accepted: 2, dropped: 1 });
        expect(writer.batches[0]?.collectors[0]).toMatchObject({ accepted: 2, dropped: 1 });
    });

    test("does not admit incomplete observations or forbidden extra fields", async () => {
        const writer = new CapturingWriter();
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { now: () => now });
        recorder.observe({
            ...observation({ stagesMs: { cms_upstream: 1 } }),
            correlationId: "private-correlation",
            targetUrl: "https://secret.example/path",
        } as EndpointPerformanceObservation);
        await recorder.flush();
        expect(writer.batches[0]?.rollups).toHaveLength(0);
        expect(JSON.stringify(writer.batches[0])).not.toContain("private-correlation");
        expect(JSON.stringify(writer.batches[0])).not.toContain("secret.example");
        expect(writer.batches[0]?.collectors[0]).toMatchObject({ dropped: 1, invalid: 1 });
    });

    test("can disable collection without deleting or writing persisted data", async () => {
        const writer = new CapturingWriter();
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { enabled: false, now: () => now });
        recorder.observe(observation());
        await recorder.flush();
        expect(writer.batches).toHaveLength(0);
        expect(recorder.stats()).toMatchObject({ accepted: 0, dropped: 0, bufferedSeries: 0 });
    });
});
