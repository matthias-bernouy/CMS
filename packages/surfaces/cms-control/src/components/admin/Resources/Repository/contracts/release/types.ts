export type RepositoryReleaseFindingView = Readonly<{
    findingId: string;
    classification: string;
    surface: string;
    path: string;
    code: string;
    message: string;
}>;

export type RepositoryReleaseVerificationView = Readonly<{
    reportId: string;
    reportDigest: string;
    origin: string;
    createdAt: string;
    outcome: string;
    runner: Readonly<{ name: string; version: string; imageDigest: string }>;
    environment: Readonly<{ digest: string; versions: Readonly<Record<string, string>> }>;
    activeContracts: readonly Readonly<{
        contractId: string;
        ownerVersion: string;
        digest: string;
    }>[];
    results: readonly Readonly<{
        suiteId: string;
        source: string;
        required: boolean;
        outcome: string;
        durationMs: number;
        attempts: number;
        cacheHit: boolean;
        diagnostics: readonly Readonly<{ code: string; message: string }>[];
    }>[];
}>;

export type RepositoryReleaseMigrationView = Readonly<{
    reportId: string;
    reportDigest: string;
    origin: string;
    source: Readonly<{ kind: string; version: string; packageDigest: string }>;
    supportedSourceRange: string;
    connectorKey: string;
    lineageId: string;
    migrationRevision: number;
    outcome: string;
    runner: Readonly<{ name: string; version: string; imageDigest: string }>;
    environmentDigest: string;
    checks: Readonly<Record<string, Readonly<{ outcome: string; evidenceDigest?: string }>>>;
    cutover: Readonly<{ cmsMediated: string; providerDirect: string }>;
    rollback: string;
    pointOfNoReturn: string;
    delayedCleanupVerified: boolean;
    operationalEvidence?: Readonly<{
        downtime: Readonly<{
            status: string;
            observedSeconds?: number;
            evidenceDigest?: string;
        }>;
        drain: Readonly<{
            cmsMediatedSeconds?: number;
            providerDirectSeconds?: number;
        }>;
        rollback: Readonly<{
            capability: string;
            verified: boolean;
            evidenceDigest?: string;
        }>;
        pointOfNoReturn: Readonly<{
            phase: string;
            observation: string;
            evidenceDigest?: string;
        }>;
        cleanup: Readonly<{
            delaySeconds?: number;
            observed: boolean;
            evidenceDigest?: string;
        }>;
    }>;
}>;

export type RepositoryReleaseView = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest?: string;
    status: string;
    installable: boolean;
    freshInstallOnly: boolean;
    compatibility?: Readonly<{
        reportId: string;
        reportDigest: string;
        origin: string;
        outcome: string;
        contractAdmissible: boolean;
        releaseLevel: string;
        requiredReleaseLevel: string;
        findings: readonly RepositoryReleaseFindingView[];
    }>;
    verification?: RepositoryReleaseVerificationView;
    migrations: readonly RepositoryReleaseMigrationView[];
    decision?: Readonly<{
        decisionId: string;
        decisionDigest: string;
        admissible: boolean;
        reasons: readonly string[];
        createdAt: string;
    }>;
}>;
