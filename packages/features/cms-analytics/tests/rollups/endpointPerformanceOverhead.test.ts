import { expect, test } from "bun:test";
import { BufferedEndpointPerformanceRecorder } from "@bernouy/cms-analytics";
import { recordRequestTiming, requestTimingSnapshot } from "@bernouy/http-runner";

const timingStages = [
    "cms_auth",
    "cms_endpoint_auth_lookup",
    "cms_authorize",
    "cms_roles",
    "cms_endpoint_resolve",
    "cms_source",
    "cms_overlays",
    "cms_context",
    "cms_secret",
    "cms_headers",
    "cms_body",
    "cms_upstream",
    "cms_projection",
    "cms_identity_binding",
    "cms_total",
] as const;

test("combined timing, normalization, and aggregation stay below the synchronous overhead budget", () => {
    const sampleCount = 1_000;
    const warmupSamples = 100;
    const representativeRequestBudgetMs = 250;
    const requests = Array.from({ length: sampleCount + warmupSamples }, () => new Request("http://local"));
    const recorder = new BufferedEndpointPerformanceRecorder(
        { async write() {} },
        {
            now: () => new Date("2026-07-23T12:02:00.000Z"),
        },
    );
    const durations: number[] = [];

    for (const [sample, request] of requests.entries()) {
        const startedAt = performance.now();
        for (const [index, stage] of timingStages.entries()) {
            recordRequestTiming(request, stage, index + 1);
        }
        recorder.observe({
            ts: new Date("2026-07-23T12:02:00.000Z"),
            surface: "delivery",
            endpointUrn: "urn:commerce:products",
            method: "GET",
            status: 200,
            stagesMs: requestTimingSnapshot(request),
        });
        const duration = performance.now() - startedAt;
        if (sample >= warmupSamples) {
            durations.push(duration);
        }
    }

    durations.sort((left, right) => left - right);
    const p95Ms = durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    expect(recorder.stats()).toMatchObject({ accepted: sampleCount + warmupSamples, bufferedSeries: 1 });
    expect(p95Ms).toBeLessThan(5);
    expect((p95Ms / representativeRequestBudgetMs) * 100).toBeLessThan(2);
});
