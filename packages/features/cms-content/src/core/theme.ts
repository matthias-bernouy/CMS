import type {
    ThemeDefinition,
    ThemeSettings,
    ThemeSource,
    ThemeToken,
} from "cms-content/interfaces/theme";
import { ContentValidationError } from "cms-content/core/errors";

const DEFAULT_VALUES: Record<string, string> = {
    "primary-base": "#16634d",
    "primary-contrasted": "#ffffff",
    "secondary-base": "#e7eee9",
    "secondary-contrasted": "#17362c",
    "bg-base": "#f9f7f1",
    "bg-surface": "#ffffff",
    "border-default": "#dfddd4",
    "text-main": "#26261f",
    "text-muted": "#6d6b63",
    "success-base": "#21865f",
    "warning-base": "#b7791f",
    "danger-base": "#c4473d",
    "font-heading": "Georgia, serif",
    "font-body": "Inter, system-ui, sans-serif",
    "font-size-body": "1rem",
    "font-size-display": "3.5rem",
    "space-sm": ".5rem",
    "space-md": "1rem",
    "space-xl": "3rem",
    "content-width": "68rem",
    "wide-width": "82rem",
    "radius-control": ".25rem",
    "radius-card": ".5rem",
    "shadow-soft": "0 2px 10px rgb(18 30 24 / .08)",
};

export function defaultThemeSettings(): ThemeSettings {
    const sources: ThemeSource[] = [
        source("colors", "Colors", true, [
            category("brand", "Brand", "Primary choices for calls to action and highlights.", [
                token("primary-base", "Primary", "Buttons and links", "color"),
                token("primary-contrasted", "Primary text", "Text placed on primary", "color"),
                token("secondary-base", "Secondary", "Secondary controls", "color"),
                token("secondary-contrasted", "Secondary text", "Text placed on secondary", "color"),
            ]),
            category("surfaces", "Surfaces", "The page canvas, cards and their borders.", [
                token("bg-base", "Page background", "Main canvas", "color"),
                token("bg-surface", "Surface", "Cards and panels", "color"),
                token("border-default", "Border", "Dividers and controls", "color"),
            ]),
            category("text", "Text", "Readable foreground colors.", [
                token("text-main", "Text", "Primary copy", "color"),
                token("text-muted", "Muted text", "Secondary copy", "color"),
            ]),
            category("feedback", "Feedback", "Colors used for semantic states.", [
                token("success-base", "Success", "Successful operations", "color"),
                token("warning-base", "Warning", "Warnings and cautions", "color"),
                token("danger-base", "Danger", "Errors and destructive actions", "color"),
            ]),
        ]),
        source("typography", "Typography", false, [
            category("font-families", "Font families", "Fonts applied to headings and body copy.", [
                token("font-heading", "Heading font", "Titles and headings", "value"),
                token("font-body", "Body font", "Paragraphs and controls", "value"),
            ]),
            category("text-scale", "Text scale", "Shared text sizes used across the site.", [
                token("font-size-body", "Body size", "Default text", "value"),
                token("font-size-display", "Display size", "Large headings", "value"),
            ]),
        ]),
        source("spacing", "Spacing", false, [
            category("spacing-scale", "Spacing scale", "Shared spacing steps.", [
                token("space-sm", "Compact", "Inline gaps", "value"),
                token("space-md", "Default", "Default block gap", "value"),
                token("space-xl", "Generous", "Section spacing", "value"),
            ]),
            category("layout", "Layout", "Widths and page rhythm.", [
                token("content-width", "Content width", "Readable content", "value"),
                token("wide-width", "Wide width", "Wide page sections", "value"),
            ]),
        ]),
        source("shape", "Shape & effects", false, [
            category("corners", "Corners", "Rounding applied to controls and cards.", [
                token("radius-control", "Control radius", "Inputs and buttons", "value"),
                token("radius-card", "Card radius", "Panels and cards", "value"),
            ]),
            category("elevation", "Elevation", "Shadows used to separate surfaces.", [
                token("shadow-soft", "Soft shadow", "Subtle elevation", "value"),
            ]),
            category("motion", "Motion", "Shared transition durations and easing values.", []),
        ]),
    ];
    const theme: ThemeDefinition = {
        id: "default",
        name: "Default theme",
        values: { light: { ...DEFAULT_VALUES }, dark: {} },
    };
    return { activeThemeId: theme.id, sources, themes: [theme] };
}

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
        if (allTokens(settings).some((item) => item.id === token.id || item.variable === token.variable)) continue;
        categoryForVariable(settings, token.variable).tokens.push(token);
    }
    migrateBodyTextColor(settings);
    return settings;
}

