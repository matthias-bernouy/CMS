export const MIGRATION_JOB_RESULT_SCHEMA = "cms.integration.migration-job-result.v1" as const;

export type MigrationRawObservationStatus =
    | "passed"
    | "failed"
    | "not-supported"
    | "not-applicable"
    | "infrastructure-failure";

export type MigrationRawObservationEvidenceV1 = Readonly<{
    status: MigrationRawObservationStatus;
    evidenceDigests: readonly string[];
    diagnosticCodes: readonly string[];
}>;

export type MigrationTargetObservationV1 = MigrationRawObservationEvidenceV1 &
    Readonly<{
        stateDigest?: string;
        schemaDigest?: string;
        dataDigest?: string;
        functionDigests: readonly Readonly<{ functionId: string; digest: string }>[];
        bindingDigest?: string;
    }>;

export type MigrationEquivalenceObservationV1 = MigrationRawObservationEvidenceV1 &
    Readonly<{
        freshStateDigest?: string;
        migratedStateDigest?: string;
        equivalent?: boolean;
        differences: readonly Readonly<{
            surface: "schema" | "data" | "functions" | "bindings" | "ledger" | "behavior";
            path: string;
            freshDigest?: string;
            migratedDigest?: string;
        }>[];
    }>;

export type MigrationLedgerObservationV1 = MigrationRawObservationEvidenceV1 &
    Readonly<{
        sourceRevision?: number;
        targetRevision?: number;
        freshBaselineRecorded?: boolean;
        migrationAndLedgerAtomic?: boolean;
        checksumMismatchRejected?: boolean;
        emptyLedgerRejected?: boolean;
        rows: readonly Readonly<{
            migrationId: string;
            checksum: string;
            revision: number;
            attemptId: string;
            sourcePackageDigest?: string;
            targetPackageDigest?: string;
        }>[];
    }>;

export type MigrationReplayObservationV1 = MigrationRawObservationEvidenceV1 &
    Readonly<{
        firstStateDigest?: string;
        replayStateDigest?: string;
        unchanged?: boolean;
        ledgerRowsBefore?: number;
        ledgerRowsAfterFirstRun?: number;
        ledgerRowsAfterReplay?: number;
    }>;

export type MigrationFailureObservationV1 = MigrationRawObservationEvidenceV1 &
    Readonly<{
        boundary: string;
        injected: boolean;
        recovery: "safe-retry" | "safe-resume" | "operator-required" | "not-observed";
        recoveredStateDigest?: string;
    }>;

export type MigrationResumptionObservationV1 = MigrationRawObservationEvidenceV1 &
    Readonly<{
        boundary: string;
        attempts: number;
        staleFenceRejected?: boolean;
        resumedStateDigest?: string;
        expectedStateDigest?: string;
        matched?: boolean;
    }>;

export type MigrationCutoverObservationV1 = Readonly<{
    cmsMediated: MigrationRawObservationEvidenceV1 &
        Readonly<{
            strategy: "binding-switch" | "not-applicable";
            bindingRevisionBefore?: string;
            bindingRevisionAfter?: string;
        }>;
    providerDirect: MigrationRawObservationEvidenceV1 &
        Readonly<{
            strategy: "expand-in-code" | "journalled-provider-switch" | "not-applicable";
            callbackIds: readonly string[];
            signingSecretContinuityObserved?: boolean;
            providerStateDigest?: string;
        }>;
    activation: MigrationRawObservationEvidenceV1 &
        Readonly<{
            activePackageDigest?: string;
            activeBindingDigest?: string;
            pointOfNoReturnCrossed?: boolean;
            cleanupObserved?: boolean;
        }>;
}>;

export type MigrationJobResultV1 = Readonly<{
    schema: typeof MIGRATION_JOB_RESULT_SCHEMA;
    jobId: string;
    attemptId: string;
    fencingToken: number;
    migrationInputDigest: string;
    runnerDigest: string;
    environmentDigest: string;
    observations: Readonly<{
        freshTarget: MigrationTargetObservationV1;
        migratedTarget: MigrationTargetObservationV1;
        equivalence: MigrationEquivalenceObservationV1;
        ledger: MigrationLedgerObservationV1;
        replay: MigrationReplayObservationV1;
        failureInjections: readonly MigrationFailureObservationV1[];
        resumptions: readonly MigrationResumptionObservationV1[];
        cutover: MigrationCutoverObservationV1;
    }>;
}>;

export type MigrationJobAttemptIdentityV1 = Readonly<{
    jobId: string;
    attemptId: string;
    fencingToken: number;
}>;

export type IdentifiedMigrationJobResultV1 = Readonly<{
    result: MigrationJobResultV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
