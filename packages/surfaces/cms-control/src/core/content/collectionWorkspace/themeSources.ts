import type { CollectionIntegrationDefinition, IntegrationInstallation } from "@bernouy/cms-integrations";
import type { LibraryCollection } from "cms-control/core/content/blocLibrary/types";

const DEFAULT_THEME_PROVIDER_KIND = "ulvia";

export type CollectionThemeSource = {
    definition: CollectionIntegrationDefinition;
    integrationId: string;
    label: string;
    inherited: boolean;
};

export type CollectionThemeDependency = { kind: string; versionRange?: string };

export type ResolvedCollectionThemeSources = {
    own?: CollectionIntegrationDefinition;
    dependencies: CollectionThemeDependency[];
    sources: CollectionThemeSource[];
};

export function resolveCollectionThemeSources(
    collection: LibraryCollection,
    installations: readonly IntegrationInstallation[],
): ResolvedCollectionThemeSources {
    const own = collectionDefinition(collection, installations);
    const dependencies = declaredDependencies(own);
    const sources: CollectionThemeSource[] = [];
    const visited = new Set<string>();
    const visit = (kind: string): void => {
        if (visited.has(kind)) {
            return;
        }
        visited.add(kind);
        const installation = installations.find(({ definitionSnapshot }) => definitionSnapshot?.kind === kind);
        const definition = asCollectionDefinition(installation?.definitionSnapshot);
        if (!definition || !installation) {
            return;
        }
        for (const dependency of definition.theme?.dependencies ?? []) {
            visit(dependency.kind);
        }
        if (definition.theme?.categories.length) {
            sources.push({
                definition,
                integrationId: installation.id,
                label: installation.label,
                inherited: true,
            });
        }
    };
    for (const dependency of dependencies) {
        visit(dependency.kind);
    }
    if (own?.theme?.categories.length) {
        sources.push({
            definition: own,
            integrationId: collection.installationId ?? own.kind,
            label: own.label,
            inherited: false,
        });
    }
    return { ...(own ? { own } : {}), dependencies, sources };
}

export function collectionThemeProviderLabel(
    resolved: ResolvedCollectionThemeSources,
    collection: LibraryCollection,
): string {
    if (!resolved.dependencies.length) {
        return resolved.own?.label || collection.name;
    }
    return (
        resolved.sources
            .filter(({ inherited }) => inherited)
            .map(({ label }) => label)
            .join(", ") || resolved.dependencies.map(({ kind }) => readableKind(kind)).join(", ")
    );
}

function declaredDependencies(own: CollectionIntegrationDefinition | undefined): CollectionThemeDependency[] {
    if (own?.theme) {
        return own.theme.dependencies ?? [];
    }
    return own?.kind === DEFAULT_THEME_PROVIDER_KIND ? [] : [{ kind: DEFAULT_THEME_PROVIDER_KIND }];
}

function collectionDefinition(
    collection: LibraryCollection,
    installations: readonly IntegrationInstallation[],
): CollectionIntegrationDefinition | undefined {
    return asCollectionDefinition(installations.find(({ id }) => id === collection.installationId)?.definitionSnapshot);
}

function asCollectionDefinition(
    definition: IntegrationInstallation["definitionSnapshot"],
): CollectionIntegrationDefinition | undefined {
    return definition?.schema === "cms.integration.definition.v2" && definition.type === "collection"
        ? definition
        : undefined;
}

function readableKind(value: string): string {
    return value
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" ");
}
