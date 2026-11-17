import { expect, test } from "bun:test";
import { inventoryFixture } from "../fixtures/inventory";
import { auditExecution, auditPlan, coverageMatrix } from "./coverage";
import { auditBudgets } from "./budgets";
import { distinctWitnessedSamples } from "./evidence";

test("a newly executable capability, binding or required variant without a scenario makes the plan fail", async () => {
    const f = await inventoryFixture();
    const findings = auditPlan(f.inventory, [f.scenario]);
    expect(findings.some((entry) => entry.obligation?.binding === "mcp")).toBe(true);
    expect(findings.some((entry) => entry.obligation?.variant === "cold")).toBe(true);
    expect(findings.some((entry) => entry.obligation?.target !== f.target.key)).toBe(true);
    expect(
        auditPlan(f.inventory, [{ ...f.scenario, budget: {} as never }]).some(
            (entry) => entry.code === "missing-budget",
        ),
    ).toBe(true);
    expect(
        auditPlan(f.inventory, [{ ...f.scenario, samples: NaN }]).some((entry) => entry.code === "invalid-scenario"),
    ).toBe(true);
});

test("cold samples require first executions from distinct process epochs, rather than renamed warm traces", async () => {
    const f = await inventoryFixture();
    const cold = { ...f.measurement, obligation: { ...f.measurement.obligation, variant: "cold" as const } };
    expect(distinctWitnessedSamples([cold])).toBe(0);
    const first = {
        ...cold,
        invocations: cold.invocations.map((row) => ({ ...row, firstInProcess: true, epoch: "process-a" })),
    };
    const duplicate = {
        ...first,
        traceId: "other-trace",
        invocations: first.invocations.map((row) => ({ ...row, traceId: "other-trace" })),
    };
    expect(distinctWitnessedSamples([first, duplicate])).toBe(1);
    const fresh = { ...duplicate, invocations: duplicate.invocations.map((row) => ({ ...row, epoch: "process-b" })) };
    expect(distinctWitnessedSamples([first, fresh])).toBe(2);
});

test("a concurrent plan cannot declare more in-flight work than its measured sample count", async () => {
    const f = await inventoryFixture();
    const concurrent = {
        ...f.scenario,
        obligations: [{ ...f.scenario.obligations[0]!, variant: "concurrent" as const }],
        load: { concurrency: 10, minimumRequestsPerMinute: 200 },
    };
    expect(auditPlan(f.inventory, [concurrent]).some((finding) => finding.code === "missing-load-budget")).toBe(true);
    expect(
        auditPlan(f.inventory, [{ ...concurrent, samples: 10 }]).some(
            (finding) => finding.code === "missing-load-budget",
        ),
    ).toBe(false);
});

test("setup calls, failed dispatches, wrong bindings, incomplete jobs and unread streams never count", async () => {
    const f = await inventoryFixture();
    for (const measurement of [
        { ...f.measurement, phase: "preparation" as const },
        { ...f.measurement, validated: false },
        { ...f.measurement, completed: false },
        { ...f.measurement, streamConsumed: false },
        { ...f.measurement, invocations: [] },
        { ...f.measurement, invocations: [{ ...f.measurement.invocations[0]!, success: false }] },
        { ...f.measurement, invocations: [{ ...f.measurement.invocations[0]!, binding: "mcp" }] },
        { ...f.measurement, work: { ...f.measurement.work, instrumentationComplete: false } },
    ]) {
        const coverage = coverageMatrix(
            f.inventory,
            [f.scenario],
            [{ scenario: f.scenario.id, status: "passed", measurements: [measurement] }],
        );
        expect(coverage.every((entry) => entry.status !== "covered")).toBe(true);
    }
});

test("one completed scenario cannot hide another unmeasured or skipped scenario", async () => {
    const f = await inventoryFixture();
    const second = { ...f.scenario, id: "fixture.second" };
    const results = [{ scenario: f.scenario.id, status: "passed" as const, measurements: [f.measurement] }];
    const rows = coverageMatrix(f.inventory, [f.scenario, second], results);
    expect(rows.every((entry) => entry.status !== "covered")).toBe(true);
    expect(auditExecution([f.scenario, second], results, rows).some((entry) => entry.scenario === second.id)).toBe(
        true,
    );
    const complete = coverageMatrix(f.inventory, [f.scenario], results);
    expect(
        complete.find(
            (entry) =>
                entry.obligation.target === f.target.key &&
                entry.obligation.variant === "nominal" &&
                entry.obligation.binding === "http",
        )?.status,
    ).toBe("covered");
});

test("measured regressions and missing metrics fail independently of the scenario's declared success", async () => {
    const f = await inventoryFixture();
    const run = (measurement: typeof f.measurement) =>
        auditBudgets([f.scenario], [{ scenario: f.scenario.id, status: "passed", measurements: [measurement] }]);
    expect(run(f.measurement)).toEqual([]);
    expect(run({ ...f.measurement, durationMs: f.scenario.budget.latencyMs + 1 })[0]?.code).toBe("budget-exceeded");
    expect(run({ ...f.measurement, work: { ...f.measurement.work, documentsExamined: NaN } })[0]?.code).toBe(
        "invalid-metrics",
    );
    expect(auditBudgets([f.scenario], [])[0]?.code).toBe("insufficient-samples");
});
