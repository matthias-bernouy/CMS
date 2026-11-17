import { statistics } from "../harness/measurements/statistics";
import { witnessed } from "../capabilities/evidence";
import type { RunReport } from "./types";

export function resultSummary(report: RunReport, escape: (value: unknown) => string): string {
    return report.scenarios
        .map((scenario) => {
            const results = report.results.filter((result) => result.scenario === scenario.id);
            const measurements = results
                .flatMap((result) => result.measurements)
                .filter((sample) => sample.phase === "measurement");
            const values = measurements
                .map((sample) => sample.durationMs)
                .filter((value) => Number.isFinite(value) && value >= 0);
            const timing = values.length ? statistics(values) : null;
            const fields = [
                (sample: (typeof measurements)[number]) => sample.work.mongoOperations,
                (sample: (typeof measurements)[number]) => sample.work.documentsExamined,
                (sample: (typeof measurements)[number]) => sample.work.internalRequests,
                (sample: (typeof measurements)[number]) => sample.work.internalResponseBytes,
                (sample: (typeof measurements)[number]) => sample.responseBytes,
            ].map((read) => {
                const numbers = measurements.map(read).filter((value) => Number.isFinite(value) && value >= 0);
                return numbers.length ? String(Math.max(...numbers)) : "unavailable";
            });
            const failed = report.findings.some((finding) => finding.scenario === scenario.id);
            const status = !results.length
                ? "unattempted"
                : failed || results.some((result) => result.status !== "passed")
                  ? "failed"
                  : "passed";
            const root = measurements.filter((sample) => sample.breakdown).map((sample) => sample.breakdown!);
            const handler = root.length ? statistics(root.map((row) => row.handlerMs)).p95.toFixed(2) : "unavailable";
            const business = root.length
                ? String(Math.max(...root.map((row) => row.businessMongoOperations)))
                : "unavailable";
            const common = root.length
                ? String(Math.max(...root.map((row) => row.commonMongoOperations)))
                : "unavailable";
            const polls = root.filter((row) => row.pollMongoOperations !== undefined);
            const pollMongo = polls.length
                ? String(Math.max(...polls.map((row) => row.pollMongoOperations!)))
                : "not applicable";
            const load = results[0]?.load;
            return `<tr data-state="${status}"><td>${escape(scenario.id)}</td><td>${status}</td><td>${measurements.filter(witnessed).length}/${measurements.length}</td><td>${timing?.p50.toFixed(2) ?? "unavailable"}</td><td>${timing?.p95.toFixed(2) ?? "unavailable"}</td>${fields.map((value) => `<td>${escape(value)}</td>`).join("")}<td>${handler}</td><td>${business}</td><td>${common}</td><td>${pollMongo}</td><td>${load?.requestsPerMinute.toFixed(2) ?? "not measured"}</td><td>${load ? `${load.errors}/${load.timeouts}` : "not measured"}</td></tr>`;
        })
        .join("\n");
}
