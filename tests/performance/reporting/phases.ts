import type { RunReport } from "./types";
import { statistics } from "../harness/measurements/statistics";

/** Inclusive timings overlap: source.get includes metadata verification; preview.total includes Page writes. */
export function initializationPhaseRows(report: RunReport, escape: (value: string) => string): string {
    return report.results
        .flatMap((result) => {
            const samples = result.measurements.filter((sample) => sample.phase === "measurement");
            const names = [
                ...new Set(samples.flatMap((sample) => sample.phases?.map(({ name }) => name) ?? [])),
            ].toSorted();
            return names.map((name) => {
                const phases = samples.flatMap((sample) => sample.phases?.filter((phase) => phase.name === name) ?? []);
                return `<tr><td>${escape(result.scenario)}</td><td>${escape(name)}</td><td>${phases.length}/${samples.length}</td><td>${Math.max(...phases.map((phase) => phase.calls))}</td><td>${phases.reduce((sum, phase) => sum + phase.failed, 0)}</td><td>${statistics(phases.map((phase) => phase.totalMs)).p95.toFixed(2)}</td><td>${Math.max(...phases.map((phase) => phase.maxMs)).toFixed(2)}</td></tr>`;
            });
        })
        .join("\n");
}
