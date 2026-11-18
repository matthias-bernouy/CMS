import { resolve } from "node:path";
import { executeWorkspace } from "../../../infra/workspace";
import { browserBuildStep, candidateEnvironment, candidateImageStep } from "../../../infra/images/candidate";
import { assessCapabilities } from "../assessment/run";
import { readRun } from "../reporting/history";
import type { PerformanceOptions } from "./options";
import type { WorkspaceStep } from "../../../infra/workspace";

const VERSION = "0.1.0-perf";

export function performanceSteps(targeted: boolean) {
    const supplementary: WorkspaceStep[] = targeted
        ? []
        : [
              { args: ["bun", "run", "tests/performance/benchmarks/run.ts"], continueOnFailure: true },
              {
                  args: ["bun", "run", "tests/performance/benchmarks/collections/repository/run.ts"],
                  continueOnFailure: true,
              },
              {
                  args: ["bun", "run", "tests/performance/delivery/run.ts"],
                  env: candidateEnvironment(VERSION),
                  continueOnFailure: true,
              },
          ];
    return { preparation: [browserBuildStep, candidateImageStep(VERSION)], supplementary };
}

export async function executePerformance(options: PerformanceOptions) {
    const diagnostic = process.env.ULVIA_PERFORMANCE_DIAGNOSTIC;
    if (diagnostic !== undefined && !["0", "1"].includes(diagnostic)) {
        throw new Error("ULVIA_PERFORMANCE_DIAGNOSTIC must be 0 or 1");
    }
    const referenceId = options.referenceId ?? process.env.ULVIA_PERFORMANCE_REFERENCE;
    if (referenceId) {
        await readRun(resolve("artifacts/performance/runs"), referenceId);
    }
    const steps = performanceSteps(options.scenarioIds.length > 0);
    await executeWorkspace(steps.preparation);
    let supplementaryFailed = false;
    try {
        await executeWorkspace(steps.supplementary);
    } catch (error) {
        supplementaryFailed = true;
        console.error(error instanceof Error ? error.message : "Supplementary performance journey failed");
    }
    const result = await assessCapabilities(
        { edge: `cyaxis/ulvia-edge:${VERSION}`, provider: `cyaxis/ulvia-provider:${VERSION}` },
        referenceId,
        undefined,
        undefined,
        { sharedHostDevelopment: diagnostic === "1", scenarioIds: options.scenarioIds },
    );
    return !supplementaryFailed && result.report.status === "passed" ? 0 : 1;
}
