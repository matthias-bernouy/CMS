import { expect, test } from "bun:test";
import { regression, statistics, throughput } from "./statistics";

test("percentiles use ordered complete samples and never change source observations", () => {
    const values = Array.from({ length: 20 }, (_, index) => 20 - index);
    expect(statistics(values)).toEqual({ count: 20, minimum: 1, maximum: 20, p50: 10, p95: 19, total: 210 });
    expect(values[0]).toBe(20);
    for (const input of [[], [NaN], [Infinity], [-1]]) {
        expect(() => statistics(input)).toThrow();
    }
});

test("throughput uses actual elapsed time rather than nominal scheduling intervals", () => {
    expect(throughput(420, 126_000)).toBe(200);
    expect(throughput(420, 252_000)).toBe(100);
    for (const [count, time] of [
        [0, 1],
        [1, 0],
        [1.5, 1],
        [1, NaN],
    ]) {
        expect(() => throughput(count!, time!)).toThrow();
    }
});

test("relative regressions also require an absolute change and never move the reference", () => {
    const limits = { relative: 0.2, absolute: 20 };
    expect(regression(100, 130, limits)).toBe(true);
    expect(regression(1, 2, limits)).toBe(false);
    expect(regression(100, 120, limits)).toBe(false);
    expect(regression(0, 25, limits)).toBe(true);
    expect(() => regression(NaN, 1, limits)).toThrow();
    expect(limits).toEqual({ relative: 0.2, absolute: 20 });
});
