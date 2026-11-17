import { throughput } from "./statistics";
import type { Observation } from "../clients/types";
import type { Finding, ScenarioDefinition, ScenarioResult } from "../../capabilities/types";

export function measuredLoad(concurrency: number, elapsedMs: number, samples: readonly Observation[]) {
    return {
        concurrency,
        requests: samples.length,
        elapsedMs,
        requestsPerMinute: throughput(samples.length, elapsedMs),
        errors: samples.filter((sample) => !sample.validated).length,
        timeouts: samples.filter((sample) => sample.failure === "timeout").length,
    };
}

export function auditLoad(scenario: ScenarioDefinition, result?: ScenarioResult): Finding[] {
    if (!scenario.load) {
        return [];
    }
    const actual = result?.load;
    const fail = (code: string, message: string): Finding[] => [{ code, scenario: scenario.id, message }];
    if (!actual) {
        return fail("missing-load-measurement", "Concurrency and actual throughput were not measured");
    }
    if (
        [
            actual.concurrency,
            actual.requests,
            actual.elapsedMs,
            actual.requestsPerMinute,
            actual.errors,
            actual.timeouts,
        ].some((value) => !Number.isFinite(value) || value < 0) ||
        [actual.concurrency, actual.requests, actual.errors, actual.timeouts].some(
            (value) => !Number.isSafeInteger(value),
        ) ||
        actual.elapsedMs === 0 ||
        actual.requests < scenario.samples ||
        actual.concurrency > actual.requests ||
        actual.errors > actual.requests ||
        actual.timeouts > actual.errors ||
        actual.concurrency !== scenario.load.concurrency ||
        Math.abs(actual.requestsPerMinute - throughput(actual.requests, actual.elapsedMs)) > 0.000001
    ) {
        return fail(
            "invalid-load-measurement",
            "Load measurements are incomplete or inconsistent with actual elapsed time",
        );
    }
    const findings: Finding[] = [];
    if (actual.requestsPerMinute < scenario.load.minimumRequestsPerMinute) {
        findings.push(
            ...fail(
                "throughput-budget-exceeded",
                `Actual throughput ${actual.requestsPerMinute} requests/min is below ${scenario.load.minimumRequestsPerMinute}`,
            ),
        );
    }
    if (actual.errors || actual.timeouts) {
        findings.push(...fail("load-errors", `Measured ${actual.errors} errors and ${actual.timeouts} timeouts`));
    }
    return findings;
}
