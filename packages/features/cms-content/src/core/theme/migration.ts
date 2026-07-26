import { defaultThemeSettings } from "cms-content/core/theme/defaults";
import { normalizeThemeCatalog } from "cms-content/core/theme/migration/catalog";
import { allTokens } from "cms-content/core/theme/tokens";
import type { ThemeSettings, ThemeToken, ThemeTokenType } from "cms-content/interfaces/theme";
import { categoryForVariable, isColorValue } from "cms-content/core/theme/migration/categories";

/** Seed a structured theme from an existing free-form stylesheet. */
export function themeSettingsFromCss(css: string, base = defaultThemeSettings()): ThemeSettings {
    const settings = structuredClone(base);
    const theme = settings.themes.find((item) => item.id === settings.activeThemeId) ?? settings.themes[0]!;
    const byVariable = new Map(allTokens(settings).map((item) => [item.variable, item]));
    const importedTokens = new Set<string>();

    for (const match of css.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;{}]+)\s*;/gi)) {
        const variable = match[1]!.toLowerCase();
        const value = match[2]!.trim();
        let token = byVariable.get(variable);
        if (!token) {
            token = {
                id: variable,
                variable,
                label: variable.split("-").map(capitalize).join(" "),
                description: `Imported from --${variable}`,
                type: inferredTokenType(variable, value, byVariable),
            };
            categoryForVariable(settings, variable).tokens.push(token);
            byVariable.set(variable, token);
            importedTokens.add(token.id);
        }
        theme.values.light[token.id] = value;
    }
    assignReferencedTokenTypes(importedTokens, byVariable, theme.values.light);
    return organizeThemeSettings(settings);
}

/** Move tokens created by the former legacy importer into semantic groups. */
export function organizeThemeSettings(input: ThemeSettings): ThemeSettings {
    const settings = structuredClone(input);
    const legacySources = settings.sources.filter((item) => item.id === "existing-css");
    settings.sources = settings.sources.filter((item) => item.id !== "existing-css");
    for (const token of legacySources.flatMap((item) => item.categories.flatMap((entry) => entry.tokens))) {
        if (allTokens(settings).some((item) => item.id === token.id || item.variable === token.variable)) {
            continue;
        }
        categoryForVariable(settings, token.variable).tokens.push(token);
    }
    normalizeThemeCatalog(settings);
    migrateBodyTextColor(settings);
    return settings;
}

function capitalize(value: string): string {
    return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function looksLikeColor(variable: string, value: string): boolean {
    if (!/^\s*var\(/i.test(value) && isColorValue(value)) {
        return true;
    }
    return /(^|[-])(color|bg|background|text|border|primary|secondary|success|warning|danger|info|foreground|contrasted)([-]|$)/.test(
        variable,
    );
}

function inferredTokenType(
    variable: string,
    value: string,
    byVariable: Map<string, { type: ThemeTokenType }>,
): ThemeTokenType {
    const reference = /^\s*var\(\s*--([a-z][a-z0-9-]*)\s*\)\s*$/i.exec(value)?.[1]?.toLowerCase();
    const referencedType = reference ? byVariable.get(reference)?.type : undefined;
    if (referencedType) {
        return referencedType;
    }
    if (/^(font-family|font-(heading|body))(-|$)/.test(variable)) {
        return "font-family";
    }
    if (/^(shadow|ctx-shadow)(-|$)/.test(variable)) {
        return "shadow";
    }
    if (
        /^(font-size|space|p9r-space|gap|padding|margin|radius|p9r-radius|content-width|wide-width|max-width|min-width)(-|$)/.test(
            variable,
        )
    ) {
        return "length";
    }
    return looksLikeColor(variable, value) ? "color" : "value";
}

function assignReferencedTokenTypes(
    importedTokenIds: Set<string>,
    byVariable: Map<string, ThemeToken>,
    values: Record<string, string>,
): void {
    const resolving = new Set<string>();
    const resolved = new Set<string>();
    const resolve = (token: ThemeToken): void => {
        if (resolved.has(token.id) || resolving.has(token.id)) {
            return;
        }
        resolving.add(token.id);
        const reference = /^\s*var\(\s*--([a-z][a-z0-9-]*)/i.exec(values[token.id] ?? "")?.[1]?.toLowerCase();
        const target = reference ? byVariable.get(reference) : undefined;
        if (target && target.id !== token.id) {
            if (importedTokenIds.has(target.id)) {
                resolve(target);
            }
            token.type = target.type;
        }
        resolving.delete(token.id);
        resolved.add(token.id);
    };
    for (const token of byVariable.values()) {
        if (importedTokenIds.has(token.id)) {
            resolve(token);
        }
    }
}

function migrateBodyTextColor(settings: ThemeSettings): void {
    const source = settings.sources.find((item) => item.id === "typography");
    const category = source?.categories.find((item) => item.id === "text-scale");
    const index = category?.tokens.findIndex((item) => item.variable === "text-body") ?? -1;
    if (!category || index < 0) {
        return;
    }
    const token = category.tokens[index]!;
    const isColor = settings.themes.some((theme) => isColorValue(theme.values.light[token.id] ?? ""));
    if (!isColor) {
        return;
    }
    category.tokens.splice(index, 1);
    token.type = "color";
    if (token.label === "Body size") {
        token.label = "Body text";
    }
    if (token.description === "Default text") {
        token.description = "Default body copy color";
    }
    categoryForVariable(settings, "text-body").tokens.push(token);
}
