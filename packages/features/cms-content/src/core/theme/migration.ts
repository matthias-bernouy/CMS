import { defaultThemeSettings } from "cms-content/core/theme/defaults";
import { allTokens } from "cms-content/core/theme/tokens";
import type { ThemeSettings, ThemeSource } from "cms-content/interfaces/theme";

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

function isColorValue(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$|var\(--)/i.test(
        value,
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

type CategoryTarget = {
    sourceId: string;
    sourceLabel: string;
    supportsModes: boolean;
    categoryId: string;
    categoryLabel: string;
    description: string;
};

function categoryForVariable(settings: ThemeSettings, variable: string): ThemeSource["categories"][number] {
    const target = variableCategory(variable);
    let source = settings.sources.find((item) => item.id === target.sourceId);
    if (!source) {
        source = {
            id: target.sourceId,
            label: target.sourceLabel,
            supportsModes: target.supportsModes,
            categories: [],
        };
        settings.sources.push(source);
    }
    let result = source.categories.find((item) => item.id === target.categoryId);
    if (!result) {
        result = { id: target.categoryId, label: target.categoryLabel, description: target.description, tokens: [] };
        source.categories.push(result);
    }
    return result;
}

function variableCategory(variable: string): CategoryTarget {
    if (/^(success|warning|danger|info)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "feedback", "Feedback", "Colors used for semantic states.");
    }
    if (/^(primary|secondary|link)(-|$)/.test(variable)) {
        return target(
            "colors",
            "Colors",
            true,
            "brand",
            "Brand",
            "Primary choices for calls to action and highlights.",
        );
    }
    if (/^(text|ctx-fg)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "text", "Text", "Readable foreground colors.");
    }
    if (/^(bg|border|ctx-bg|ctx-border|divider|image)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "surfaces", "Surfaces", "The page canvas, cards and their borders.");
    }
    if (/^(font|line-height|letter-spacing)(-|$)/.test(variable)) {
        const scale = /^(font-size|line-height|letter-spacing)(-|$)/.test(variable);
        return target(
            "typography",
            "Typography",
            false,
            scale ? "text-scale" : "font-families",
            scale ? "Text scale" : "Font families",
            scale ? "Shared type sizes and rhythm." : "Fonts applied to headings and body copy.",
        );
    }
    if (/^(space|p9r-space|gap|padding|margin)(-|$)/.test(variable)) {
        return target("spacing", "Spacing", false, "spacing-scale", "Spacing scale", "Shared spacing steps.");
    }
    if (/^(content-width|wide-width|p9r-container|max-width|min-width|container)(-|$)/.test(variable)) {
        return target("spacing", "Spacing", false, "layout", "Layout", "Widths and page rhythm.");
    }
    if (/^(radius|p9r-radius)(-|$)/.test(variable)) {
        return target(
            "shape",
            "Shape & effects",
            false,
            "corners",
            "Corners",
            "Rounding applied to controls and cards.",
        );
    }
    if (/^(shadow|ctx-shadow)(-|$)/.test(variable)) {
        return target(
            "shape",
            "Shape & effects",
            false,
            "elevation",
            "Elevation",
            "Shadows used to separate surfaces.",
        );
    }
    if (/^(duration|transition|easing)(-|$)/.test(variable)) {
        return target(
            "shape",
            "Shape & effects",
            false,
            "motion",
            "Motion",
            "Shared transition durations and easing values.",
        );
    }
    return target("other", "Other", false, "general", "General", "Site-specific design tokens.");
}

function target(
    sourceId: string,
    sourceLabel: string,
    supportsModes: boolean,
    categoryId: string,
    categoryLabel: string,
    description: string,
): CategoryTarget {
    return { sourceId, sourceLabel, supportsModes, categoryId, categoryLabel, description };
}
