import type { TPage } from "@bernouy/cms-content";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

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
    admissionOutcome?: RepositoryCatalogCompatibilityOutcome;
    currentOutcome?: RepositoryCatalogCompatibilityOutcome;
    admissionReportId?: string;
    currentRevisionId?: string;
    warning?: boolean;
}>;

export type RepositoryCatalogVersionSummary = Readonly<{
    version: string;
    package?: RepositoryCatalogPackageSummary;
    compatibility?: RepositoryCatalogCompatibilitySummary;
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

export type RepositoryCatalogCompatibilityEvidence = Readonly<{
    classification: string;
    surface: string;
    code: string;
    path: string;
    message: string;
}>;

export type RepositoryCatalogCompatibilityBaseline = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type RepositoryCatalogCompatibilityReport = Readonly<{
    id: string;
    reportType: "admission" | "revision";
    outcome: RepositoryCatalogCompatibilityOutcome;
    packageDigest?: string;
    evaluator?: Readonly<{ name: string; version: string }>;
    baselines?: readonly RepositoryCatalogCompatibilityBaseline[];
    informationalBaselines?: readonly RepositoryCatalogCompatibilityBaseline[];
    createdAt?: string;
    releaseLevel?: string;
    requiredReleaseLevel?: string;
    admissible?: boolean;
    supersedes?: string;
    provenance?: Readonly<{ reason: string; evidenceIds?: readonly string[] }>;
    evidence?: readonly RepositoryCatalogCompatibilityEvidence[];
}>;

export type RepositoryCatalogCompatibilityHistory = Readonly<{
    admission: RepositoryCatalogCompatibilityReport;
    revisions?: readonly RepositoryCatalogCompatibilityReport[];
    currentRevisionId: string;
    warning?: boolean;
}>;

export type RepositoryCatalogVersionContent = Readonly<{
    version: string;
    definition: IntegrationDefinition;
    package?: RepositoryCatalogPackageSummary;
    releaseNotes?: string;
    compatibility?: RepositoryCatalogCompatibilityHistory;
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
    /** Changes whenever any rendered field or compatibility revision changes. */
    revision: string;
}>;

export interface RepositoryCatalogReader {
    listIntegrations(): Promise<RepositoryCatalogDocument<readonly RepositoryCatalogIntegrationSummary[]>>;
    getIntegration(kind: string): Promise<RepositoryCatalogDocument<RepositoryCatalogIntegrationPage> | null>;
    getVersion(kind: string, version: string): Promise<RepositoryCatalogDocument<RepositoryCatalogVersionPage> | null>;
}

export type RepositoryCatalogPageRequestContext = Readonly<{
    searchParams: Readonly<Record<string, readonly string[]>>;
    hasSearchParams: boolean;
}>;

export type RepositoryCatalogPageResolution = Readonly<{
    page: TPage;
    status?: number;
    cacheIdentity?: string;
}>;
