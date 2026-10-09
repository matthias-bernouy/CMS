import { composeThemeSettings } from "cms-content/theme/core/integration/catalog";
import type { IntegrationThemeContribution, ThemeSettings, ThemeSource } from "cms-content/theme/interfaces/theme";

/**
 * Restore provider-owned catalogs after an untrusted editor submission.
 * Configured overrides for active integration tokens survive; stale names do not.
 */
export function reconcileSubmittedThemeSettings(
    current: ThemeSettings,
    submitted: ThemeSettings,
    contributions: readonly IntegrationThemeContribution[],
): ThemeSettings {
    const next = structuredClone(submitted);
    const contributedTokenIds = new Set(
        contributions.flatMap((contribution) =>
            contribution.categories.flatMap((category) =>
                category.tokens.map((token) => `${contribution.integrationId}-${token.id}`),
            ),
        ),
    );
    const reservedNamespaces = new Set([
        ...contributions.map(({ integrationId }) => integrationId),
        ...current.sources.flatMap((source) =>
            source.owner?.kind === "integration" ? [source.owner.integrationId] : [],
        ),
    ]);

    const contributionSources = current.sources.filter((source) => source.owner?.kind === "contribution");
    const contributionNamespaces = contributionSources.map((source) =>
        source.owner?.kind === "contribution" ? source.owner.contributionId : "",
    );
    next.sources = next.sources.flatMap((source) => {
        if (source.owner?.kind === "contribution" || source.id.startsWith("contribution-")) {
            return [];
        }
        if (isReservedIntegrationSource(source)) {
            return [];
        }
        delete source.owner;
        for (const category of source.categories) {
            category.tokens = category.tokens.filter(
                (token) =>
                    !isReservedIntegrationName(token.id, reservedNamespaces) &&
                    !isReservedIntegrationName(token.variable, reservedNamespaces) &&
                    !contributionNamespaces.some(
                        (namespace) =>
                            token.id.startsWith(`${namespace}-`) || token.variable.startsWith(`${namespace}-`),
                    ),
            );
        }
        return [source];
    });
    next.sources.push(...structuredClone(contributionSources));
    for (const theme of next.themes) {
        for (const mode of ["light", "dark"] as const) {
            for (const tokenId of Object.keys(theme.values[mode] ?? {})) {
                if (isReservedIntegrationName(tokenId, reservedNamespaces) && !contributedTokenIds.has(tokenId)) {
                    delete theme.values[mode][tokenId];
                }
            }
        }
    }
    return composeThemeSettings(next, contributions);
}

function isReservedIntegrationSource(source: ThemeSource): boolean {
    return source.owner?.kind === "integration" || source.id.startsWith("integration-");
}

function isReservedIntegrationName(value: string, namespaces: ReadonlySet<string>): boolean {
    return value.startsWith("integration-") || [...namespaces].some((namespace) => value.startsWith(`${namespace}-`));
}
