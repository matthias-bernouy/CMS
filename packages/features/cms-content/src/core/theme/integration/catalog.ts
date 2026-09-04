import { allTokens } from "cms-content/core/theme/tokens";
import { validateThemeSettings } from "cms-content/core/theme/validation";
import { ContentValidationError } from "cms-content/core/validation/errors";
import type { IntegrationThemeContribution, ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
export function integrationThemeSourceId(integrationId: string): string {
    assertIdentifier("integration id", integrationId);
    return `integration-${integrationId}`;
}
export function integrationThemeTokenId(integrationId: string, localTokenId: string): string {
    assertIdentifier("integration id", integrationId);
    assertIdentifier("integration theme token id", localTokenId);
    return `${integrationId}-${localTokenId}`;
}

export function integrationThemeVariable(integrationId: string, localTokenId: string): string {
    return integrationThemeTokenId(integrationId, localTokenId);
}

export function createIntegrationThemeSource(contribution: IntegrationThemeContribution): ThemeSource {
    assertContribution(contribution);
    const integrationId = contribution.integrationId;
    const categories = contribution.categories.map((category) => ({
        id: category.id,
        label: category.label,
        description: category.description ?? "",
        tokens: category.tokens.map((token) => {
            const id = integrationThemeTokenId(integrationId, token.id);
            return {
                id,
                variable: id,
                label: token.label,
                description: token.description ?? "",
                type: token.type,
                defaults: { ...token.defaults },
            };
        }),
    }));
    const source: ThemeSource = {
        id: integrationThemeSourceId(integrationId),
        label: contribution.label,
        supportsModes: contribution.categories.some((category) =>
            category.tokens.some((token) => token.defaults.dark !== undefined),
        ),
        categories,
        owner: {
            kind: "integration",
            integrationId,
            ...(contribution.dependencies?.length ? { dependencies: [...contribution.dependencies] } : {}),
        },
    };
    return validateThemeSettings({
        activeThemeId: "catalog",
        sources: [source],
        themes: [{ id: "catalog", name: "Catalog validation", values: { light: {}, dark: {} } }],
    }).sources[0]!;
}

export function composeThemeSettings(
    base: ThemeSettings,
    contributions: readonly IntegrationThemeContribution[],
): ThemeSettings {
    const sources = contributions.map(createIntegrationThemeSource);
    assertUniqueOwners(sources);
    return replaceIntegrationSources(
        base,
        sources,
        (source) => source.owner?.kind === "integration" || source.id.startsWith("integration-"),
    );
}

export function reconcileIntegrationTheme(
    base: ThemeSettings,
    contribution: IntegrationThemeContribution,
): ThemeSettings {
    const source = createIntegrationThemeSource(contribution);
    return replaceIntegrationSources(
        base,
        [source],
        (item) =>
            (item.owner?.kind === "integration" && item.owner.integrationId === contribution.integrationId) ||
            item.id === source.id,
    );
}

export function removeIntegrationTheme(base: ThemeSettings, integrationId: string): ThemeSettings {
    integrationThemeSourceId(integrationId);
    const sourceId = integrationThemeSourceId(integrationId);
    return replaceIntegrationSources(
        base,
        [],
        (source) =>
            (source.owner?.kind === "integration" && source.owner.integrationId === integrationId) ||
            source.id === sourceId,
    );
}

function replaceIntegrationSources(
    base: ThemeSettings,
    replacements: ThemeSource[],
    shouldReplace: (source: ThemeSource) => boolean,
): ThemeSettings {
    const next = structuredClone(base);
    migrateLegacyIntegrationValues(next, replacements);
    const replacedTokenIds = new Set(
        next.sources
            .filter(shouldReplace)
            .flatMap((source) => source.categories.flatMap((category) => category.tokens.map((token) => token.id))),
    );
    const retained = next.sources.filter((source) => {
        if (!shouldReplace(source)) {
            return true;
        }
        return false;
    });
    next.sources = [...retained, ...replacements];

    const remainingTokenIds = new Set(allTokens(next).map((token) => token.id));
    for (const theme of next.themes) {
        for (const mode of ["light", "dark"] as const) {
            const values = theme.values?.[mode];
            if (!values) {
                continue;
            }
            for (const tokenId of Object.keys(values)) {
                if (
                    (!remainingTokenIds.has(tokenId) && replacedTokenIds.has(tokenId)) ||
                    tokenId.startsWith("integration-")
                ) {
                    delete values[tokenId];
                }
            }
        }
    }
    return validateThemeSettings(next);
}

function migrateLegacyIntegrationValues(settings: ThemeSettings, replacements: ThemeSource[]): void {
    for (const source of replacements) {
        const integrationId = source.owner?.kind === "integration" ? source.owner.integrationId : undefined;
        if (!integrationId) {
            continue;
        }
        for (const token of source.categories.flatMap((category) => category.tokens)) {
            const localId = token.id.slice(integrationId.length + 1);
            const legacyId = `integration-${integrationId}-${localId}`;
            for (const theme of settings.themes) {
                for (const mode of ["light", "dark"] as const) {
                    const legacyValue = theme.values[mode]?.[legacyId];
                    if (legacyValue !== undefined && theme.values[mode]![token.id] === undefined) {
                        theme.values[mode]![token.id] = legacyValue;
                    }
                }
            }
        }
    }
}

function assertContribution(contribution: IntegrationThemeContribution): void {
    integrationThemeSourceId(contribution.integrationId);
    assertText("integration theme label", contribution.label);
    const dependencies = new Set<string>();
    for (const dependency of contribution.dependencies ?? []) {
        assertIdentifier("integration theme dependency", dependency);
        if (dependency === contribution.integrationId) {
            throw new ContentValidationError("theme", "integration theme cannot depend on itself");
        }
        assertUnique(dependencies, dependency, "integration theme dependency");
    }
    if (!Array.isArray(contribution.categories)) {
        throw new ContentValidationError("theme", "integration categories must be an array.");
    }
    const categoryIds = new Set<string>();
    const tokenIds = new Set<string>();
    for (const category of contribution.categories) {
        assertIdentifier("integration theme category id", category.id);
        assertUnique(categoryIds, category.id, "integration theme category id");
        assertText("integration theme category label", category.label);
        if (!Array.isArray(category.tokens)) {
            throw new ContentValidationError("theme", `tokens for category ${category.id} must be an array.`);
        }
        for (const token of category.tokens) {
            assertIdentifier("integration theme token id", token.id);
            assertUnique(tokenIds, token.id, "integration theme token id");
            assertText("integration theme token label", token.label);
        }
    }
}

function assertUniqueOwners(sources: ThemeSource[]): void {
    const owners = new Set<string>();
    for (const source of sources) {
        const integrationId = source.owner?.kind === "integration" ? source.owner.integrationId : "";
        assertUnique(owners, integrationId, "integration theme owner");
    }
}

function assertUnique(values: Set<string>, value: string, field: string): void {
    if (values.has(value)) {
        throw new ContentValidationError("theme", `duplicate ${field}: ${value}`);
    }
    values.add(value);
}

function assertIdentifier(field: string, value: string): void {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new ContentValidationError("theme", `${field} is invalid: ${value}`);
    }
}

function assertText(field: string, value: string): void {
    if (typeof value !== "string" || !value.trim()) {
        throw new ContentValidationError("theme", `${field} must not be empty.`);
    }
}
