import { composeThemeSettings } from "cms-content/core/theme/integration/catalog";
import type { IntegrationThemeContribution, ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

/**
 * Restore provider-owned catalogs after an untrusted editor submission.
 * Site overrides for active integration tokens survive; stale names do not.
 */
export function reconcileSubmittedThemeSettings(
    current: ThemeSettings,
    submitted: ThemeSettings,
    contributions: readonly IntegrationThemeContribution[],
): ThemeSettings {
    const next = structuredClone(submitted);
    const currentOwners = new Map(
        current.sources
            .filter((source) => source.owner?.kind !== "integration")
            .map((source) => [source.id, source.owner]),
    );
    const contributedTokenIds = new Set(
        contributions.flatMap((contribution) =>
            contribution.categories.flatMap((category) =>
                category.tokens.map((token) => `integration-${contribution.integrationId}-${token.id}`),
            ),
        ),
    );

    next.sources = next.sources.flatMap((source) => {
        if (isReservedIntegrationSource(source)) {
            return [];
        }
        source.owner = currentOwners.get(source.id) ?? { kind: "site" };
        for (const category of source.categories) {
            category.tokens = category.tokens.filter(
                (token) => !isIntegrationName(token.id) && !isIntegrationName(token.variable),
            );
        }
        return [source];
    });
    for (const theme of next.themes) {
        for (const mode of ["light", "dark"] as const) {
            for (const tokenId of Object.keys(theme.values[mode] ?? {})) {
                if (isIntegrationName(tokenId) && !contributedTokenIds.has(tokenId)) {
                    delete theme.values[mode][tokenId];
                }
            }
        }
    }
    return composeThemeSettings(next, contributions);
}

function isReservedIntegrationSource(source: ThemeSource): boolean {
    return source.owner?.kind === "integration" || isIntegrationName(source.id);
}

function isIntegrationName(value: string): boolean {
    return value.startsWith("integration-");
}