export function generateThemeCss(settings: ThemeSettings | undefined): string {
    if (!settings) return "";
    const theme = settings.themes.find((item) => item.id === settings.activeThemeId);
    if (!theme) return "";
    const variables = new Map(allTokens(settings).map((item) => [item.id, item.variable]));
    const light = declarations(theme.values.light, variables);
    const dark = declarations(theme.values.dark, variables);
    const chunks: string[] = [];
    if (light) chunks.push(`:root {\n${light}\n}`);
    if (dark) {
        chunks.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${indent(dark, "  ")}\n  }\n}`);
        chunks.push(`:root[data-theme-mode="dark"] {\n${dark}\n}`);
    }
    return chunks.join("\n\n");
}

export function validateThemeSettings(settings: ThemeSettings): ThemeSettings {
    if (!settings || typeof settings !== "object") throw new ContentValidationError("theme", "expected an object.");
    const tokenIds = new Set<string>();
    const variables = new Set<string>();
    for (const item of allTokens(settings)) {
        assertIdentifier("theme token id", item.id);
        assertIdentifier("theme CSS variable", item.variable);
        if (tokenIds.has(item.id)) throw new ContentValidationError("theme", `duplicate token id: ${item.id}`);
        if (variables.has(item.variable)) throw new ContentValidationError("theme", `duplicate CSS variable: ${item.variable}`);
        tokenIds.add(item.id);
        variables.add(item.variable);
    }
    const themeIds = new Set<string>();
    for (const theme of settings.themes) {
        assertIdentifier("theme id", theme.id);
        if (themeIds.has(theme.id)) throw new ContentValidationError("theme", `duplicate theme id: ${theme.id}`);
        themeIds.add(theme.id);
        for (const mode of ["light", "dark"] as const) {
            for (const [tokenId, value] of Object.entries(theme.values?.[mode] ?? {})) {
                if (!tokenIds.has(tokenId)) throw new ContentValidationError("theme", `unknown token: ${tokenId}`);
                if (typeof value !== "string" || /[;{}\u0000-\u001f]/.test(value)) {
                    throw new ContentValidationError("theme", `invalid CSS value for token: ${tokenId}`);
                }
            }
        }
    }
    if (!themeIds.has(settings.activeThemeId)) throw new ContentValidationError("theme", "active theme does not exist.");
    return structuredClone(settings);
}

export function allTokens(settings: ThemeSettings): ThemeToken[] {
    return settings.sources.flatMap((item) => item.categories.flatMap((entry) => entry.tokens));
}

function declarations(values: Record<string, string>, variables: Map<string, string>): string {
    return Object.entries(values).flatMap(([id, value]) => {
        const variable = variables.get(id);
        return variable && value.trim() ? [`  --${variable}: ${value.trim()};`] : [];
    }).join("\n");
}

function indent(value: string, prefix: string): string {
    return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function assertIdentifier(field: string, value: string): void {
    if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new ContentValidationError("theme", `${field} is invalid: ${value}`);
}

function source(id: string, label: string, supportsModes: boolean, categories: ThemeSource["categories"]): ThemeSource {
    return { id, label, supportsModes, categories };
}

function category(id: string, label: string, description: string, tokens: ThemeToken[]): ThemeSource["categories"][number] {
    return { id, label, description, tokens };
}

function token(id: string, label: string, description: string, type: ThemeToken["type"]): ThemeToken {
    return { id, variable: id, label, description, type };
}

function capitalize(value: string): string {
    return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function looksLikeColor(variable: string, value: string): boolean {
    if (isColorValue(value)) return true;
    return /(^|[-])(color|bg|background|text|border|primary|secondary|success|warning|danger|info|foreground|contrasted)([-]|$)/.test(variable);
}

function isColorValue(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$|var\(--)/i.test(value);
}

function migrateBodyTextColor(settings: ThemeSettings): void {
    const source = settings.sources.find((item) => item.id === "typography");
    const category = source?.categories.find((item) => item.id === "text-scale");
    const index = category?.tokens.findIndex((item) => item.variable === "text-body") ?? -1;
    if (!category || index < 0) return;
    const token = category.tokens[index]!;
    const isColor = settings.themes.some((theme) => isColorValue(theme.values.light[token.id] ?? ""));
    if (!isColor) return;
    category.tokens.splice(index, 1);
    token.type = "color";
    if (token.label === "Body size") token.label = "Body text";
    if (token.description === "Default text") token.description = "Default body copy color";
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
        source = { id: target.sourceId, label: target.sourceLabel, supportsModes: target.supportsModes, categories: [] };
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
        return target("colors", "Colors", true, "brand", "Brand", "Primary choices for calls to action and highlights.");
    }
    if (/^(text|ctx-fg)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "text", "Text", "Readable foreground colors.");
    }
    if (/^(bg|border|ctx-bg|ctx-border|divider|image)(-|$)/.test(variable)) {
        return target("colors", "Colors", true, "surfaces", "Surfaces", "The page canvas, cards and their borders.");
    }
    if (/^(font|line-height|letter-spacing)(-|$)/.test(variable)) {
        const scale = /^(font-size|line-height|letter-spacing)(-|$)/.test(variable);
        return target("typography", "Typography", false, scale ? "text-scale" : "font-families", scale ? "Text scale" : "Font families", scale ? "Shared type sizes and rhythm." : "Fonts applied to headings and body copy.");
    }
    if (/^(space|p9r-space|gap|padding|margin)(-|$)/.test(variable)) {
        return target("spacing", "Spacing", false, "spacing-scale", "Spacing scale", "Shared spacing steps.");
    }
    if (/^(content-width|wide-width|p9r-container|max-width|min-width|container)(-|$)/.test(variable)) {
        return target("spacing", "Spacing", false, "layout", "Layout", "Widths and page rhythm.");
    }
    if (/^(radius|p9r-radius)(-|$)/.test(variable)) {
        return target("shape", "Shape & effects", false, "corners", "Corners", "Rounding applied to controls and cards.");
    }
    if (/^(shadow|ctx-shadow)(-|$)/.test(variable)) {
        return target("shape", "Shape & effects", false, "elevation", "Elevation", "Shadows used to separate surfaces.");
    }
    if (/^(duration|transition|easing)(-|$)/.test(variable)) {
        return target("shape", "Shape & effects", false, "motion", "Motion", "Shared transition durations and easing values.");
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
