import type {
    IntegrationRegistryReleaseEvidenceReader,
    IntegrationVerificationBundleStore,
} from "@bernouy/cms-integration-registry";

export type RepositoryReleaseReader = IntegrationRegistryReleaseEvidenceReader;
export type RepositoryVerificationBundleReader = Pick<IntegrationVerificationBundleStore, "get">;

export type PublicRepositoryRelease = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    status: "installable" | "blocked" | "inadmissible" | "unverified";
    installable: boolean;
    freshInstallOnly: boolean;
    verificationDigest?: string;
    compatibility?: Readonly<{
        reportId: string;
        reportDigest: string;
        origin: "admission" | "legacy-backfill";
        outcome: string;
        contractAdmissible: boolean;
        releaseLevel: string;
        requiredReleaseLevel: string;
        evaluator: Readonly<{ name: string; version: string }>;
        baselines: readonly Readonly<{ kind: string; version: string; packageDigest: string }>[];
        findings: readonly Readonly<{
            findingId: string;
            classification: string;
            surface: string;
            path: string;
            code: string;
            message: string;
        }>[];
    }>;
    verification?: Readonly<{
        reportId: string;
        reportDigest: string;
        origin: "admission" | "legacy-backfill";
        outcome: string;
        runner: Readonly<{ name: string; version: string; imageDigest: string }>;
        environment: Readonly<{ digest: string; versions: Readonly<Record<string, string>> }>;
        policy: Readonly<{ name: string; version: string; snapshotDigest: string }>;
        results: readonly Readonly<{
            suiteId: string;
            source: string;
            required: boolean;
            outcome: string;
            attempts: number;
            cacheHit: boolean;
            diagnostics: readonly Readonly<{ code: string; message: string }>[];
        }>[];
    }>;
    migrations: readonly PublicRepositoryMigrationEvidence[];
    decision?: Readonly<{
        decisionId: string;
        decisionDigest: string;
        admissible: boolean;
        reasons: readonly string[];
        createdAt: string;
        policy: Readonly<{ name: string; version: string; snapshotDigest: string }>;
    }>;
}>;

export type PublicRepositoryMigrationEvidence = Readonly<{
    reportId: string;
    reportDigest: string;
    origin: "admission" | "legacy-backfill";
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
}>;
