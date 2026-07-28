import type {
    RepositoryCandidateGarbageCollectionLogEntry,
    RepositoryOperationalSnapshot,
} from "../observability/contracts";

export class RepositoryCandidateGarbageCollectionMetrics {
    readonly #metrics = {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        removedObjects: 0,
        retainedReferencedObjects: 0,
        retainedWithinGraceObjects: 0,
        prunedCandidates: 0,
        removedAuditRecords: 0,
        totalDurationMs: 0,
        maximumDurationMs: 0,
        lastRunAt: undefined as string | undefined,
        lastSuccessAt: undefined as string | undefined,
        lastFailureAt: undefined as string | undefined,
        lastErrorCode: undefined as string | undefined,
    };

    observe(observation: RepositoryCandidateGarbageCollectionLogEntry): void {
        const metrics = this.#metrics;
        metrics.attempted = increment(metrics.attempted);
        metrics[observation.outcome] = increment(metrics[observation.outcome]);
        metrics.totalDurationMs = add(metrics.totalDurationMs, observation.durationMs);
        metrics.maximumDurationMs = Math.max(metrics.maximumDurationMs, observation.durationMs);
        metrics.lastRunAt = observation.timestamp;
        if (observation.outcome === "succeeded") {
            metrics.removedObjects = add(metrics.removedObjects, observation.removedObjects ?? 0);
            metrics.retainedReferencedObjects = observation.retainedReferencedObjects ?? 0;
            metrics.retainedWithinGraceObjects = observation.retainedWithinGraceObjects ?? 0;
            metrics.prunedCandidates = add(metrics.prunedCandidates, observation.prunedCandidates ?? 0);
            metrics.removedAuditRecords = add(metrics.removedAuditRecords, observation.removedAuditRecords ?? 0);
            metrics.lastSuccessAt = observation.timestamp;
        } else {
            metrics.lastFailureAt = observation.timestamp;
            metrics.lastErrorCode = observation.errorCode;
        }
    }

    snapshot(): RepositoryOperationalSnapshot["candidateGarbageCollection"] {
        return Object.fromEntries(
            Object.entries(this.#metrics).filter(([, entry]) => entry !== undefined),
        ) as RepositoryOperationalSnapshot["candidateGarbageCollection"];
    }
}

function increment(value: number): number {
    return value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;
}

function add(value: number, incrementBy: number): number {
    return Math.min(Number.MAX_SAFE_INTEGER, value + incrementBy);
}
