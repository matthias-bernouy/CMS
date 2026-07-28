import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { PublicRepositoryRelease } from "../compatibility/releaseContracts";

export type RepositoryCatalogCompatibilityOutcome =
    | "compatible"
    | "breaking"
    | "unknown"
    | "invalid"
    | "not-applicable";

export type RepositoryCatalogPackageSummary = Readonly<{
    digest?: string;
    canonicalBytes?: number;
}>;

export type RepositoryCatalogArtifactSummary = Readonly<{
    type: string;
    count: number;
}>;

export type RepositoryCatalogCompatibilitySummary = Readonly<{
    rootOutcome?: RepositoryCatalogCompatibilityOutcome;
    currentOutcome?: RepositoryCatalogCompatibilityOutcome;
    rootReportId?: string;
    currentReportId?: string;
    warning?: boolean;
}>;

export type RepositoryCatalogVersionSummary = Readonly<{
    version: string;
    package?: RepositoryCatalogPackageSummary;
    compatibility?: RepositoryCatalogCompatibilitySummary;
    release?: Pick<PublicRepositoryRelease, "status" | "installable" | "freshInstallOnly" | "verificationDigest"> &
        Readonly<{
            verificationOrigin?: "admission" | "legacy-backfill";
            verificationOutcome?: string;
        }>;
}>;

export type RepositoryCatalogIntegrationSummary = Readonly<{
    kind: string;
    label: string;
    description?: string;
    category?: string;
    stable?: string;
    latest?: string;
    technicalProviders?: readonly string[];
    artifacts?: readonly RepositoryCatalogArtifactSummary[];
    compatibility?: RepositoryCatalogCompatibilitySummary;
    versions: readonly RepositoryCatalogVersionSummary[];
}>;

export type RepositoryCatalogCompatibilityFinding = Readonly<{
    findingId: string;
    classification: string;
    surface: string;
    code: string;
    message: string;
}>;

export type RepositoryCatalogCompatibilityBaseline = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

type RepositoryCatalogCompatibilityReportBase = Readonly<{
    reportId: string;
    origin: "admission" | "legacy-backfill";
    outcome: RepositoryCatalogCompatibilityOutcome;
    packageDigest: string;
    evaluator: Readonly<{ name: string; version: string }>;
    baselines: readonly RepositoryCatalogCompatibilityBaseline[];
    informationalBaselines: readonly RepositoryCatalogCompatibilityBaseline[];
    createdAt: string;
    releaseLevel: string;
    requiredReleaseLevel: string;
    contractAdmissible: boolean;
    noBaselineReason?: "new-kind" | "new-major";
    provenance: Readonly<{ reason: string; evidenceIds?: readonly string[] }>;
    findings: readonly RepositoryCatalogCompatibilityFinding[];
}>;

export type RepositoryCatalogCompatibilityReport = RepositoryCatalogCompatibilityReportBase &
    (Readonly<{ revisionType: "root" }> | Readonly<{ revisionType: "revision"; supersedes: string }>);

export type RepositoryCatalogCompatibilityHistory = Readonly<{
    root: RepositoryCatalogCompatibilityReport;
    revisions?: readonly RepositoryCatalogCompatibilityReport[];
    currentReportId: string;
    warning?: boolean;
}>;

export type RepositoryCatalogVersionContent = Readonly<{
    version: string;
    definition: IntegrationDefinition;
    package?: RepositoryCatalogPackageSummary;
    releaseNotes?: string;
    compatibility?: RepositoryCatalogCompatibilityHistory;
    release?: PublicRepositoryRelease;
}>;

export type RepositoryCatalogIntegrationPage = Readonly<{
    integration: RepositoryCatalogIntegrationSummary;
    featuredVersion?: RepositoryCatalogVersionContent;
}>;

export type RepositoryCatalogVersionPage = Readonly<{
    integration: RepositoryCatalogIntegrationSummary;
    version: RepositoryCatalogVersionContent;
}>;

export type RepositoryCatalogDocument<T> = Readonly<{
    value: T;
    /** Changes whenever any projected field or compatibility revision changes. */
    revision: string;
}>;

export interface RepositoryCatalogReader {
    listIntegrations(): Promise<RepositoryCatalogDocument<readonly RepositoryCatalogIntegrationSummary[]>>;
    getIntegration(kind: string): Promise<RepositoryCatalogDocument<RepositoryCatalogIntegrationPage> | null>;
    getVersion(kind: string, version: string): Promise<RepositoryCatalogDocument<RepositoryCatalogVersionPage> | null>;
}

export type RepositoryCatalogQueryContext = Readonly<{
    searchParams: Readonly<Record<string, readonly string[]>>;
}>;
