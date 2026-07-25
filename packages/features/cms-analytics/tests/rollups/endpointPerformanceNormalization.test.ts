import { describe, expect, test } from "bun:test";
import type { EndpointPerformanceObservation } from "@bernouy/cms-analytics";
import {
    normalizeEndpointPerformanceObservation,
    truncateEndpointPerformanceBucket,
} from "cms-analytics/core/rollups/endpoint-performance/normalization";

const now = new Date("2026-07-23T12:02:00.000Z");
const observation = (over: Partial<EndpointPerformanceObservation> = {}): EndpointPerformanceObservation => ({
    ts: now,
    surface: "delivery",
    endpointUrn: "urn:commerce:products",
    method: "get",
    status: 200,
    stagesMs: { cms_total: 175, cms_upstream: 150 },
    ...over,
});

describe("endpoint performance normalization", () => {
    test("normalizes bounded dimensions and derives outcome", () => {
        expect(normalizeEndpointPerformanceObservation(observation(), now)).toEqual({
            ts: now,
            surface: "delivery",
            endpointUrn: "urn:commerce:products",
            method: "GET",
            statusClass: "2xx",
            outcome: "success",
            stagesMs: { cms_upstream: 150, cms_total: 175 },
            counters: {},
        });
    });

    test("uses the source URN grammar while retaining a hard length bound", () => {
        expect(
            normalizeEndpointPerformanceObservation(observation({ endpointUrn: "urn:commerce.v2:products/by-id" }), now)
                ?.endpointUrn,
        ).toBe("urn:commerce.v2:products/by-id");
        expect(
            normalizeEndpointPerformanceObservation(observation({ endpointUrn: `urn:source:${"x".repeat(250)}` }), now)
                ?.endpointUrn,
        ).toBe("__unresolved__");
    });

    test("replaces unsafe endpoint and method dimensions with fixed sentinels", () => {
        const normalized = normalizeEndpointPerformanceObservation(
            observation({
                endpointUrn: "https://upstream.test/private?user=alice",
                method: "CUSTOM-user-value",
            }),
            now,
        );
        expect(normalized).toMatchObject({ endpointUrn: "__unresolved__", method: "OTHER" });
        expect(JSON.stringify(normalized)).not.toContain("upstream.test");
        expect(JSON.stringify(normalized)).not.toContain("alice");
    });

    test("keeps count metrics separate from duration stages", () => {
        expect(
            normalizeEndpointPerformanceObservation(
                observation({ counters: { edge_db_calls: 3 }, stagesMs: { cms_total: 20 } }),
                now,
            ),
        ).toMatchObject({ stagesMs: { cms_total: 20 }, counters: { edge_db_calls: 3 } });
        expect(
            normalizeEndpointPerformanceObservation(
                observation({ counters: { edge_db_calls: 1.5 }, stagesMs: { cms_total: 20 } }),
                now,
            )?.counters,
        ).toEqual({});
    });

    test("accepts the closed Source image timing stages", () => {
        expect(
            normalizeEndpointPerformanceObservation(
                observation({
                    stagesMs: {
                        cms_total: 42,
                        cms_image_upstream: 10,
                        cms_image_read: 2,
                        cms_image_decode: 4,
                        cms_image_semaphore_wait: 1,
                        cms_image_encode: 20,
                        cms_image_store: 5,
                    },
                }),
                now,
            )?.stagesMs,
        ).toEqual({
            cms_image_upstream: 10,
            cms_image_read: 2,
            cms_image_decode: 4,
            cms_image_semaphore_wait: 1,
            cms_image_encode: 20,
            cms_image_store: 5,
            cms_total: 42,
        });
    });

    test("ignores unknown or invalid stages but requires a complete total", () => {
        const withUnsafeStages = observation({
            stagesMs: {
                cms_total: 20,
                cms_upstream: Number.POSITIVE_INFINITY,
                ["secret_name" as "cms_total"]: 12,
            },
        });
        expect(normalizeEndpointPerformanceObservation(withUnsafeStages, now)?.stagesMs).toEqual({ cms_total: 20 });
        expect(
            normalizeEndpointPerformanceObservation(observation({ stagesMs: { cms_upstream: 10 } }), now),
        ).toBeNull();
    });

    test("rejects invalid status, surface, timestamp, and stale observations", () => {
        expect(normalizeEndpointPerformanceObservation(observation({ status: 42 }), now)).toBeNull();
        expect(
            normalizeEndpointPerformanceObservation(observation({ surface: "worker" as "delivery" }), now),
        ).toBeNull();
        expect(normalizeEndpointPerformanceObservation(observation({ ts: new Date("invalid") }), now)).toBeNull();
        expect(
            normalizeEndpointPerformanceObservation(observation({ ts: new Date(now.getTime() - 300_001) }), now),
        ).toBeNull();
    });

    test("uses stable UTC five-minute buckets", () => {
        expect(truncateEndpointPerformanceBucket(now).toISOString()).toBe("2026-07-23T12:00:00.000Z");
    });
});
