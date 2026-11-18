import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureSourceSnapshot } from "./source";
import { reportFixture } from "../../fixtures/report";
import { requiredObligations, budgetFor } from "../../capabilities/policies";
import { coverageMatrix } from "../../capabilities/coverage";
import { measuredLoad } from "../../harness/measurements/load";
import type { RunReport } from "../types";

/** Read the task's existing Git revision; this fixture never creates a commit or edits source. */
export async function sourceFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-source-archive-test-"));
    const workspace = resolve(import.meta.dir, "../../../..");
    const sourceRoot = join(root, "snapshots");
    try {
        const snapshot = await captureSourceSnapshot(workspace, sourceRoot);
        return { root, workspace, sourceRoot, snapshot, close: () => rm(root, { recursive: true, force: true }) };
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }
}

/** Synthetic completeness evidence for testing eligibility rules; never part of the performance scenario inventory. */
export async function completeMeasurementFixture(): Promise<RunReport> {
    const base = await reportFixture();
    const sample = base.results[0]!.measurements[0]!;
    const scenarios = base.inventory.targets.flatMap((target, index) =>
        requiredObligations(target).map((obligation) => ({
            ...base.scenarios[0]!,
            id: `fixture-${index}-${obligation.binding}-${obligation.variant}`,
            obligations: [obligation],
            samples: obligation.variant === "concurrent" ? 2 : 1,
            budget: budgetFor(target, obligation.variant),
            ...(obligation.variant === "concurrent" ? { load: { concurrency: 2, minimumRequestsPerMinute: 1 } } : {}),
        })),
    );
    const results = scenarios.map((scenario) => {
        const obligation = scenario.obligations[0]!;
        const measurements = Array.from({ length: scenario.samples }, (_unused, index) => {
            const traceId = `${scenario.id}-${index}`;
            return {
                ...sample,
                scenario: scenario.id,
                obligation,
                traceId,
                durationMs: 5000,
                invocations: [
                    {
                        target: obligation.target,
                        binding: obligation.binding,
                        traceId,
                        durationMs: 2,
                        success: true,
                        firstInProcess: true,
                        epoch: traceId,
                    },
                ],
            };
        });
        return {
            scenario: scenario.id,
            status: "passed" as const,
            measurements,
            ...(scenario.load ? { load: measuredLoad(2, 10000, measurements) } : {}),
        };
    });
    return {
        ...base,
        scenarios,
        results,
        coverage: coverageMatrix(base.inventory, scenarios, results),
        findings: [{ code: "missing-reference", message: "Synthetic initial baseline" }],
        status: "failed",
    };
}
