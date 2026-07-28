import type { IntegrationDefinition, IntegrationDependency } from "@bernouy/cms-integrations";
import type {
    RepositoryCatalogArtifactSummary,
    RepositoryCatalogCompatibilityHistory,
    RepositoryCatalogCompatibilityOutcome,
    RepositoryCatalogIntegrationSummary,
    RepositoryCatalogPackageSummary,
    RepositoryCatalogVersionContent,
    RepositoryCatalogVersionSummary,
} from "../contracts";
import type { PublicRepositoryRelease } from "../../compatibility/releaseContracts";

export type RepositoryCatalogFilters = Readonly<{
    query: string;
    category: string;
    provider: string;
    compatibility: string;
}>;

export type RepositoryCatalogListView = Readonly<{
    filters: RepositoryCatalogFilters;
    categories: readonly string[];
    providers: readonly string[];
    compatibilityOutcomes: readonly string[];
    items: readonly RepositoryCatalogIntegrationSummary[];
    total: number;
}>;

export type RepositoryCatalogVersionView = Readonly<{
    integration: RepositoryCatalogIntegrationSummary;
    version: string;
    definition: IntegrationDefinition;
    package?: RepositoryCatalogPackageSummary;
    releaseNotes?: string;
    compatibility?: RepositoryCatalogCompatibilityHistory;
    release?: PublicRepositoryRelease;
    providers: readonly string[];
    artifacts: readonly RepositoryCatalogArtifactSummary[];
    dependencies: readonly IntegrationDependency[];
    stable: boolean;
    latest: boolean;
}>;

export function compatibilityOutcome(
    summary: RepositoryCatalogIntegrationSummary | RepositoryCatalogVersionSummary,
): RepositoryCatalogCompatibilityOutcome | "unreported" {
    const direct = summary.compatibility?.currentOutcome ?? summary.compatibility?.rootOutcome;
    if (direct || !("versions" in summary)) {
        return direct ?? "unreported";
    }
    const channel = summary.stable ?? summary.latest;
    const version = summary.versions.find((entry) => entry.version === channel);
    return version?.compatibility?.currentOutcome ?? version?.compatibility?.rootOutcome ?? "unreported";
}

export function versionContentView(
    integration: RepositoryCatalogIntegrationSummary,
    content: RepositoryCatalogVersionContent,
): RepositoryCatalogVersionView {
    return {
        integration,
        version: content.version,
        definition: content.definition,
        package: content.package,
        releaseNotes: content.releaseNotes,
        compatibility: content.compatibility,
        release: content.release,
        providers: collectTechnicalProviders(content.definition, integration.technicalProviders),
        artifacts: collectArtifacts(content.definition, integration.artifacts),
        dependencies: content.definition.dependencies ?? [],
        stable: integration.stable === content.version,
        latest: integration.latest === content.version,
    };
}

function collectTechnicalProviders(
    definition: IntegrationDefinition,
    fallback: readonly string[] | undefined,
): readonly string[] {
    const values = [
        ...(definition.connectors ?? []).map(({ provider }) => provider),
        ...(definition.provisions ?? []).map(({ provider }) => provider),
    ];
    return [...new Set(values.length > 0 ? values : (fallback ?? []))].sort((left, right) => left.localeCompare(right));
}

function collectArtifacts(
    definition: IntegrationDefinition,
    fallback: readonly RepositoryCatalogArtifactSummary[] | undefined,
): readonly RepositoryCatalogArtifactSummary[] {
    const counts = new Map<string, number>();
    for (const artifact of definition.artifacts ?? []) {
        counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1);
    }
    if (counts.size === 0) {
        return [...(fallback ?? [])];
    }
    return [...counts]
        .map(([type, count]) => ({ type, count }))
        .sort((left, right) => left.type.localeCompare(right.type));
}
