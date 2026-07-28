import type { RepositoryCandidateView } from "../candidates";

export type RepositoryCandidateVersionReferenceView = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type RepositoryCandidateCompatibilityView = Readonly<{
    outcome: string;
    contractAdmissible: boolean;
    releaseLevel: string;
    requiredReleaseLevel: string;
    baselines: readonly RepositoryCandidateVersionReferenceView[];
    informationalBaselines: readonly RepositoryCandidateVersionReferenceView[];
    findings: readonly Readonly<{
        findingId: string;
        classification: string;
        surface: string;
        path: string;
        code: string;
        message: string;
    }>[];
}>;

export type RepositoryCandidateObservationView = Readonly<{
    status: string;
    evidenceDigests: readonly string[];
    diagnosticCodes: readonly string[];
}>;

export type RepositoryCandidateVerificationView = Readonly<{
    state: string;
    runner: Readonly<{ name: string; version: string; imageDigest: string }>;
    environment?: Readonly<{
        digest: string;
        versions: readonly Readonly<{ name: string; version: string }>[];
    }>;
    outcome?: string;
    suites: readonly Readonly<{
        suiteId: string;
        source: string;
        applicable?: boolean;
        outcome?: string;
        durationMs?: number;
        attempts?: number;
        cacheHit?: boolean;
        diagnosticCodes: readonly string[];
    }>[];
}>;

export type RepositoryCandidateTargetObservationView = RepositoryCandidateObservationView &
    Readonly<{
        stateDigest?: string;
        schemaDigest?: string;
        dataDigest?: string;
        bindingDigest?: string;
        functionDigests: readonly Readonly<{ functionId: string; digest: string }>[];
    }>;

export type RepositoryCandidateMigrationView = Readonly<{
    migrationInputDigest: string;
    source: RepositoryCandidateVersionReferenceView;
    target: RepositoryCandidateVersionReferenceView;
    connectorKey: string;
    lineageId: string;
    sourceMigrationRevision: number;
    targetMigrationRevision: number;
    supportedSourceRange: string;
    result?: Readonly<{
        runnerDigest: string;
        environmentDigest: string;
        freshTarget: RepositoryCandidateTargetObservationView;
        migratedTarget: RepositoryCandidateTargetObservationView;
        equivalence: RepositoryCandidateObservationView & Readonly<{ equivalent?: boolean; differenceCount: number }>;
        ledger: RepositoryCandidateObservationView &
            Readonly<{
                sourceRevision?: number;
                targetRevision?: number;
                freshBaselineRecorded?: boolean;
                migrationAndLedgerAtomic?: boolean;
                checksumMismatchRejected?: boolean;
                emptyLedgerRejected?: boolean;
                migrationIds: readonly string[];
            }>;
        replay: RepositoryCandidateObservationView &
            Readonly<{
                unchanged?: boolean;
                ledgerRowsBefore?: number;
                ledgerRowsAfterFirstRun?: number;
                ledgerRowsAfterReplay?: number;
            }>;
        cutover: Readonly<{
            cmsMediated: RepositoryCandidateObservationView &
                Readonly<{ strategy: string; bindingRevisionBefore?: string; bindingRevisionAfter?: string }>;
            providerDirect: RepositoryCandidateObservationView &
                Readonly<{
                    strategy: string;
                    callbackIds: readonly string[];
                    signingSecretContinuityObserved?: boolean;
                }>;
            activation: RepositoryCandidateObservationView &
                Readonly<{
                    pointOfNoReturnCrossed?: boolean;
                    cleanupObserved?: boolean;
                }>;
        }>;
    }>;
}>;

export type RepositoryCandidateReportView = Readonly<{
    candidate: RepositoryCandidateView;
    compatibility?: RepositoryCandidateCompatibilityView;
    verification?: RepositoryCandidateVerificationView;
    migrations: readonly RepositoryCandidateMigrationView[];
}>;
