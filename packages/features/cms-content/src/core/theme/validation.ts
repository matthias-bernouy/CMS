import { ContentValidationError } from "cms-content/core/validation/errors";
import type { ThemeSettings, ThemeSource, ThemeToken } from "cms-content/interfaces/theme";

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
const TOKEN_TYPES = new Set(["color", "font-family", "length", "number", "shadow", "value"]);

export function validateThemeSettings(settings: ThemeSettings): ThemeSettings {
    if (!settings || typeof settings !== "object") {
        throw new ContentValidationError("theme", "expected an object.");
    }
    if (!Array.isArray(settings.sources) || !Array.isArray(settings.themes)) {
        throw new ContentValidationError("theme", "sources and themes must be arrays.");
    }

    const tokenIds = new Set<string>();
    const variables = new Set<string>();
    const sourceIds = new Set<string>();
    const integrationOwners = new Set<string>();
    const tokenSources = new Map<string, ThemeSource>();
    const variableSources = new Map<string, ThemeSource>();
    for (const source of settings.sources) {
        validateSource(source, sourceIds, integrationOwners);
        for (const token of source.categories.flatMap((category) => category.tokens)) {
            validateToken(source, token);
            assertUnique(tokenIds, token.id, "token id");
            assertUnique(variables, token.variable, "CSS variable");
            tokenSources.set(token.id, source);
            variableSources.set(token.variable, source);
        }
    }
    for (const source of settings.sources) {
        for (const token of source.categories.flatMap((category) => category.tokens)) {
            for (const value of Object.values(token.defaults ?? {})) {
                assertIntegrationIsolation(source, value, variableSources);
            }
        }
    }

    const themeIds = new Set<string>();
    for (const theme of settings.themes) {
        assertIdentifier("theme id", theme.id);
        assertString("theme name", theme.name);
        assertUnique(themeIds, theme.id, "theme id");
        if (!theme.values || typeof theme.values !== "object") {
            throw new ContentValidationError("theme", `values are missing for theme: ${theme.id}`);
        }
        for (const mode of ["light", "dark"] as const) {
            const values = theme.values[mode];
            if (!values || typeof values !== "object" || Array.isArray(values)) {
                throw new ContentValidationError("theme", `${mode} values must be an object.`);
            }
            for (const [tokenId, value] of Object.entries(values)) {
                if (!tokenIds.has(tokenId)) {
                    throw new ContentValidationError("theme", `unknown token: ${tokenId}`);
                }
                assertCssValue(tokenId, value);
                assertIntegrationIsolation(tokenSources.get(tokenId), value, variableSources);
            }
        }
    }
    if (!themeIds.has(settings.activeThemeId)) {
        throw new ContentValidationError("theme", "active theme does not exist.");
    }
    return structuredClone(settings);
}

function assertIntegrationIsolation(
    source: ThemeSource | undefined,
    value: string,
    variableSources: Map<string, ThemeSource>,
): void {
    if (source?.owner?.kind !== "integration") {
        return;
    }
    for (const match of value.matchAll(/var\s*\(\s*--([a-z][a-z0-9-]*)/gi)) {
        const target = variableSources.get(match[1]!.toLowerCase());
        if (
            target?.owner?.kind === "integration" &&
            target.owner.integrationId !== source.owner.integrationId &&
            !source.owner.dependencies?.includes(target.owner.integrationId)
        ) {
            throw new ContentValidationError(
                "theme",
                `integration token cannot reference another integration: ${source.owner.integrationId}`,
            );
        }
    }
}

function validateSource(source: ThemeSource, sourceIds: Set<string>, integrationOwners: Set<string>): void {
    assertIdentifier("theme source id", source.id);
    assertString("theme source label", source.label);
    assertUnique(sourceIds, source.id, "source id");
    if (typeof source.supportsModes !== "boolean" || !Array.isArray(source.categories)) {
        throw new ContentValidationError("theme", `invalid source catalog: ${source.id}`);
    }
    const owner = source.owner;
    if (owner?.kind === "integration") {
        assertIdentifier("integration id", owner.integrationId);
        assertUnique(integrationOwners, owner.integrationId, "integration owner");
        const dependencies = new Set<string>();
        for (const dependency of owner.dependencies ?? []) {
            assertIdentifier("integration theme dependency", dependency);
            if (dependency === owner.integrationId) {
                throw new ContentValidationError("theme", `integration theme cannot depend on itself: ${source.id}`);
            }
            assertUnique(dependencies, dependency, "integration theme dependency");
        }
        if (source.id !== `integration-${owner.integrationId}`) {
            throw new ContentValidationError(
                "theme",
                `source id is not derived for integration: ${owner.integrationId}`,
            );
        }
    } else if (owner) {
        throw new ContentValidationError("theme", `invalid owner for source: ${source.id}`);
    } else if (source.id.startsWith("integration-")) {
        throw new ContentValidationError("theme", `reserved integration source id: ${source.id}`);
    }

    const categoryIds = new Set<string>();
    for (const category of source.categories) {
        assertIdentifier("theme category id", category.id);
        assertString("theme category label", category.label);
        if (typeof category.description !== "string" || !Array.isArray(category.tokens)) {
            throw new ContentValidationError("theme", `invalid category: ${category.id}`);
        }
        assertUnique(categoryIds, category.id, "category id");
    }
}

function validateToken(source: ThemeSource, token: ThemeToken): void {
    assertIdentifier("theme token id", token.id);
    assertIdentifier("theme CSS variable", token.variable);
    assertString("theme token label", token.label);
    if (typeof token.description !== "string" || !TOKEN_TYPES.has(token.type)) {
        throw new ContentValidationError("theme", `invalid token metadata: ${token.id}`);
    }
    for (const [mode, value] of Object.entries(token.defaults ?? {})) {
        if (mode !== "light" && mode !== "dark") {
            throw new ContentValidationError("theme", `invalid default mode for token: ${token.id}`);
        }
        assertCssValue(token.id, value);
    }

    if (source.owner?.kind !== "integration") {
        if (token.id.startsWith("integration-") || token.variable.startsWith("integration-")) {
            throw new ContentValidationError("theme", `reserved integration token namespace: ${token.id}`);
        }
        return;
    }
    const expectedPrefix = `integration-${source.owner.integrationId}-`;
    if (token.id !== token.variable || !token.id.startsWith(expectedPrefix)) {
        throw new ContentValidationError("theme", `token name is not derived for integration: ${token.id}`);
    }
    if (!token.defaults?.light?.trim()) {
        throw new ContentValidationError("theme", `integration token has no light default: ${token.id}`);
    }
    if (token.defaults.dark !== undefined && !token.defaults.dark.trim()) {
        throw new ContentValidationError("theme", `integration token has an empty dark default: ${token.id}`);
    }
}

function assertCssValue(tokenId: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || /[;{}\u0000-\u001f]/.test(value)) {
        throw new ContentValidationError("theme", `invalid CSS value for token: ${tokenId}`);
    }
    if (/var\s*\(\s*(?!--)/i.test(value)) {
        throw new ContentValidationError("theme", `invalid CSS variable reference for token: ${tokenId}`);
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

function assertString(field: string, value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new ContentValidationError("theme", `${field} must be a string.`);
    }
}
