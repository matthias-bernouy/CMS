import { describe, expect, test } from "bun:test";
import {
    BufferedEndpointPerformanceRecorder,
    startEndpointPerformanceFlusher,
    type EndpointPerformanceObservation,
} from "@bernouy/cms-analytics";
import type {
    EndpointPerformanceBatch,
    EndpointPerformanceBatchWriter,
} from "cms-analytics/core/rollups/endpoint-performance/types";

const now = new Date("2026-07-23T12:02:00.000Z");
const observation: EndpointPerformanceObservation = {
    ts: now,
    surface: "delivery",
    endpointUrn: "urn:commerce:products",
    method: "GET",
    status: 200,
    stagesMs: { cms_total: 180 },
};

describe("endpoint performance flushing", () => {
    test("swaps buffers and shares one in-flight flush", async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        const batches: EndpointPerformanceBatch[] = [];
        const writer: EndpointPerformanceBatchWriter = {
            async write(batch) {
                batches.push(batch);
                await pending;
            },
        };
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { now: () => now });
        recorder.observe(observation);
        const first = recorder.flush();
        const shared = recorder.flush();
        recorder.observe({ ...observation, status: 503 });
        expect(first).toBe(shared);
        expect(recorder.stats().bufferedSeries).toBe(1);
        release();
        await first;
        await recorder.flush();
        expect(batches).toHaveLength(2);
        expect(batches[0]?.rollups[0]?.statusClass).toBe("2xx");
        expect(batches[1]?.rollups[0]?.statusClass).toBe("5xx");
    });

    test("drops an ambiguous failed increment batch instead of retrying it", async () => {
        const batches: EndpointPerformanceBatch[] = [];
        let fail = true;
        const writer: EndpointPerformanceBatchWriter = {
            async write(batch) {
                batches.push(batch);
                if (fail) {
                    fail = false;
                    throw new Error("connection lost after an unknown write boundary");
                }
            },
        };
        const recorder = new BufferedEndpointPerformanceRecorder(writer, { now: () => now });
        recorder.observe(observation);
        await expect(recorder.flush()).rejects.toThrow(/connection lost/);
        expect(recorder.stats()).toMatchObject({ accepted: 1, dropped: 1, flushFailures: 1 });

        await recorder.flush();
        expect(batches).toHaveLength(2);
        expect(batches[1]?.rollups).toHaveLength(0);
        expect(batches[1]?.collectors[0]).toMatchObject({ dropped: 1, flushFailures: 1 });
    });

    test("scheduler reports background errors without rejecting foreground work", async () => {
        let calls = 0;
        let reported: unknown;
        const flusher = startEndpointPerformanceFlusher(
            {
                async flush() {
                    calls++;
                    throw new Error("offline");
                },
            },
            { onError: (error) => (reported = error) },
        );
        await flusher.run();
        flusher.stop();
        expect(calls).toBe(1);
        expect(reported).toBeInstanceOf(Error);
    });
});
