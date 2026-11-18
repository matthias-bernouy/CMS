import { distinctWitnessedSamples, witnessed } from "./evidence";
import { requiredObligations } from "./policies";
import { obligationKey } from "./types";
import type {
    CapabilityInventory,
    Finding,
    Measurement,
    Obligation,
    ScenarioDefinition,
    ScenarioResult,
} from "./types";

export type CoverageRow = Readonly<{
    obligation: Obligation;
    scenarios: readonly string[];
    measured: number;
    successful: number;
    status: "missing-plan" | "unattempted" | "uncovered" | "covered";
}>;

export function auditPlan(
    inventory: CapabilityInventory,
    scenarios: readonly ScenarioDefinition[],
    required: readonly Obligation[] = inventory.targets.flatMap(requiredObligations),
): Finding[] {
    const targets = new Map(inventory.targets.map((target) => [target.key, target]));
    const declared = new Set<string>();
    const ids = new Set<string>();
    const findings: Finding[] = [];
    for (const scenario of scenarios) {
        if (ids.has(scenario.id)) {
            findings.push({ code: "duplicate-scenario", scenario: scenario.id, message: "Scenario ID is duplicated" });
        }
        ids.add(scenario.id);
        if (
            scenario.obligations.some((row) => row.variant === "concurrent") &&
            (!scenario.load ||
                !Number.isSafeInteger(scenario.load.concurrency) ||
                scenario.load.concurrency < 2 ||
                scenario.samples < scenario.load.concurrency ||
                !Number.isFinite(scenario.load.minimumRequestsPerMinute) ||
                scenario.load.minimumRequestsPerMinute <= 0)
        ) {
            findings.push({
                code: "missing-load-budget",
                scenario: scenario.id,
                message: "Concurrent scenarios require explicit concurrency and throughput budgets",
            });
        }
        if (
            !scenario.fixture ||
            !Number.isSafeInteger(scenario.version) ||
            scenario.version < 1 ||
            !Number.isSafeInteger(scenario.samples) ||
            scenario.samples < 1 ||
            !scenario.obligations.length
        ) {
            findings.push({
                code: "invalid-scenario",
                scenario: scenario.id,
                message: "Scenario identity is incomplete",
            });
        }
        const names = [
            "latencyMs",
            "mongoOperations",
            "documentsExamined",
            "internalRequests",
            "requestBytes",
            "responseBytes",
        ] as const;
        if (
            Object.keys(scenario.budget).length !== names.length ||
            names.some((name) => !Number.isFinite(scenario.budget[name]) || scenario.budget[name] <= 0)
        ) {
            findings.push({
                code: "missing-budget",
                scenario: scenario.id,
                message: "Complete finite budgets are required",
            });
        }
        for (const obligation of scenario.obligations) {
            const target = targets.get(obligation.target);
            if (!target || !target.definition.bindings.some(({ id }) => id === obligation.binding)) {
                findings.push({
                    code: "unknown-target",
                    scenario: scenario.id,
                    obligation,
                    message: "Unknown execution target or binding",
                });
            }
            declared.add(obligationKey(obligation));
        }
    }
    for (const obligation of required) {
        if (!declared.has(obligationKey(obligation))) {
            findings.push({
                code: "missing-scenario",
                obligation,
                message: "Required capability variant has no scenario",
            });
        }
    }
    return findings;
}

export function coverageMatrix(
    inventory: CapabilityInventory,
    scenarios: readonly ScenarioDefinition[],
    results: readonly ScenarioResult[],
    required: readonly Obligation[] = inventory.targets.flatMap(requiredObligations),
): CoverageRow[] {
    const declarations = new Map<string, ScenarioDefinition[]>();
    const attempts = new Map<string, ScenarioResult[]>();
    const samples = new Map<string, Measurement[]>();
    for (const scenario of scenarios) {
        for (const entry of scenario.obligations) {
            const key = obligationKey(entry);
            declarations.set(key, [...(declarations.get(key) ?? []), scenario]);
        }
    }
    for (const result of results) {
        attempts.set(result.scenario, [...(attempts.get(result.scenario) ?? []), result]);
        for (const measurement of result.measurements) {
            if (measurement.scenario === result.scenario) {
                const key = obligationKey(measurement.obligation);
                samples.set(key, [...(samples.get(key) ?? []), measurement]);
            }
        }
    }
    return required.map((obligation) => {
        const key = obligationKey(obligation);
        const declared = declarations.get(key) ?? [];
        const ids = new Set(declared.map(({ id }) => id));
        const measurements = (samples.get(key) ?? []).filter((measurement) => ids.has(measurement.scenario));
        const successful = measurements.filter(witnessed).length;
        const complete = declared.every(
            (scenario) =>
                attempts.get(scenario.id)?.length === 1 &&
                attempts.get(scenario.id)?.[0]?.status === "passed" &&
                distinctWitnessedSamples(measurements.filter((measurement) => measurement.scenario === scenario.id)) >=
                    scenario.samples,
        );
        return {
            obligation,
            scenarios: [...ids],
            measured: measurements.length,
            successful,
            status: !declared.length
                ? "missing-plan"
                : !declared.some((scenario) => attempts.has(scenario.id))
                  ? "unattempted"
                  : !complete
                    ? "uncovered"
                    : "covered",
        };
    });
}

export function auditExecution(
    scenarios: readonly ScenarioDefinition[],
    results: readonly ScenarioResult[],
    coverage: readonly CoverageRow[],
): Finding[] {
    const findings: Finding[] = [];
    const ids = new Set(scenarios.map((scenario) => scenario.id));
    for (const result of results) {
        if (!ids.has(result.scenario)) {
            findings.push({
                code: "unknown-result",
                scenario: result.scenario,
                message: "Result has no declared scenario",
            });
        }
    }
    for (const scenario of scenarios) {
        const attempts = results.filter((result) => result.scenario === scenario.id);
        if (attempts.length !== 1 || attempts[0]!.status !== "passed") {
            findings.push({
                code: "scenario-not-passed",
                scenario: scenario.id,
                message: attempts[0]?.failure ?? "Missing, duplicate, failed or blocked scenario",
            });
        }
    }
    for (const row of coverage) {
        if (row.status !== "covered") {
            findings.push({
                code: row.status,
                obligation: row.obligation,
                message: "Required invocation was not successfully measured",
            });
        }
    }
    return findings;
}
