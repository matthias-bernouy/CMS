const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type RepositoryCandidateRuntimeConfig = Readonly<{
    candidateTtlMs: number;
    workerLeaseDurationMs: number;
    candidateGarbageCollectionIntervalMs: number;
    candidateObjectGracePeriodMs: number;
    candidateTerminalRetentionMs: number;
    candidatePruneAuditRetentionMs: number;
}>;

export function readRepositoryCandidateRuntimeConfig(
    source: Record<string, string | undefined>,
): RepositoryCandidateRuntimeConfig {
    return Object.freeze({
        candidateTtlMs: boundedInteger(
            source.CMS_REPOSITORY_CANDIDATE_TTL_MS,
            "CMS_REPOSITORY_CANDIDATE_TTL_MS",
            DAY_MS,
            MINUTE_MS,
            30 * DAY_MS,
        ),
        workerLeaseDurationMs: boundedInteger(
            source.CMS_REPOSITORY_WORKER_LEASE_DURATION_MS,
            "CMS_REPOSITORY_WORKER_LEASE_DURATION_MS",
            5 * MINUTE_MS,
            10_000,
            HOUR_MS,
        ),
        candidateGarbageCollectionIntervalMs: boundedInteger(
            source.CMS_REPOSITORY_CANDIDATE_GC_INTERVAL_MS,
            "CMS_REPOSITORY_CANDIDATE_GC_INTERVAL_MS",
            6 * HOUR_MS,
            MINUTE_MS,
            7 * DAY_MS,
        ),
        candidateObjectGracePeriodMs: boundedInteger(
            source.CMS_REPOSITORY_CANDIDATE_OBJECT_GRACE_MS,
            "CMS_REPOSITORY_CANDIDATE_OBJECT_GRACE_MS",
            DAY_MS,
            HOUR_MS,
            30 * DAY_MS,
        ),
        candidateTerminalRetentionMs: boundedInteger(
            source.CMS_REPOSITORY_CANDIDATE_TERMINAL_RETENTION_MS,
            "CMS_REPOSITORY_CANDIDATE_TERMINAL_RETENTION_MS",
            7 * DAY_MS,
            DAY_MS,
            365 * DAY_MS,
        ),
        candidatePruneAuditRetentionMs: boundedInteger(
            source.CMS_REPOSITORY_CANDIDATE_PRUNE_AUDIT_RETENTION_MS,
            "CMS_REPOSITORY_CANDIDATE_PRUNE_AUDIT_RETENTION_MS",
            30 * DAY_MS,
            7 * DAY_MS,
            365 * DAY_MS,
        ),
    });
}

function boundedInteger(
    raw: string | undefined,
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^[0-9]+$/u.test(raw)) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}
