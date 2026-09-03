import type {
    ReleaseVerificationPlanScenarioV1,
    ReleaseVerificationPlanV1,
} from "@bernouy/cms-integration-verification";
import type { UpgradeFixtureSuiteV1 } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import type { LocalReleasePackage } from "../types";
import { ReleaseScenarioInfrastructureError, runReleaseScenario, type ReleaseScenario } from "../sandbox/scenario";

const SCENARIO_INFRASTRUCTURE_ATTEMPTS = 3;

export { SUPABASE_CLI_VERSION } from "../../runtime/supabase";

export type { LocalReleasePackage } from "../types";

export type ReleaseRuntimeScenarioResult = Readonly<{
    scenario: ReleaseVerificationPlanScenarioV1;
    outcome: "passed" | "failed";
    error?: unknown;
}>;

export type ReleaseRuntimeExecution = Readonly<{
    scenarios: readonly ReleaseRuntimeScenarioResult[];
}>;

export async function executeReleaseVerificationPlan(input: {
    candidate: LocalReleasePackage;
    baselines: readonly LocalReleasePackage[];
    availablePackages: readonly LocalReleasePackage[];
    plan: ReleaseVerificationPlanV1;
    fixtures?: UpgradeFixtureSuiteV1 | null;
    continueOnFailure?: boolean;
    onScenario?: (scenario: ReleaseVerificationPlanScenarioV1) => void;
    runScenario?: (scenario: ReleaseScenario) => Promise<void>;
}): Promise<ReleaseRuntimeExecution> {
    const packages = [input.candidate, ...input.baselines, ...input.availablePackages];
    const run = input.runScenario ?? runReleaseScenario;
    const results: ReleaseRuntimeScenarioResult[] = [];
    for (const scenario of input.plan.scenarios) {
        input.onScenario?.(scenario);
        try {
            await runWithInfrastructureRetries(run, resolveScenario(input, packages, scenario));
            results.push({ scenario, outcome: "passed" });
        } catch (error) {
            if (error instanceof ReleaseScenarioInfrastructureError) {
                throw error;
            }
            results.push({ scenario, outcome: "failed", error });
            if (!input.continueOnFailure) {
                throw error;
            }
        }
    }
    return Object.freeze({ scenarios: Object.freeze(results) });
}

async function runWithInfrastructureRetries(
    run: (scenario: ReleaseScenario) => Promise<void>,
    scenario: ReleaseScenario,
): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            await run(scenario);
            return;
        } catch (error) {
            if (
                !(error instanceof ReleaseScenarioInfrastructureError) ||
                attempt === SCENARIO_INFRASTRUCTURE_ATTEMPTS
            ) {
                throw error;
            }
        }
    }
}

function resolveScenario(
    input: Parameters<typeof executeReleaseVerificationPlan>[0],
    packages: readonly LocalReleasePackage[],
    scenario: ReleaseVerificationPlanScenarioV1,
): ReleaseScenario {
    const baseline =
        scenario.type === "fresh-install"
            ? undefined
            : input.baselines.find(
                  (entry) =>
                      entry.package.envelope.version === scenario.baseline.version &&
                      entry.package.digest === scenario.baseline.packageDigest,
              );
    if (scenario.type !== "fresh-install" && !baseline) {
        throw new Error(
            `Release plan baseline ${scenario.baseline.version}@${scenario.baseline.packageDigest} is unavailable`,
        );
    }
    const fixture =
        scenario.type === "fresh-install" || !scenario.fixtureName
            ? undefined
            : input.fixtures?.scenarios.find(({ name }) => name === scenario.fixtureName);
    if (scenario.type !== "fresh-install" && scenario.fixtureName && !fixture) {
        throw new Error(`Release plan fixture ${scenario.fixtureName} is unavailable`);
    }
    return {
        target: input.candidate,
        packages,
        ...(baseline ? { baseline } : {}),
        ...(fixture ? { fixture } : {}),
        ...(scenario.type === "crash-recovery" ? { faultAfterPhase: scenario.phase } : {}),
    };
}
