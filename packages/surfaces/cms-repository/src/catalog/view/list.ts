import type { RepositoryCatalogPageRequestContext } from "../contracts";
import type { RepositoryCatalogIntegrationSummary } from "../contracts";
import { compatibilityOutcome, type RepositoryCatalogFilters, type RepositoryCatalogListView } from "./models";

const MAX_FILTER_CHARACTERS = 128;

export function buildRepositoryCatalogListView(
    integrations: readonly RepositoryCatalogIntegrationSummary[],
    context: RepositoryCatalogPageRequestContext,
): RepositoryCatalogListView {
    const filters = filtersFromContext(context);
    const sorted = [...integrations].sort(
        (left, right) => left.label.localeCompare(right.label) || left.kind.localeCompare(right.kind),
    );
    return {
        filters,
        categories: uniqueSorted(sorted.map(({ category }) => category).filter(isText)),
        providers: uniqueSorted(sorted.flatMap(({ technicalProviders }) => technicalProviders ?? [])),
        compatibilityOutcomes: uniqueSorted(sorted.map(compatibilityOutcome)),
        items: sorted.filter((integration) => matches(integration, filters)),
        total: sorted.length,
    };
}

function filtersFromContext(context: RepositoryCatalogPageRequestContext): RepositoryCatalogFilters {
    return {
        query: firstQueryValue(context, "q"),
        category: firstQueryValue(context, "category"),
        provider: firstQueryValue(context, "provider"),
        compatibility: firstQueryValue(context, "compatibility"),
    };
}

function firstQueryValue(context: RepositoryCatalogPageRequestContext, name: string): string {
    return (context.searchParams[name]?.[0] ?? "").trim().slice(0, MAX_FILTER_CHARACTERS);
}

function matches(integration: RepositoryCatalogIntegrationSummary, filters: RepositoryCatalogFilters): boolean {
    if (filters.category && normalized(integration.category ?? "") !== normalized(filters.category)) {
        return false;
    }
    if (
        filters.provider &&
        !(integration.technicalProviders ?? []).some(
            (provider) => normalized(provider) === normalized(filters.provider),
        )
    ) {
        return false;
    }
    if (filters.compatibility && compatibilityOutcome(integration) !== filters.compatibility) {
        return false;
    }
    if (!filters.query) {
        return true;
    }
    return normalized(
        [
            integration.kind,
            integration.label,
            integration.description ?? "",
            integration.category ?? "",
            ...(integration.technicalProviders ?? []),
        ].join(" "),
    ).includes(normalized(filters.query));
}

function normalized(value: string): string {
    return value.toLocaleLowerCase("en-US");
}

function uniqueSorted(values: readonly string[]): readonly string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isText(value: string | undefined): value is string {
    return Boolean(value);
}
