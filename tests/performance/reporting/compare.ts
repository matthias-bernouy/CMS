import { regression, statistics } from "../harness/measurements/statistics";
import { distinctWitnessedSamples, witnessed } from "../capabilities/evidence";
import { obligationKey } from "../capabilities/types";
import { selectionFindings } from "./scope";
import type { Comparison, RunReport } from "./types";
import type { Finding } from "../capabilities/types";

export function compareReports(
    candidate: RunReport,
    reference: RunReport | null,
    limits = { relative: 0.2, absolute: 20 },
): Comparison {
    const findings: Finding[] = [];
    const changes: Comparison["changes"][number][] = [];
    if (!reference) {
        return {
            reference: null,
            candidate: candidate.metadata.id,
            comparable: false,
            findings: [{ code: "missing-reference", message: "No reproducible reference was supplied" }],
            changes,
        };
    }
    const ineligible = new Set([
        "source-changed-during-run",
        "assessment-fixture-failed",
        "measurement-contaminated",
        "assessment-runtime-exited",
        "assessment-runtime-state-unavailable",
        "cleanup-failed",
    ]);
    for (const [name, report] of [
        ["Candidate", candidate],
        ["Reference", reference],
    ] as const) {
        if (
            selectionFindings(report.metadata, report.scenarios).length ||
            report.findings.some((finding) => ineligible.has(finding.code))
        ) {
            findings.push({
                code: "incompatible-reference",
                message: `${name} has an explicit measurement eligibility failure`,
            });
        }
    }
    for (const [name, same] of [
        ["environment", candidate.metadata.profile.fingerprint === reference.metadata.profile.fingerprint],
        [
            "instrumentation",
            candidate.metadata.profile.instrumentationDigest === reference.metadata.profile.instrumentationDigest,
        ],
        ["inventory", candidate.inventory.fingerprint === reference.inventory.fingerprint],
        [
            "scenario selection",
            JSON.stringify(candidate.metadata.selection) === JSON.stringify(reference.metadata.selection),
        ],
        [
            "scenario execution order",
            JSON.stringify(candidate.scenarios.map((scenario) => scenario.id)) ===
                JSON.stringify(reference.scenarios.map((scenario) => scenario.id)),
        ],
        [
            "required coverage",
            JSON.stringify(candidate.coverage.map((row) => obligationKey(row.obligation))) ===
                JSON.stringify(reference.coverage.map((row) => obligationKey(row.obligation))),
        ],
    ] as const) {
        if (!same) {
            findings.push({ code: "incompatible-reference", message: `Reference ${name} differs` });
        }
    }
    const referenceDefinitions = new Map(reference.scenarios.map((scenario) => [scenario.id, scenario]));
    if (reference.scenarios.length !== candidate.scenarios.length) {
        findings.push({ code: "incompatible-reference", message: "Reference scenario inventory differs" });
    }
    for (const scenario of candidate.scenarios) {
        const previous = referenceDefinitions.get(scenario.id);
        if (
            !previous ||
            previous.version !== scenario.version ||
            previous.fixture !== scenario.fixture ||
            JSON.stringify(previous.obligations) !== JSON.stringify(scenario.obligations) ||
            previous.samples !== scenario.samples ||
            JSON.stringify(previous.budget) !== JSON.stringify(scenario.budget) ||
            JSON.stringify(previous.load) !== JSON.stringify(scenario.load)
        ) {
            findings.push({
                code: "incompatible-reference",
                scenario: scenario.id,
                message: "Scenario version, fixture, obligations, budgets or sample count changed",
            });
        }
    }
    if (findings.length) {
        return {
            reference: reference.metadata.id,
            candidate: candidate.metadata.id,
            comparable: false,
            findings,
            changes,
        };
    }
    for (const scenario of candidate.scenarios) {
        for (const obligation of scenario.obligations) {
            const samples = (report: RunReport) =>
                report.results
                    .filter((result) => result.scenario === scenario.id && result.status === "passed")
                    .flatMap((result) => result.measurements)
                    .filter(
                        (sample) =>
                            sample.scenario === scenario.id &&
                            obligationKey(sample.obligation) === obligationKey(obligation) &&
                            witnessed(sample),
                    );
            const before = samples(reference);
            const after = samples(candidate);
            if (
                distinctWitnessedSamples(before) < scenario.samples ||
                distinctWitnessedSamples(after) < scenario.samples
            ) {
                findings.push({
                    code: "incomplete-comparison",
                    scenario: scenario.id,
                    obligation,
                    message: "Comparable complete samples are missing",
                });
                continue;
            }
            const referenceP95Ms = statistics(before.map((sample) => sample.durationMs)).p95;
            const candidateP95Ms = statistics(after.map((sample) => sample.durationMs)).p95;
            const regressed = regression(referenceP95Ms, candidateP95Ms, limits);
            changes.push({
                scenario: scenario.id,
                referenceP95Ms,
                candidateP95Ms,
                deltaMs: candidateP95Ms - referenceP95Ms,
                regressed,
            });
            if (regressed) {
                findings.push({
                    code: "latency-regression",
                    scenario: scenario.id,
                    message: `p95 increased from ${referenceP95Ms} to ${candidateP95Ms} ms`,
                    obligation,
                });
            }
            for (const [name, read, absolute] of [
                ["mongoOperations", (sample: (typeof before)[number]) => sample.work.mongoOperations, 1],
                ["documentsExamined", (sample: (typeof before)[number]) => sample.work.documentsExamined, 1],
                ["internalRequests", (sample: (typeof before)[number]) => sample.work.internalRequests, 1],
                ["requestBytes", (sample: (typeof before)[number]) => sample.requestBytes, 1024],
                ["responseBytes", (sample: (typeof before)[number]) => sample.responseBytes, 1024],
            ] as const) {
                const previous = Math.max(...before.map(read));
                const current = Math.max(...after.map(read));
                if (regression(previous, current, { relative: limits.relative, absolute })) {
                    findings.push({
                        code: "work-regression",
                        scenario: scenario.id,
                        obligation,
                        message: `${name} increased from ${previous} to ${current}`,
                    });
                }
            }
        }
    }
    return {
        reference: reference.metadata.id,
        candidate: candidate.metadata.id,
        comparable: !findings.some((finding) => finding.code === "incomplete-comparison"),
        findings,
        changes,
    };
}
