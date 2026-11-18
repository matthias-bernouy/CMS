import { statistics } from "../../harness/measurements/statistics";
import { witnessed } from "../../capabilities/evidence";
import type { RunReport } from "../types";

const RUNTIME_FINDINGS = new Set([
    "assessment-fixture-failed",
    "assessment-runtime-exited",
    "assessment-runtime-state-unavailable",
    "cleanup-failed",
    "source-changed-during-run",
    "measurement-contaminated",
]);

/** Keep exact runs and scenario versions separate, including failed timed attempts. */
export function summarizeRun(report: RunReport, reportLink: string) {
    const targets = new Map(report.inventory.targets.map((target) => [target.key, target]));
    const runtime = report.findings.filter((finding) => RUNTIME_FINDINGS.has(finding.code));
    const rows = report.scenarios.map((definition) => {
        const results = report.results.filter((result) => result.scenario === definition.id);
        const samples = results.flatMap((result) => result.measurements).filter((row) => row.phase === "measurement");
        const durations = samples.map((row) => row.durationMs).filter((value) => Number.isFinite(value) && value >= 0);
        const timing = durations.length ? statistics(durations) : null;
        const handler = samples
            .flatMap((row) => (row.breakdown ? [row.breakdown.handlerMs] : []))
            .filter((value) => Number.isFinite(value) && value >= 0);
        const target = targets.get(definition.obligations[0]?.target ?? "");
        if (!target) {
            throw new Error("Summary scenario has no exact inventory target");
        }
        const maximum = (values: readonly number[]) => {
            const finite = values.filter((value) => Number.isFinite(value) && value >= 0);
            return finite.length ? Math.max(...finite) : null;
        };
        const findings = report.findings.filter((finding) => finding.scenario === definition.id);
        return {
            run: report.metadata.id,
            revision: report.metadata.revision,
            source: report.metadata.sourceDigest,
            profile: report.metadata.profile.fingerprint,
            scenario: definition.id,
            scenarioVersion: definition.version,
            obligations: definition.obligations,
            contract: target.release.contractId,
            version: target.release.version,
            digest: target.release.digest,
            capability: target.definition.id,
            retained: target.retained,
            binding: definition.obligations.map((row) => row.binding).join("/"),
            variant: definition.obligations.map((row) => row.variant).join("/"),
            status: results.length ? results.map((result) => result.status).join("/") : "unattempted",
            samples: samples.length,
            declaredSamples: definition.samples,
            witnessed: samples.filter(witnessed).length,
            validated: samples.filter((sample) => sample.validated).length,
            p50: timing?.p50 ?? null,
            p95: timing?.p95 ?? null,
            min: timing?.minimum ?? null,
            max: timing?.maximum ?? null,
            handlerP95: handler.length ? statistics(handler).p95 : null,
            mongoOperations: maximum(samples.map((sample) => sample.work.mongoOperations)),
            documentsExamined: maximum(samples.map((sample) => sample.work.documentsExamined)),
            internalRequests: maximum(samples.map((sample) => sample.work.internalRequests)),
            responseBytes: maximum(samples.map((sample) => sample.responseBytes)),
            businessMongoOperations: maximum(
                samples.flatMap((sample) => (sample.breakdown ? [sample.breakdown.businessMongoOperations] : [])),
            ),
            commonMongoOperations: maximum(
                samples.flatMap((sample) => (sample.breakdown ? [sample.breakdown.commonMongoOperations] : [])),
            ),
            errors: samples.filter((sample) => !sample.validated || !sample.completed || !sample.streamConsumed).length,
            budget: definition.budget,
            findings,
            runtime,
            failure: results.flatMap((result) => (result.failure ? [result.failure] : [])),
            load: results[0]?.load ?? null,
            report: reportLink,
        };
    });
    return {
        run: {
            id: report.metadata.id,
            revision: report.metadata.revision,
            source: report.metadata.sourceDigest,
            profile: report.metadata.profile,
            images: report.metadata.images,
            status: report.status,
            findings: runtime,
            results: report.results.length,
            measured: rows.reduce((sum, row) => sum + row.samples, 0),
            report: reportLink,
        },
        rows,
    };
}

export type LatencyRow = ReturnType<typeof summarizeRun>["rows"][number];
export type LatencySummary = Readonly<{
    format: 1;
    generatedAt: string;
    percentileMethod: string;
    integrity: "sealed-run-reports";
    runs: readonly ReturnType<typeof summarizeRun>["run"][];
    rows: readonly LatencyRow[];
}>;
