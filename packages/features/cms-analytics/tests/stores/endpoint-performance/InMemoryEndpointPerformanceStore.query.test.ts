import { describe, expect, test } from "bun:test";
import {
    BufferedEndpointPerformanceRecorder,
    InMemoryEndpointPerformanceStore,
    type EndpointPerformanceQuery,
} from "@bernouy/cms-analytics";

const baseQuery = {
    range: "1h",
    sort: "requests",
    order: "desc",
    limit: 50,
} as const satisfies EndpointPerformanceQuery;

describe("InMemoryEndpointPerformanceStore queries", () => {
    test("applies filters, limits, and Mongo-compatible binary tie ordering", async () => {
        const clock = new Date("2026-07-23T12:02:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => clock });
        const recorder = new BufferedEndpointPerformanceRecorder(store, {
            collectorId: "query-test",
            now: () => clock,
        });
        for (const endpointUrn of ["urn:test:-dash", "urn:test:Alpha", "urn:test:_underscore", "urn:test:éclair"]) {
            observe(recorder, clock, endpointUrn, "GET", 200);
        }
        observe(recorder, clock, "urn:test:failure", "POST", 503);
        observe(recorder, clock, "urn:test:failure", "POST", 503);
        await recorder.flush();

        const tied = await store.dashboard(
            { ...baseQuery, method: "GET", limit: 2 },
            new Date("2026-07-23T12:03:00.000Z"),
        );
        expect(tied.endpoints.map((row) => row.endpointUrn)).toEqual(["urn:test:-dash", "urn:test:Alpha"]);

        const failures = await store.dashboard(
            { ...baseQuery, method: "POST", statusClass: "5xx" },
            new Date("2026-07-23T12:03:00.000Z"),
        );
        expect(failures.summary).toMatchObject({ requests: 2, errors: 2, errorRate: 1 });
        expect(failures.endpoints).toEqual([
            expect.objectContaining({ endpointUrn: "urn:test:failure", method: "POST" }),
        ]);
    });

    test("keeps range filtering independent from retained data", async () => {
        let clock = new Date("2026-07-23T10:00:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => clock });
        const recorder = new BufferedEndpointPerformanceRecorder(store, {
            collectorId: "range-test",
            now: () => clock,
        });
        observe(recorder, clock, "urn:test:old", "GET", 200);
        await recorder.flush();
        clock = new Date("2026-07-23T12:00:00.000Z");
        observe(recorder, clock, "urn:test:current", "GET", 200);
        await recorder.flush();

        const current = await store.dashboard(baseQuery, new Date("2026-07-23T12:01:00.000Z"));
        expect(current.endpoints.map((row) => row.endpointUrn)).toEqual(["urn:test:current"]);
        const retained = await store.dashboard({ ...baseQuery, range: "7d" }, new Date("2026-07-23T12:01:00.000Z"));
        expect(retained.summary.requests).toBe(2);
    });
});

function observe(
    recorder: BufferedEndpointPerformanceRecorder,
    ts: Date,
    endpointUrn: string,
    method: string,
    status: number,
): void {
    recorder.observe({
        ts,
        surface: "control",
        endpointUrn,
        method,
        status,
        stagesMs: { cms_total: status >= 500 ? 250 : 25 },
    });
}
