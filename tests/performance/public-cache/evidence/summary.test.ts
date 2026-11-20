import { expect, test } from "bun:test";
import { cacheOptions, scenarioIds } from "../plan";
import { summarize, stylePaths } from "./summary";
import type { Sample } from "./summary";

test("exact scenario selection is canonical, deduplicated and validated without infrastructure", () => {
    expect(cacheOptions(["--list"]).scenarios).toEqual([...scenarioIds]);
    expect(cacheOptions(["--scenario", "public.warm", "--scenario", "public.warm"]).scenarios).toEqual(["public.warm"]);
    for (const args of [
        ["--scenario", "unknown"],
        ["--samples", "0"],
        ["--epochs", "31"],
        ["--only", "all"],
        ["--samples"],
    ]) {
        expect(() => cacheOptions(args)).toThrow();
    }
});
test("summaries retain failed timings, separate phases and exclude preparation from percentiles", () => {
    const row: Sample = {
        scenario: "public.warm",
        phase: "request",
        epoch: 0,
        measured: true,
        requestId: "fixture",
        path: "/page",
        status: 200,
        cache: "HIT",
        cacheControl: "public, no-cache",
        etag: null,
        contentType: "text/html",
        headersMs: 5,
        firstByteMs: 6,
        totalMs: 10,
        bytes: 10,
        hash: "fixture",
        reusedSocket: true,
        failure: null,
    };
    const summary = summarize([
        row,
        { ...row, status: null, failure: "request-error", totalMs: 100, headersMs: null, firstByteMs: null },
        { ...row, totalMs: 10_000, measured: false },
        { ...row, phase: "following", totalMs: 1 },
    ]);
    expect(summary).toHaveLength(2);
    expect(summary[0]!.attempts).toBe(2);
    expect(summary[0]!.failures).toBe(1);
    expect(summary[0]!.totalMs!.p95).toBe(100);
    expect(summary[0]!.headersMs!.count).toBe(1);
    expect(summary[0]!.p95Evidence).toContain("Small sample");
});
test("stylesheet extraction preserves revision queries and rejects foreign origins", () => {
    expect(
        stylePaths(
            '<link href="/_content/style?r=old&amp;v=same" rel="stylesheet"><link rel="stylesheet" href="https://external.test/style"><link rel="icon" href="/favicon.ico">',
            "http://site.localhost:1234",
        ),
    ).toEqual(["/_content/style?r=old&v=same"]);
});
