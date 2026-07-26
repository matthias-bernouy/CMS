import type { IntegrationCompatibilityOutcome } from "@bernouy/cms-integration-registry";

export type RepositoryOperation = "publication" | "stable-promotion" | "compatibility-reevaluation";
export type RepositoryOperationOutcome = "succeeded" | "rejected" | "failed";

export type RepositoryOperationLogEntry = Readonly<{
    schema: "cms.repository.operation.v1";
    timestamp: string;
    operation: RepositoryOperation;
    operationId: string;
    outcome: RepositoryOperationOutcome;
    durationMs: number;
    kind?: string;
    version?: string;
    digest?: string;
    reportId?: string;
    reportRevisionId?: string;
    evaluatorName?: string;
    evaluatorVersion?: string;
    compatibilityOutcome?: IntegrationCompatibilityOutcome;
    errorCode?: string;
}>;

export type RepositoryOperationCounter = Readonly<{
    attempted: number;
    inFlight: number;
    succeeded: number;
    rejected: number;
    failed: number;
    totalDurationMs: number;
    maximumDurationMs: number;
}>;

export type RepositoryOperationalSnapshot = Readonly<{
    operations: Readonly<Record<RepositoryOperation, RepositoryOperationCounter>>;
    compatibility: Readonly<{
        reevaluations: number;
        warnings: number;
    }>;
    publicPackages: Readonly<{
        packagesServed: number;
        packageBytes: number;
        releaseNotesServed: number;
        releaseNotesBytes: number;
        rateLimitRejections: number;
        downloadRateLimitRejections: number;
    }>;
    recentOperations: readonly RepositoryOperationLogEntry[];
}>;

export type RepositoryOperationLogSink = (entry: RepositoryOperationLogEntry) => void;

export type RepositoryOperationIdentity = Readonly<{
    kind?: string;
    version?: string;
    digest?: string;
    reportRevisionId?: string;
}>;

export type RepositoryOperationSpan = Readonly<{
    operation: RepositoryOperation;
    operationId: string;
    startedAt: number;
    identity: RepositoryOperationIdentity;
}>;
