import { expect, test } from "bun:test";
import { reportFixture } from "../fixtures/report";
import { compareReports } from "./compare";
import { renderReport } from "./html";

test("comparisons refuse missing references, changed fixtures and different environments", async () => {
    const reference = await reportFixture();
    expect(compareReports(reference, null).findings[0]?.code).toBe("missing-reference");
    const environment = {
        ...reference,
        metadata: { ...reference.metadata, profile: { ...reference.metadata.profile, fingerprint: "different" } },
    };
    expect(compareReports(environment, reference).comparable).toBe(false);
    const fixture = {
        ...reference,
        scenarios: reference.scenarios.map((scenario) => ({ ...scenario, fixture: "changed" })),
    };
    expect(compareReports(fixture, reference).comparable).toBe(false);
    expect(
        compareReports({ ...reference, inventory: { ...reference.inventory, fingerprint: "changed" } }, reference)
            .comparable,
    ).toBe(false);
});

test("a real slowdown is reported without moving the reference or turning incomplete samples into zero", async () => {
    const reference = await reportFixture();
    const before = JSON.stringify(reference);
    const candidate = {
        ...reference,
        results: reference.results.map((result) => ({
            ...result,
            measurements: result.measurements.map((sample) => ({ ...sample, durationMs: 100 })),
        })),
    };
    expect(compareReports(candidate, reference).findings[0]?.code).toBe("latency-regression");
    expect(JSON.stringify(reference)).toBe(before);
    const incomplete = { ...reference, results: reference.results.map((result) => ({ ...result, measurements: [] })) };
    expect(compareReports(incomplete, reference).comparable).toBe(false);
    expect(compareReports(incomplete, reference).changes).toEqual([]);
});

test("HTML reports escape diagnostic text and retain missing coverage instead of showing a false 100 percent", async () => {
    const report = await reportFixture();
    const html = renderReport({ ...report, findings: [{ code: "example", message: '<script>alert("x")</script>' }] });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("missing-plan");
    expect(html).toContain("non-executable templates");
    expect(html).toContain("1/");
});

test("work regressions, changed budgets and missing execution witnesses are checked independently of latency", async () => {
    const reference = await reportFixture();
    const candidate = {
        ...reference,
        results: reference.results.map((result) => ({
            ...result,
            measurements: result.measurements.map((sample) => ({
                ...sample,
                work: { ...sample.work, mongoOperations: 20 },
            })),
        })),
    };
    expect(compareReports(candidate, reference).findings[0]?.code).toBe("work-regression");
    const noWitness = {
        ...reference,
        results: reference.results.map((result) => ({
            ...result,
            measurements: result.measurements.map((sample) => ({ ...sample, invocations: [] })),
        })),
    };
    expect(compareReports(noWitness, reference).comparable).toBe(false);
    const changedBudget = {
        ...reference,
        scenarios: reference.scenarios.map((scenario) => ({
            ...scenario,
            budget: { ...scenario.budget, latencyMs: 10_000 },
        })),
    };
    expect(compareReports(changedBudget, reference).comparable).toBe(false);
});

test("cold comparisons require separate process epochs even when request traces differ", async () => {
    const fixture = await reportFixture();
    const obligation = { ...fixture.scenarios[0]!.obligations[0]!, variant: "cold" as const };
    const scenario = { ...fixture.scenarios[0]!, samples: 3, obligations: [obligation] };
    const cold = (separateEpochs: boolean) => ({
        ...fixture,
        scenarios: [scenario],
        results: fixture.results.map((result) => ({
            ...result,
            measurements: Array.from({ length: 3 }, (_, index) => ({
                ...result.measurements[0]!,
                obligation,
                traceId: `cold-${index}`,
                invocations: result.measurements[0]!.invocations.map((invocation) => ({
                    ...invocation,
                    traceId: `cold-${index}`,
                    firstInProcess: true,
                    epoch: separateEpochs ? `process-${index}` : "same-process",
                })),
            })),
        })),
    });
    expect(compareReports(cold(true), cold(true)).comparable).toBe(true);
    expect(compareReports(cold(false), cold(true)).findings[0]?.code).toBe("incomplete-comparison");
    expect(compareReports(cold(true), cold(false)).findings[0]?.code).toBe("incomplete-comparison");
});
