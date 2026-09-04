import { composeThemeSettings } from "cms-content/core/theme/integration/catalog";
import type { IntegrationThemeContribution, ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

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

    next.sources = next.sources.flatMap((source) => {
        if (isReservedIntegrationSource(source)) {
            return [];
        }
        delete source.owner;
        for (const category of source.categories) {
            category.tokens = category.tokens.filter(
                (token) =>
                    !isReservedIntegrationName(token.id, reservedNamespaces) &&
                    !isReservedIntegrationName(token.variable, reservedNamespaces),
            );
        }
        return [source];
    });
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
