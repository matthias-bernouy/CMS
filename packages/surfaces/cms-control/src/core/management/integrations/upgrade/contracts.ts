export type IntegrationUpgradeMigrationEvidence = Readonly<{
    reportId: string;
    reportDigest: string;
    source: Readonly<{ kind: string; version: string; packageDigest: string }>;
    supportedSourceRange: string;
    connectorKey: string;
    lineageId: string;
    migrationRevision: number;
    outcome: string;
    runner: Readonly<{ name: string; version: string; imageDigest: string }>;
    environmentDigest: string;
    cutover: Readonly<{ cmsMediated: string; providerDirect: string }>;
    rollback: string;
    pointOfNoReturn: string;
    delayedCleanupVerified: boolean;
}>;

export type IntegrationUpgradeReleaseEvidence = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    status: string;
    installable: boolean;
    freshInstallOnly: boolean;
    compatibility?: Readonly<{ releaseLevel: string }>;
    decision?: Readonly<{ admissible: boolean }>;
    migrations: readonly IntegrationUpgradeMigrationEvidence[];
}>;

export interface IntegrationUpgradeReleaseReader {
    get(kind: string, version: string): Promise<IntegrationUpgradeReleaseEvidence | null>;
}

export type IntegrationUpgradeTarget = Readonly<{
    version: string;
    eligible: boolean;
    evidence: "composite" | "legacy-index";
    freshInstallOnly: boolean;
    releaseLevel?: string;
    packageDigest?: string;
    reasons: readonly string[];
    migrations: readonly Readonly<{
        connectorKey: string;
        lineageId: string;
        supportedSourceRange: string;
        reportId: string;
        reportDigest: string;
        runner: string;
        environmentDigest: string;
        cmsMediatedCutover: string;
        providerDirectCutover: string;
        rollback: string;
        pointOfNoReturn: string;
        cmsDrainSeconds?: number;
        providerDrainSeconds?: number;
    }>[];
}>;
