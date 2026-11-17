import type { Measurement } from "./types";

export function witnessed(measurement: Measurement): boolean {
    const numbers = [
        "mongoOperations",
        "documentsExamined",
        "keysExamined",
        "documentsReturned",
        "internalRequests",
        "internalResponseBytes",
    ] as const;
    return (
        measurement.phase === "measurement" &&
        measurement.validated &&
        measurement.completed &&
        measurement.streamConsumed &&
        measurement.work.instrumentationComplete &&
        [
            measurement.durationMs,
            measurement.requestBytes,
            measurement.responseBytes,
            ...numbers.map((name) => measurement.work[name]),
        ].every((value) => Number.isFinite(value) && value >= 0) &&
        measurement.invocations.some(
            (invocation) =>
                invocation.success &&
                (measurement.obligation.variant !== "cold" ||
                    (invocation.firstInProcess === true &&
                        typeof invocation.epoch === "string" &&
                        invocation.epoch.length > 0)) &&
                Number.isFinite(invocation.durationMs) &&
                invocation.durationMs >= 0 &&
                invocation.target === measurement.obligation.target &&
                invocation.binding === measurement.obligation.binding &&
                invocation.traceId === measurement.traceId,
        )
    );
}

export function distinctWitnessedSamples(samples: readonly Measurement[]): number {
    const valid = samples.filter(witnessed);
    const traces = new Set(valid.map((sample) => sample.traceId)).size;
    if (valid[0]?.obligation.variant !== "cold") {
        return traces;
    }
    const epochs = valid.map(
        (sample) =>
            sample.invocations.find(
                (invocation) =>
                    invocation.success &&
                    invocation.firstInProcess &&
                    invocation.target === sample.obligation.target &&
                    invocation.binding === sample.obligation.binding &&
                    invocation.traceId === sample.traceId,
            )?.epoch,
    );
    return Math.min(traces, new Set(epochs.filter(Boolean)).size);
}
