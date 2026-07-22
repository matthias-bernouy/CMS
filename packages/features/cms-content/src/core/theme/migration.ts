import { defaultThemeSettings } from "cms-content/core/theme/defaults";
import { allTokens } from "cms-content/core/theme/tokens";
import type { ThemeSettings } from "cms-content/interfaces/theme";
import { categoryForVariable, isColorValue } from "cms-content/core/theme/migrationCategories";

/** Seed a structured theme from an existing free-form stylesheet. */
export function themeSettingsFromCss(css: string, base = defaultThemeSettings()): ThemeSettings {
    const settings = structuredClone(base);
    const theme = settings.themes.find((item) => item.id === settings.activeThemeId) ?? settings.themes[0]!;
    const byVariable = new Map(allTokens(settings).map((item) => [item.variable, item]));

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
                type: looksLikeColor(variable, value) ? "color" : "value",
            };
            categoryForVariable(settings, variable).tokens.push(token);
            byVariable.set(variable, token);
        }
        theme.values.light[token.id] = value;
    }
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
    migrateBodyTextColor(settings);
    return settings;
}

function capitalize(value: string): string {
    return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function looksLikeColor(variable: string, value: string): boolean {
    if (isColorValue(value)) {
        return true;
    }
    return /(^|[-])(color|bg|background|text|border|primary|secondary|success|warning|danger|info|foreground|contrasted)([-]|$)/.test(
        variable,
    );
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
