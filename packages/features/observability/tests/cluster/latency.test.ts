import { expect, test } from "bun:test";
import { fixture, window } from "./fixture";
import { histogramIndex } from "../../src/cluster/core/histogram";
import type { LatencyHistogram } from "@bernouy/observability/cluster";

const input = {
    ...window,
    instanceIds: ["instance:a", "instance:b"],
    event: "gateway.invocation.completed",
    service: "cms-edge",
    groupBy: "capabilityId" as const,
    intervalSeconds: 3600,
};
function histogram(value: number, count: number): LatencyHistogram {
    return {
        bucket: Date.parse(window.from) / 3600000,
        key: "ulvia/cms.content/pages.get",
        count,
        sum: value * count,
        min: value,
        max: value,
        bins: [{ index: histogramIndex(value), count }],
    };
}
test("global percentiles use merged populations instead of averaging per-instance percentiles", async () => {
    const f = fixture();
    f.overrides.set("instance:a", { latency: async () => [histogram(10, 99)] });
    f.overrides.set("instance:b", { latency: async () => [histogram(10000, 1)] });
    const result = await f.service.latency(input);
    expect(result.method).toBe("histogram-upper-bound-v1");
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ count: 100, meanMs: 109.9, minMs: 10, maxMs: 10000 });
    expect(result.points[0]!.p95Ms).toBeGreaterThanOrEqual(10);
    expect(result.points[0]!.p95Ms).toBeLessThanOrEqual(11);
});
test("single, submillisecond and empty populations preserve observed bounds and absent windows", async () => {
    const f = fixture();
    expect((await f.service.latency(input)).points).toEqual([]);
    for (const duration of [0, 0.25, 1, 1031.079899, 86400000]) {
        f.overrides.set("instance:a", { latency: async () => [histogram(duration, 1)] });
        expect((await f.service.latency(input)).points[0]).toMatchObject({
            count: 1,
            minMs: duration,
            maxMs: duration,
            p50Ms: duration,
            p95Ms: duration,
        });
    }
});
test("incomplete latency cohorts are explicitly partial and oversized windows refuse without source work", async () => {
    const f = fixture();
    f.overrides.set("instance:a", { latency: async () => [histogram(20, 4)] });
    f.failures.set("instance:b", "limit_exceeded");
    expect(await f.service.latency(input)).toMatchObject({
        partial: true,
        points: [{ count: 4 }],
        sources: [
            { instanceId: "instance:a", status: "available" },
            { instanceId: "instance:b", status: "limit_exceeded" },
        ],
    });
    const opens = f.counts.opens;
    await expect(
        f.service.latency({ ...input, intervalSeconds: 60, from: "2026-11-20T10:00:00.000Z" }),
    ).rejects.toThrow("QUERY_TOO_LARGE");
    expect(f.counts.opens).toBe(opens);
});
