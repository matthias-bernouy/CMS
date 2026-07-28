import type { IntegrationDependency } from "@bernouy/cms-integrations";
import type { PublicRepositoryRelease } from "../../compatibility/releaseContracts";
import type {
    RepositoryCatalogArtifactSummary,
    RepositoryCatalogCompatibilityHistory,
    RepositoryCatalogCompatibilityOutcome,
    RepositoryCatalogCompatibilityReport,
} from "../contracts";

export const REPOSITORY_CATALOG_API_SCHEMA = "cms.repository.catalog.v1" as const;

export type RepositoryCatalogApiFacet = Readonly<{ value: string; label: string }>;
export type RepositoryCatalogApiProvider = Readonly<{ name: string; label: string }>;
export type RepositoryCatalogApiArtifact = RepositoryCatalogArtifactSummary & Readonly<{ label: string }>;
export type RepositoryCatalogApiCompatibilityHistory = RepositoryCatalogCompatibilityHistory &
    Readonly<{ current: RepositoryCatalogCompatibilityReport }>;

export type RepositoryCatalogApiVersionItem = Readonly<{
    version: string;
    isStable: boolean;
    isLatest: boolean;
    compatibilityOutcome: RepositoryCatalogCompatibilityOutcome | "unreported";
    compatibilityLabel: string;
    compatibilityWarning: boolean;
    packageDigest?: string;
    packageBytes?: number;
    packageSize: string;
    detailsUrl: string;
    downloadUrl: string;
    releaseStatus?: string;
    installable?: boolean;
    freshInstallOnly?: boolean;
    verificationOrigin?: string;
    verificationOutcome?: string;
}>;

export type RepositoryCatalogApiIntegration = Readonly<{
    kind: string;
    label: string;
    description?: string;
    category?: string;
    stable?: string;
    latest?: string;
    detailsUrl: string;
    compatibilityOutcome: RepositoryCatalogCompatibilityOutcome | "unreported";
    compatibilityLabel: string;
    compatibilityWarning: boolean;
    technicalProviders: readonly RepositoryCatalogApiProvider[];
    artifacts: readonly RepositoryCatalogApiArtifact[];
    versions: readonly RepositoryCatalogApiVersionItem[];
}>;

type PublicVerification = NonNullable<PublicRepositoryRelease["verification"]>;
type PublicMigration = PublicRepositoryRelease["migrations"][number];

export type RepositoryCatalogApiRelease = Omit<PublicRepositoryRelease, "verification" | "migrations"> &
    Readonly<{
        verificationBundleUrl?: string;
        verification?: Omit<PublicVerification, "environment"> &
            Readonly<{
                environment: Omit<PublicVerification["environment"], "versions"> &
                    Readonly<{ versions: readonly Readonly<{ name: string; version: string }>[] }>;
            }>;
        migrations: readonly (Omit<PublicMigration, "checks"> &
            Readonly<{
                checks: readonly Readonly<{ name: string; outcome: string; evidenceDigest?: string }>[];
            }>)[];
    }>;

export type RepositoryCatalogApiVersionDetail = Readonly<{
    version: string;
    isStable: boolean;
    isLatest: boolean;
    compatibilityOutcome: RepositoryCatalogCompatibilityOutcome | "unreported";
    compatibilityLabel: string;
    compatibilityWarning: boolean;
    integrationUrl: string;
    detailsUrl: string;
    downloadUrl: string;
    releaseNotesDownloadUrl?: string;
    packageDigest?: string;
    packageBytes?: number;
    packageSize: string;
    providers: readonly RepositoryCatalogApiProvider[];
    artifacts: readonly RepositoryCatalogApiArtifact[];
    dependencies: readonly (IntegrationDependency & Readonly<{ integrationUrl: string }>)[];
    instructions: readonly Readonly<{ title: string; html: string }>[];
    releaseNotesHtml?: string;
    compatibility?: RepositoryCatalogApiCompatibilityHistory;
    release?: RepositoryCatalogApiRelease;
}>;

type RepositoryCatalogApiBase = Readonly<{
    schema: typeof REPOSITORY_CATALOG_API_SCHEMA;
    revision: string;
}>;

export type RepositoryCatalogApiList = RepositoryCatalogApiBase &
    Readonly<{
        view: "list";
        q: string;
        category: string;
        provider: string;
        compatibility: string;
        count: number;
        total: number;
        categories: readonly RepositoryCatalogApiFacet[];
        providers: readonly RepositoryCatalogApiFacet[];
        compatibilityOutcomes: readonly RepositoryCatalogApiFacet[];
        integrations: readonly RepositoryCatalogApiIntegration[];
    }>;

export type RepositoryCatalogApiIntegrationView = RepositoryCatalogApiBase &
    RepositoryCatalogApiIntegration &
    Readonly<{ view: "integration"; featuredVersion?: RepositoryCatalogApiVersionDetail }>;

export type RepositoryCatalogApiVersionView = RepositoryCatalogApiBase &
    RepositoryCatalogApiIntegration &
    RepositoryCatalogApiVersionDetail &
    Readonly<{ view: "version" }>;

export type RepositoryCatalogApiResponse =
    | RepositoryCatalogApiList
    | RepositoryCatalogApiIntegrationView
    | RepositoryCatalogApiVersionView;
