import { statistics } from "../harness/measurements/statistics";
import { auditLoad } from "../harness/measurements/load";
import { obligationKey } from "./types";
import type { Finding, Measurement, ScenarioDefinition, ScenarioResult } from "./types";

export function auditBudgets(scenarios: readonly ScenarioDefinition[], results: readonly ScenarioResult[]): Finding[] {
    const findings: Finding[] = [];
    for (const scenario of scenarios) {
        findings.push(
            ...auditLoad(
                scenario,
                results.find((row) => row.scenario === scenario.id),
            ),
        );
        const samples = results
            .filter((row) => row.scenario === scenario.id)
            .flatMap((row) => row.measurements)
            .filter((row) => row.phase === "measurement" && row.scenario === scenario.id);
        for (const obligation of scenario.obligations) {
            const measured = samples.filter((row) => obligationKey(row.obligation) === obligationKey(obligation));
            if (measured.length < scenario.samples) {
                findings.push({
                    code: "insufficient-samples",
                    scenario: scenario.id,
                    obligation,
                    message: "Required measurement samples are missing",
                });
                continue;
            }
            const fields = [
                ["latencyMs", (row: Measurement) => row.durationMs],
                ["mongoOperations", (row: Measurement) => row.work.mongoOperations],
                ["documentsExamined", (row: Measurement) => row.work.documentsExamined],
                ["internalRequests", (row: Measurement) => row.work.internalRequests],
                ["requestBytes", (row: Measurement) => row.requestBytes],
                ["responseBytes", (row: Measurement) => row.responseBytes],
            ] as const;
            for (const [name, read] of fields) {
                const values = measured.map(read);
                if (values.some((value) => !Number.isFinite(value) || value < 0)) {
                    findings.push({
                        code: "invalid-metrics",
                        scenario: scenario.id,
                        obligation,
                        message: `${name} has missing or invalid measurements`,
                    });
                    continue;
                }
                const actual = name === "latencyMs" ? statistics(values).p95 : Math.max(...values);
                if (actual > scenario.budget[name]) {
                    findings.push({
                        code: "budget-exceeded",
                        scenario: scenario.id,
                        obligation,
                        message: `${name}: ${actual} exceeds ${scenario.budget[name]}`,
                    });
                }
            }
        }
    }
    return findings;
}
