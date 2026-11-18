import { expect, test } from "bun:test";
import { reportFixture } from "../../fixtures/report";
import { summarizeRun } from "./model";
import { renderLatencySummary } from "./html";

test("summary keeps failed timings, exact scenario versions and runtime findings without counting preparation", async () => {
    const base = await reportFixture();
    const sample = base.results[0]!.measurements[0]!;
    const scenario = { ...base.scenarios[0]!, samples: 3, version: 7 };
    const report = {
        ...base,
        scenarios: [scenario, { ...scenario, id: "not-attempted", samples: 1 }],
        results: [
            {
                ...base.results[0]!,
                status: "failed" as const,
                failure: "<script>invalid</script>",
                measurements: [
                    { ...sample, phase: "preparation" as const, durationMs: 99999 },
                    { ...sample, durationMs: 1 },
                    { ...sample, durationMs: 2 },
                    { ...sample, durationMs: 100, validated: false },
                ],
            },
        ],
        findings: [{ code: "assessment-runtime-exited", message: "Provider OOM signal" }],
    };
    const before = JSON.stringify(report);
    const { run, rows } = summarizeRun(report, "../exports/report.html");
    expect(run.measured).toBe(3);
    expect(rows[0]).toMatchObject({ samples: 3, witnessed: 2, p50: 2, p95: 100, errors: 1, scenarioVersion: 7 });
    expect(rows[0]!.source).toBe(base.metadata.sourceDigest);
    expect(rows[0]!.digest).toBe(
        base.inventory.targets.find((target) => target.key === scenario.obligations[0]!.target)!.release.digest,
    );
    expect(rows[1]).toMatchObject({
        samples: 0,
        witnessed: 0,
        p50: null,
        p95: null,
        mongoOperations: null,
        status: "unattempted",
    });
    const html = renderLatencySummary({
        format: 1,
        generatedAt: "2026-11-18T00:00:00Z",
        percentileMethod: "nearest-rank",
        integrity: "sealed-run-reports",
        runs: [run],
        rows,
    });
    expect(html).toContain("&lt;script&gt;invalid&lt;/script&gt;");
    expect(html).not.toContain("<script>invalid</script>");
    expect(html).toContain("Provider OOM signal");
    expect(html).toContain('data-bad="true"');
    expect(() =>
        renderLatencySummary({
            format: 1,
            generatedAt: "now",
            percentileMethod: "nearest-rank",
            integrity: "sealed-run-reports",
            runs: [run],
            rows: [{ ...rows[0]!, report: "javascript:alert(1)" }],
        }),
    ).toThrow("relative local");
    expect(() =>
        summarizeRun(
            {
                ...base,
                scenarios: [{ ...scenario, obligations: [{ ...scenario.obligations[0]!, target: "missing" }] }],
            },
            "../report.html",
        ),
    ).toThrow("exact inventory");
    expect(JSON.stringify(report)).toBe(before);
});
